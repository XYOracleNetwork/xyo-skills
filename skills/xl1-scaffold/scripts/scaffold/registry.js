async function fetchJson(url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok)
        throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
}
async function fetchLatestPackument(pkg) {
    const encoded = pkg.replaceAll('/', '%2F');
    return fetchJson(`https://registry.npmjs.org/${encoded}/latest`);
}
async function fetchLatestVersion(pkg) {
    const body = await fetchLatestPackument(pkg);
    if (!body.version)
        throw new Error(`no version in registry response for ${pkg}`);
    return body.version;
}
// Resolves a list of package names to a { name → version-spec } map.
// Packages present in `pins` use the pinned value verbatim; the rest get
// `^<latest>` from the npm registry. Pins are written as-is so callers
// retain full control over the specifier (`~1.2.3`, `1.2.3`, `>=1 <2`, etc.).
export async function resolveVersions(packages, pins = {}) {
    const entries = await Promise.all(packages.map(async (pkg) => {
        if (pkg in pins)
            return [pkg, pins[pkg]];
        return [pkg, `^${await fetchLatestVersion(pkg)}`];
    }));
    return Object.fromEntries(entries);
}
// @xyo-network/sdk-js and xl1-sdk declare their runtime deps (ajv, zod, ethers
// and dozens of @xyo-network/* sub-packages) as peer dependencies. pnpm's
// auto-install-peers setting does not reliably pull the right major versions,
// so we walk peer deps one level deep and add them to the direct dep list.
// Filters out anything already in our dev deps or the direct list.
export async function expandWithPeers(directDeps, excludes = []) {
    const excludeSet = new Set([...excludes, ...directDeps]);
    const peers = new Set();
    const packuments = await Promise.all(directDeps.map(fetchLatestPackument));
    for (const p of packuments) {
        for (const peer of Object.keys(p.peerDependencies ?? {})) {
            if (!excludeSet.has(peer))
                peers.add(peer);
        }
    }
    return [...directDeps, ...peers];
}
export async function resolveLatestPnpmByMajor(major) {
    const body = await fetchJson('https://registry.npmjs.org/pnpm');
    const versions = body.versions;
    const candidates = Object.keys(versions ?? {}).filter(v => v.startsWith(`${major}.`) && !v.includes('-'));
    if (candidates.length === 0)
        throw new Error(`no stable pnpm ${major}.x on registry`);
    candidates.sort((a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
    });
    return candidates.at(-1);
}
//# sourceMappingURL=registry.js.map