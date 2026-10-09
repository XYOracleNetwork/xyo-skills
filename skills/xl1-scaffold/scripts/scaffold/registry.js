const REGISTRY = 'https://registry.npmjs.org';
// pnpm 11+ already defaults to 1440 minutes; the generated project sets it
// explicitly (which also turns on minimumReleaseAgeStrict, so pnpm gates an
// immature pick instead of silently allow-listing it). XYO's own scopes are
// exempt — same as the upstream ariestools / XYO repos — so a same-day SDK
// release can be scaffolded against.
export const RELEASE_AGE_POLICY = {
    minutes: 1440,
    exclude: ['@ariestools/*', '@xyo-network/*'],
};
const STABLE_VERSION = /^\d+\.\d+\.\d+$/;
function versionParts(version) {
    return version.split('.').map(Number);
}
// Compares two stable `x.y.z` versions. The scaffold only ever resolves stable
// releases, so prerelease/build ordering is out of scope.
export function compareVersions(a, b) {
    const pa = versionParts(a);
    const pb = versionParts(b);
    return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
}
function globToRegExp(pattern) {
    const escaped = pattern.replaceAll(/[.+?^${}()|[\]\\]/g, String.raw `\$&`).replaceAll('*', '.*');
    return new RegExp(`^${escaped}$`);
}
export function isReleaseAgeExempt(pkg, policy) {
    return policy.exclude.some(pattern => globToRegExp(pattern).test(pkg));
}
export function releaseAgeCutoff(policy, now = new Date()) {
    return new Date(now.getTime() - (policy.minutes * 60_000));
}
// Picks the newest stable version that `accept` allows (default: at most
// `dist-tags.latest`) and that was published at or before `cutoff`.
// Deprecated versions are skipped unless nothing else qualifies. When no
// candidate is old enough, falls back to the newest candidate, flagged
// `immature`.
export function pickVersion(packument, options = {}) {
    const latest = packument['dist-tags']?.latest;
    const accept = options.accept ?? ((v) => latest !== undefined && compareVersions(v, latest) <= 0);
    const versions = packument.versions ?? {};
    const stable = Object.keys(versions).filter(v => STABLE_VERSION.test(v) && accept(v));
    const live = stable.filter(v => !versions[v].deprecated);
    const candidates = (live.length > 0 ? live : stable).toSorted((a, b) => compareVersions(b, a));
    if (candidates.length === 0)
        throw new Error('no stable version matches');
    const { cutoff } = options;
    if (!cutoff)
        return { version: candidates[0], immature: false };
    const time = packument.time ?? {};
    const mature = candidates.find((v) => {
        const published = time[v];
        return published !== undefined && Date.parse(published) <= cutoff.getTime();
    });
    return mature === undefined ? { version: candidates[0], immature: true } : { version: mature, immature: false };
}
function encodeName(pkg) {
    return pkg.replaceAll('/', '%2F');
}
async function fetchJson(url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok)
        throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
}
const resolutionCache = new Map();
async function resolveUncached(pkg, policy) {
    if (isReleaseAgeExempt(pkg, policy)) {
        const manifest = await fetchJson(`${REGISTRY}/${encodeName(pkg)}/latest`);
        if (!manifest.version)
            throw new Error(`no version in registry response for ${pkg}`);
        return { manifest, picked: { version: manifest.version, immature: false } };
    }
    const packument = await fetchJson(`${REGISTRY}/${encodeName(pkg)}`);
    let picked;
    try {
        picked = pickVersion(packument, { cutoff: releaseAgeCutoff(policy) });
    }
    catch (err) {
        throw new Error(`cannot resolve a version of ${pkg}`, { cause: err });
    }
    return {
        latest: packument['dist-tags']?.latest, manifest: packument.versions?.[picked.version] ?? {}, picked,
    };
}
function resolvePackage(pkg, policy) {
    const key = `${pkg}\u0000${policy.minutes}\u0000${policy.exclude.join(',')}`;
    let pending = resolutionCache.get(key);
    if (!pending) {
        pending = resolveUncached(pkg, policy);
        resolutionCache.set(key, pending);
    }
    return pending;
}
// Resolves a list of package names to a { name → version-spec } map.
// Packages present in `pins` use the pinned value verbatim; the rest get
// `^<version>` where <version> is the newest release the policy accepts
// (`latest` for exempt scopes, otherwise the newest stable version at most
// `latest` that is old enough). Pins are written as-is so callers retain full
// control over the specifier (`~1.2.3`, `1.2.3`, `>=1 <2`, etc.); pnpm applies
// the age rule to them itself.
export async function resolveVersions(packages, pins = {}, policy = RELEASE_AGE_POLICY) {
    const immature = [];
    const heldBack = [];
    const entries = await Promise.all(packages.map(async (pkg) => {
        const pin = pins[pkg];
        if (pin !== undefined)
            return [pkg, pin];
        const { picked, latest } = await resolvePackage(pkg, policy);
        if (picked.immature)
            immature.push(`${pkg}@${picked.version}`);
        if (latest !== undefined && latest !== picked.version)
            heldBack.push(`${pkg} ${picked.version} (latest ${latest})`);
        return [pkg, `^${picked.version}`];
    }));
    return {
        specs: Object.fromEntries(entries), immature: immature.toSorted(), heldBack: heldBack.toSorted(),
    };
}
// @xyo-network/sdk and xl1-sdk declare their runtime deps (ajv, zod, ethers
// and dozens of @xyo-network/* sub-packages) as peer dependencies. pnpm's
// auto-install-peers setting does not reliably pull the right major versions,
// so we walk peer deps one level deep and add them to the direct dep list.
// Filters out anything already in our dev deps or the direct list. Peers are
// read from the version the policy picks, not blindly from `latest`.
//
// One level is deliberate but not sufficient on its own: a peer declared by a
// package reached through a regular (non-peer) dependency edge — e.g. ajv,
// declared by @xyo-network/sdk-protocol-core — is invisible to this walk no
// matter how deep it goes on peers alone. Those go in a preset's `deps.extras`.
export async function expandWithPeers(directDeps, excludes = [], policy = RELEASE_AGE_POLICY) {
    const excludeSet = new Set([...excludes, ...directDeps]);
    const peers = new Set();
    const resolutions = await Promise.all(directDeps.map(pkg => resolvePackage(pkg, policy)));
    for (const { manifest } of resolutions) {
        for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
            if (!excludeSet.has(peer))
                peers.add(peer);
        }
    }
    return [...directDeps, ...peers];
}
// Newest stable pnpm in `major` that the policy accepts, capped at the major's
// dist-tag (`latest-<major>`, or `latest` when it is on that major) so a
// release still on `next-<major>` is never pinned. pnpm itself is not exempt:
// a project pinned to a too-new pnpm makes every pnpm that switches to it
// record an approval in pnpm-workspace.yaml.
export function pickPnpmVersion(packument, major, cutoff) {
    const tags = packument['dist-tags'] ?? {};
    const latest = tags.latest;
    const cap = tags[`latest-${major}`] ?? (latest?.split('.', 1)[0] === major ? latest : undefined);
    return pickVersion(packument, {
        cutoff,
        accept: v => v.split('.', 1)[0] === major && (cap === undefined || compareVersions(v, cap) <= 0),
    });
}
export async function resolvePnpmVersion(major, policy = RELEASE_AGE_POLICY) {
    const packument = await fetchJson(`${REGISTRY}/pnpm`);
    try {
        return pickPnpmVersion(packument, major, releaseAgeCutoff(policy));
    }
    catch (err) {
        throw new Error(`no stable pnpm ${major}.x on registry`, { cause: err });
    }
}
//# sourceMappingURL=registry.js.map