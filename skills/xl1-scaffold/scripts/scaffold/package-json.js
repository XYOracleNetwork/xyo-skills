export function buildPackageJson(args) {
    // Workspace members inherit packageManager from the root — emitting it here
    // would cause corepack-version drift between root and members.
    return {
        name: args.name,
        version: '0.1.0',
        private: true,
        type: 'module',
        ...args.template.packageJson,
        ...(args.workspaceMember ? {} : { packageManager: args.packageManager }),
        scripts: args.template.scripts,
        dependencies: args.dependencies,
        devDependencies: args.devDependencies,
    };
}
//# sourceMappingURL=package-json.js.map