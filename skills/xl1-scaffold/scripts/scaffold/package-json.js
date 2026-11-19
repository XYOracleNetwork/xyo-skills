// `@xyo-network/sdk` declares engines `node: ^26` and `@xyo-network/xl1-sdk`
// `>=26`. Written into every generated package.json — workspace members
// included, because neither npm nor pnpm inherits `engines` from the
// workspace root, and a member is what a host (Vercel, a container build)
// actually runs.
export const NODE_ENGINE_RANGE = '>=26';
// `devEngines` is how the toolchain pins the versions a *developer* must use,
// and `xy repo lint` reads it. `engines` above stays: it is what a host reads
// at install time, and the two are not interchangeable.
export const NODE_DEV_ENGINE_RANGE = '>=26.0.0 <27.0.0';
// The pnpm floor has to be the exact version the scaffold resolved, not a
// looser `>=<major>.0.0`. A lower floor lets an older pnpm already on the
// machine satisfy the range, and that pnpm then rewrites the
// packageManagerDependencies this scaffold just locked — which is what
// `pnpm install --frozen-lockfile` fails on in CI.
function pnpmDevEngineRange(packageManager) {
    const version = packageManager.slice(packageManager.indexOf('@') + 1).split('+', 1)[0];
    const major = /^(\d+)/.exec(version)?.[1];
    return major === undefined ? version : `>=${version} <${String(Number(major) + 1)}.0.0`;
}
export function buildDevEngines(packageManager) {
    return {
        runtime: {
            name: 'node', onFail: 'error', version: NODE_DEV_ENGINE_RANGE,
        },
        packageManager: {
            name: 'pnpm', onFail: 'error', version: pnpmDevEngineRange(packageManager),
        },
    };
}
export function buildPackageJson(args) {
    // Workspace members inherit packageManager and devEngines from the root —
    // emitting either here would cause pnpm-version drift between root and
    // members, and `xy repo lint` expects both at the root only.
    return {
        name: args.name,
        version: '0.1.0',
        private: true,
        type: 'module',
        ...args.template.packageJson,
        ...(args.workspaceMember
            ? {}
            : { packageManager: args.packageManager, devEngines: buildDevEngines(args.packageManager) }),
        engines: { node: NODE_ENGINE_RANGE },
        ...(args.workspaceMember ? {} : { xl1: { network: args.network } }),
        scripts: args.template.scripts,
        dependencies: args.dependencies,
        devDependencies: args.devDependencies,
    };
}
//# sourceMappingURL=package-json.js.map