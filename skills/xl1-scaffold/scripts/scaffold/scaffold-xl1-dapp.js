#!/usr/bin/env node
// Scaffolds an XL1 application — either a React + Vite dApp or a Node.js
// service/CLI.
//
// Usage:
//   scaffold-xl1 [target-dir] [--template=react|node] [--force] [--no-install]
//
// Defaults: target-dir=src, template=react.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';
import { nodeTemplate, reactTemplate, xl1MonorepoTemplate, xl1ServiceTemplate, xl1SharedTemplate, } from './presets/index.js';
import { expandWithPeers, resolveLatestPnpmByMajor, resolveVersions, } from './registry.js';
import { copyTemplateFile, ensureTargetDir, resolveTemplatesRoot, runPnpmStep, writeJson, } from './writer.js';
const TEMPLATES = {
    'react': reactTemplate,
    'node': nodeTemplate,
    'xl1-service': xl1ServiceTemplate,
    'xl1-monorepo': xl1MonorepoTemplate,
    'xl1-shared': xl1SharedTemplate,
};
// Files a workspace member should NOT emit — owned by the workspace root.
// Only .gitignore is on this list: the root's .gitignore covers descendants,
// and a per-package one would just duplicate patterns and cause merge noise.
//
// .env.example is intentionally NOT filtered. Each sub-package carries its
// own because runtime env loading is package-local: Node's dotenv reads from
// the process cwd (per-service), and Vite reads .env from the Vite project
// root (the package dir, not the workspace root). The per-template
// .env.example also encodes runtime-specific hints (PORT=3001 for the
// express service, VITE_* convention for React) that a generic root file
// can't express.
const WORKSPACE_MEMBER_SKIP_FILES = new Set(['.gitignore']);
// pnpm 11.0.0-rc.2 hits ERR_PNPM_MISSING_TIME on @eslint-react/* and
// @typescript-eslint/* even with resolution-mode=highest set, so the script
// pins pnpm to the latest 10.x via `corepack pnpm@10` and resolves the
// concrete version for package.json's packageManager field at runtime.
const PNPM_MAJOR = '10';
// Supported flag forms (any order relative to each other and to positionals):
//   --force, --no-install             boolean switches
//   --template=node, --template node  option with value (also --template's short form -t)
//   --target=my-app, --target my-app  same; target is also acceptable as positional[0]
//   --workspace-member                this scaffold target is a sub-package inside an existing
//                                     pnpm workspace; emit a scoped package name, drop
//                                     packageManager + .gitignore, skip the verification chain
//   --workspace-scope=<scope>         explicit scope (e.g. `@my-app`) for the resulting package
//                                     name. If omitted with --workspace-member, derived from
//                                     the workspace root's package.json name.
function parseArgs(argv) {
    const { values, positionals } = parseNodeArgs({
        args: argv,
        allowPositionals: true,
        options: {
            'template': {
                type: 'string', short: 't', default: 'react',
            },
            'target': { type: 'string' },
            'force': { type: 'boolean', default: false },
            'no-install': { type: 'boolean', default: false },
            'workspace-member': { type: 'boolean', default: false },
            'workspace-scope': { type: 'string' },
        },
    });
    return {
        target: values.target ?? positionals[0] ?? 'src',
        templateName: values.template,
        force: values.force,
        noInstall: values['no-install'],
        workspaceMember: values['workspace-member'],
        workspaceScope: values['workspace-scope'],
    };
}
function buildTsconfig(template) {
    return {
        extends: template.tsconfig.extends,
        compilerOptions: template.tsconfig.compilerOptions,
        include: template.tsconfig.include,
    };
}
// Walks up from `dir` looking for a pnpm-workspace.yaml. Returns the directory
// containing it, or undefined if none found before hitting filesystem root.
function findWorkspaceRoot(start) {
    let dir = path.dirname(start);
    while (dir !== path.dirname(dir)) {
        if (existsSync(path.join(dir, 'pnpm-workspace.yaml')))
            return dir;
        dir = path.dirname(dir);
    }
    return undefined;
}
// Auto-derives a workspace scope from the workspace root's package.json name.
// Throws if no workspace root or no name field.
function deriveWorkspaceScope(target) {
    const wsRoot = findWorkspaceRoot(target);
    if (!wsRoot) {
        throw new Error(`--workspace-member set but no pnpm-workspace.yaml found walking up from ${target}`);
    }
    const rootPkgPath = path.join(wsRoot, 'package.json');
    if (!existsSync(rootPkgPath)) {
        throw new Error(`workspace root at ${wsRoot} is missing package.json — cannot derive --workspace-scope`);
    }
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
    if (!rootPkg.name) {
        throw new Error(`workspace root package.json at ${rootPkgPath} has no "name" field`);
    }
    // If root name is already scoped (`@org/foo`), use the scope alone.
    // Otherwise, treat the whole name as the scope (`foo` → `@foo`).
    return rootPkg.name.startsWith('@') ? rootPkg.name.split('/')[0] : `@${rootPkg.name}`;
}
// Looks for a sibling `packages/shared/package.json` under the workspace root
// and returns its `name` field. Used to auto-wire a `workspace:*` dep on
// shared into newly-scaffolded sub-packages.
function findSharedPackageName(wsRoot) {
    const sharedPkgPath = path.join(wsRoot, 'packages', 'shared', 'package.json');
    if (!existsSync(sharedPkgPath))
        return undefined;
    const pkg = JSON.parse(readFileSync(sharedPkgPath, 'utf8'));
    return pkg.name;
}
function buildPackageJson(args) {
    // Workspace members inherit packageManager from the root — emitting it here
    // would cause corepack-version drift between root and members.
    return {
        name: args.name,
        version: '0.1.0',
        private: true,
        type: 'module',
        ...(args.workspaceMember ? {} : { packageManager: args.packageManager }),
        scripts: args.template.scripts,
        dependencies: args.dependencies,
        devDependencies: args.devDependencies,
    };
}
async function resolveVersionsForTemplate(template) {
    console.log('Resolving dependency graph from npm registry...');
    const runtime = [...template.deps.runtime, ...(template.deps.extras ?? [])];
    const expandedRuntime = await expandWithPeers(runtime, template.deps.dev);
    console.log(`  ${expandedRuntime.length} runtime deps (${template.deps.runtime.length} direct + peers + extras)`);
    const pins = template.deps.versions ?? {};
    const pinCount = Object.keys(pins).length;
    if (pinCount > 0)
        console.log(`  ${pinCount} pinned version(s): ${Object.keys(pins).toSorted().join(', ')}`);
    const [dependencies, devDependencies, pnpmVersion] = await Promise.all([
        resolveVersions(expandedRuntime, pins),
        resolveVersions(template.deps.dev, pins),
        resolveLatestPnpmByMajor(PNPM_MAJOR),
    ]);
    const packageManager = `pnpm@${pnpmVersion}`;
    console.log(`  packageManager: ${packageManager}`);
    return {
        dependencies, devDependencies, packageManager,
    };
}
// Resolve the package's `name` field. Workspace members get a scoped name
// (`@<scope>/<basename>`); standalones use the target dir's basename so the
// generated package.json reflects the project's actual location.
function resolvePackageName(workspaceMember, workspaceScope, target) {
    if (!workspaceMember)
        return path.basename(target);
    const scope = workspaceScope ?? deriveWorkspaceScope(target);
    const name = `${scope}/${path.basename(target)}`;
    console.log(`Workspace member mode: package name = ${name}`);
    return name;
}
// Auto-wire a `workspace:*` dep on the sibling `shared` package when
// scaffolding any workspace member OTHER than xl1-shared itself. The shared
// package only exists if it was scaffolded earlier — if we don't find it,
// skip silently (caller can add the dep manually later).
function addWorkspaceSharedDep(deps, workspaceMember, templateName, target) {
    if (!workspaceMember || templateName === 'xl1-shared')
        return deps;
    const wsRoot = findWorkspaceRoot(target);
    const sharedName = wsRoot ? findSharedPackageName(wsRoot) : undefined;
    if (!sharedName)
        return deps;
    console.log(`  + workspace dep: ${sharedName}@workspace:*`);
    return { ...deps, [sharedName]: 'workspace:*' };
}
function installAndVerify(target, template) {
    runPnpmStep(target, 'Running pnpm install', ['install']);
    runPnpmStep(target, 'Running typecheck', ['typecheck']);
    runPnpmStep(target, 'Running lint', ['lint']);
    runPnpmStep(target, 'Running build', ['build']);
    if (template.smokeTest) {
        runPnpmStep(target, `Running smoke test (pnpm ${template.smokeTest.pnpmScript})`, [template.smokeTest.pnpmScript]);
    }
}
async function main() {
    const { target: targetArg, templateName, force, noInstall, workspaceMember, workspaceScope, } = parseArgs(process.argv.slice(2));
    const template = TEMPLATES[templateName];
    if (!template) {
        throw new Error(`Unknown template: ${templateName}. Available: ${Object.keys(TEMPLATES).join(', ')}`);
    }
    // Prefer INIT_CWD — pnpm sets it to the user's original invocation dir.
    // Without this, running via `pnpm --filter ... run scaffold` resolves
    // relative to the filtered workspace package, not where the user ran from.
    const invocationCwd = process.env.INIT_CWD ?? process.cwd();
    const target = path.resolve(invocationCwd, targetArg);
    const templatesRoot = resolveTemplatesRoot(import.meta.url);
    const packageName = resolvePackageName(workspaceMember, workspaceScope, target);
    console.log(`Scaffolding ${template.description} at: ${target}`);
    ensureTargetDir(target, force);
    const { dependencies, devDependencies, packageManager, } = await resolveVersionsForTemplate(template);
    const finalDeps = addWorkspaceSharedDep(dependencies, workspaceMember, template.name, target);
    writeJson(target, 'package.json', buildPackageJson({
        template, dependencies: finalDeps, devDependencies, packageManager, workspaceMember, name: packageName,
    }));
    if (!template.omitTsconfig)
        writeJson(target, 'tsconfig.json', buildTsconfig(template));
    const filesToCopy = workspaceMember
        ? template.files.filter(f => !WORKSPACE_MEMBER_SKIP_FILES.has(f.dest))
        : template.files;
    for (const f of filesToCopy)
        copyTemplateFile(templatesRoot, f, target);
    // Workspace members skip the install + verification chain — the workspace
    // root's `pnpm install` handles linking, and verification runs there too.
    if (workspaceMember) {
        console.log('\nWorkspace member written. Run `pnpm install` from the workspace root to link + install.');
        return;
    }
    if (noInstall) {
        console.log('\nSkipped install (--no-install).');
        console.log(`Next: cd ${targetArg} && pnpm install && ${template.nextSteps.join(' && ')}`);
        return;
    }
    installAndVerify(target, template);
    console.log('\nScaffold complete. Next:');
    console.log(`  cd ${targetArg}`);
    for (const step of template.nextSteps)
        console.log(`  ${step}`);
}
main().catch((err) => {
    if (err instanceof Error) {
        console.error(err.message);
        if ('cause' in err && err.cause)
            console.error('caused by:', err.cause);
    }
    else {
        console.error(err);
    }
    process.exit(1);
});
//# sourceMappingURL=scaffold-xl1-dapp.js.map