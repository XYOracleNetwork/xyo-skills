#!/usr/bin/env node
// Scaffolds an XL1 app — a React + Vite dApp, a Node.js service/CLI, an
// Express xl1-service, or the pieces of a pnpm monorepo (root + members).
//
// Usage:
//   scaffold-xl1 [target-dir] [--template=react|node|xl1-service|xl1-monorepo|xl1-shared]
//                [--network=mainnet|sequence|local] [--force] [--no-install]
//                [--workspace-member] [--workspace-scope=<scope>]
//
// Defaults: target-dir=src, template=react, network=sequence (a workspace
// member defaults to its root's network).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';
import { DEFAULT_NETWORK, isXl1NetworkId, networkTemplateVars, parseNetwork, XL1_NETWORKS, } from './network.js';
import { buildPackageJson } from './package-json.js';
import { pnpmRunners, pnpmUnavailableMessage, probeWithSpawn, selectPnpmRunner, } from './pnpm-runner.js';
import { nodeTemplate, reactTemplate, xl1MonorepoTemplate, xl1ServiceTemplate, xl1SharedTemplate, } from './presets/index.js';
import { expandWithPeers, RELEASE_AGE_POLICY, resolvePnpmVersion, resolveVersions, } from './registry.js';
import { addReleaseAgeExcludes, buildPnpmWorkspaceYaml } from './workspace-yaml.js';
import { copyTemplateFile, ensureTargetDir, resolveTemplatesRoot, runPnpmStep, writeJson, writeString, } from './writer.js';
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
// (pnpm-workspace.yaml is generated, not copied, and only for non-members.)
//
// .env.example is intentionally NOT filtered. Each sub-package carries its
// own because runtime env loading is package-local: Node's dotenv reads from
// the process cwd (per-service), and Vite reads .env from the Vite project
// root (the package dir, not the workspace root). The per-template
// .env.example also encodes runtime-specific hints (PORT=3001 for the
// express service, VITE_* convention for React) that a generic root file
// can't express.
const WORKSPACE_MEMBER_SKIP_FILES = new Set(['.gitignore']);
// Generated projects pin the newest pnpm 12 release that is at least a day
// old (see resolvePnpmVersion), matching the upstream XYO repos.
//
// pnpm used to be held at 10 because 11.0.0-rc.2 failed installs with
// ERR_PNPM_MISSING_TIME on @eslint-react/* and @typescript-eslint/*. That
// error is about registry metadata missing per-version `time`, which pnpm 12
// handles by re-fetching full metadata. Re-checked 2026-10-09: the react
// template and the full monorepo (react + xl1-service + xl1-shared) install
// cleanly under pnpm 12.10.1 with the release-age gate on, no MISSING_TIME.
const PNPM_MAJOR = '12';
// Supported flag forms (any order relative to each other and to positionals):
//   --force, --no-install             boolean switches
//   --template=node, --template node  option with value (also --template's short form -t)
//   --target=my-app, --target my-app  same; target is also acceptable as positional[0]
//   --network=sequence                XL1 network the generated gateway points at:
//                                     mainnet | sequence | local. Default sequence; a
//                                     workspace member defaults to the root's `xl1.network`
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
            'network': { type: 'string' },
            'force': { type: 'boolean', default: false },
            'no-install': { type: 'boolean', default: false },
            'workspace-member': { type: 'boolean', default: false },
            'workspace-scope': { type: 'string' },
        },
    });
    return {
        target: values.target ?? positionals[0] ?? 'src',
        templateName: values.template,
        network: values.network,
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
// Reads the workspace root's package.json for a member scaffold. Throws if
// there is no workspace root or it has no package.json.
function readWorkspaceRootPackage(target) {
    const wsRoot = findWorkspaceRoot(target);
    if (!wsRoot) {
        throw new Error(`--workspace-member set but no pnpm-workspace.yaml found walking up from ${target}`);
    }
    const rootPkgPath = path.join(wsRoot, 'package.json');
    if (!existsSync(rootPkgPath)) {
        throw new Error(`workspace root at ${wsRoot} is missing package.json — cannot derive --workspace-scope`);
    }
    return { path: rootPkgPath, pkg: JSON.parse(readFileSync(rootPkgPath, 'utf8')) };
}
// Auto-derives a workspace scope from the workspace root's package.json name.
// Throws if no workspace root or no name field.
function deriveWorkspaceScope(target) {
    const { path: rootPkgPath, pkg: rootPkg } = readWorkspaceRootPackage(target);
    if (!rootPkg.name) {
        throw new Error(`workspace root package.json at ${rootPkgPath} has no "name" field`);
    }
    // If root name is already scoped (`@org/foo`), use the scope alone.
    // Otherwise, treat the whole name as the scope (`foo` → `@foo`).
    return rootPkg.name.startsWith('@') ? rootPkg.name.split('/', 1)[0] : `@${rootPkg.name}`;
}
// Network precedence: explicit --network, else (workspace member) the root's
// recorded `xl1.network`, else the default. Every member of one dApp should
// talk to the same chain, so an explicit member flag that disagrees with the
// root is called out.
function resolveNetwork(explicit, workspaceMember, target) {
    const wsRoot = workspaceMember ? findWorkspaceRoot(target) : undefined;
    const rootPkgPath = wsRoot ? path.join(wsRoot, 'package.json') : undefined;
    const rootPkg = rootPkgPath && existsSync(rootPkgPath) ? JSON.parse(readFileSync(rootPkgPath, 'utf8')) : undefined;
    const rootNetwork = rootPkg?.xl1?.network;
    const inherited = isXl1NetworkId(rootNetwork) ? rootNetwork : undefined;
    if (explicit !== undefined) {
        const network = parseNetwork(explicit);
        if (inherited !== undefined && inherited !== network) {
            console.warn(`WARNING: --network=${network} differs from the workspace root's xl1.network (${inherited}).`);
        }
        return network;
    }
    return inherited ?? DEFAULT_NETWORK;
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
async function resolveVersionsForTemplate(template, needsPackageManager) {
    console.log(`Resolving dependency graph from npm registry (newest releases at least ${RELEASE_AGE_POLICY.minutes} minutes old; ${RELEASE_AGE_POLICY.exclude.join(', ')} exempt)...`);
    const runtime = [...template.deps.runtime, ...(template.deps.extras ?? [])];
    const expandedRuntime = await expandWithPeers(runtime, template.deps.dev);
    console.log(`  ${expandedRuntime.length} runtime deps (${template.deps.runtime.length} direct + peers + extras)`);
    const pins = template.deps.versions ?? {};
    const pinCount = Object.keys(pins).length;
    if (pinCount > 0)
        console.log(`  ${pinCount} pinned version(s): ${Object.keys(pins).toSorted().join(', ')}`);
    const [runtimeResult, devResult, pnpm] = await Promise.all([
        resolveVersions(expandedRuntime, pins),
        resolveVersions(template.deps.dev, pins),
        needsPackageManager ? resolvePnpmVersion(PNPM_MAJOR) : undefined,
    ]);
    const heldBack = [...runtimeResult.heldBack, ...devResult.heldBack];
    if (heldBack.length > 0)
        console.log(`  held back from a too-new latest: ${heldBack.join(', ')}`);
    const immature = [...runtimeResult.immature, ...devResult.immature];
    if (pnpm?.immature)
        immature.push(`pnpm@${pnpm.version}`);
    const pnpmVersion = pnpm?.version ?? '';
    const packageManager = `pnpm@${pnpmVersion}`;
    if (pnpm)
        console.log(`  packageManager: ${packageManager}`);
    if (immature.length > 0) {
        console.warn(`  WARNING: no release old enough for minimumReleaseAge; allow-listing in pnpm-workspace.yaml: ${immature.join(', ')}`);
    }
    return {
        dependencies: runtimeResult.specs, devDependencies: devResult.specs, immature, packageManager, pnpmVersion,
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
// A member's immature picks must be allow-listed in the ROOT's
// pnpm-workspace.yaml — the only one pnpm reads for the workspace.
function allowListInWorkspaceRoot(target, entries) {
    if (entries.length === 0)
        return;
    const wsRoot = findWorkspaceRoot(target);
    const yamlPath = wsRoot ? path.join(wsRoot, 'pnpm-workspace.yaml') : undefined;
    const updated = yamlPath ? addReleaseAgeExcludes(readFileSync(yamlPath, 'utf8'), entries) : undefined;
    if (wsRoot && updated !== undefined) {
        writeString(wsRoot, 'pnpm-workspace.yaml', updated);
        return;
    }
    console.warn(`WARNING: add these to minimumReleaseAgeExclude in the workspace root's pnpm-workspace.yaml: ${entries.join(', ')}`);
}
// Every non-member project gets a pnpm-workspace.yaml (pnpm 12 settings,
// plus `packages` on a workspace root). A member's immature picks go into its
// root's file instead.
function writePnpmSettings(target, template, workspaceMember, immature) {
    if (workspaceMember) {
        allowListInWorkspaceRoot(target, immature);
        return;
    }
    writeString(target, 'pnpm-workspace.yaml', buildPnpmWorkspaceYaml({
        packages: template.workspacePackages, policy: RELEASE_AGE_POLICY, extraExcludes: immature,
    }));
}
function copyTemplateFiles(templatesRoot, target, template, workspaceMember, network) {
    const filesToCopy = workspaceMember
        ? template.files.filter(f => !WORKSPACE_MEMBER_SKIP_FILES.has(f.dest))
        : template.files;
    const vars = networkTemplateVars(network);
    for (const f of filesToCopy)
        copyTemplateFile(templatesRoot, f, target, vars);
}
function installAndVerify(target, targetArg, template, pnpmVersion) {
    const selection = selectPnpmRunner(pnpmRunners(pnpmVersion), PNPM_MAJOR, probeWithSpawn(target));
    if (!selection.runner) {
        const steps = ['pnpm install', 'pnpm typecheck', 'pnpm lint', 'pnpm build'];
        if (template.smokeTest)
            steps.push(`pnpm ${template.smokeTest.pnpmScript}`);
        console.error(`\n${pnpmUnavailableMessage(pnpmVersion, selection.failures, `cd ${targetArg} && ${steps.join(' && ')}`)}`);
        process.exit(1);
    }
    const { runner } = selection;
    for (const failure of selection.failures)
        console.log(`  (skipped ${failure.runner.label}: ${failure.reason})`);
    console.log(`\nUsing ${runner.label} → pnpm ${selection.version}`);
    runPnpmStep(runner, target, 'Running pnpm install', ['install']);
    runPnpmStep(runner, target, 'Running typecheck', ['typecheck']);
    runPnpmStep(runner, target, 'Running lint', ['lint']);
    runPnpmStep(runner, target, 'Running build', ['build']);
    if (template.smokeTest) {
        runPnpmStep(runner, target, `Running smoke test (pnpm ${template.smokeTest.pnpmScript})`, [template.smokeTest.pnpmScript]);
    }
}
async function main() {
    const { target: targetArg, templateName, network: networkArg, force, noInstall, workspaceMember, workspaceScope, } = parseArgs(process.argv.slice(2));
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
    const network = resolveNetwork(networkArg, workspaceMember, target);
    console.log(`Scaffolding ${template.description} at: ${target}`);
    console.log(`XL1 network: ${network} (${XL1_NETWORKS[network].exportName})`);
    ensureTargetDir(target, force);
    const { dependencies, devDependencies, immature, packageManager, pnpmVersion, } = await resolveVersionsForTemplate(template, !workspaceMember);
    const finalDeps = addWorkspaceSharedDep(dependencies, workspaceMember, template.name, target);
    writeJson(target, 'package.json', buildPackageJson({
        template, dependencies: finalDeps, devDependencies, packageManager, workspaceMember, name: packageName, network,
    }));
    if (!template.omitTsconfig)
        writeJson(target, 'tsconfig.json', buildTsconfig(template));
    writePnpmSettings(target, template, workspaceMember, immature);
    copyTemplateFiles(templatesRoot, target, template, workspaceMember, network);
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
    installAndVerify(target, targetArg, template, pnpmVersion);
    console.log('\nScaffold complete. Next:');
    console.log(`  cd ${targetArg}`);
    for (const step of template.nextSteps)
        console.log(`  ${step}`);
}
try {
    await main();
}
catch (err) {
    if (err instanceof Error) {
        console.error(err.message);
        if ('cause' in err && err.cause)
            console.error('caused by:', err.cause);
    }
    else {
        console.error(err);
    }
    process.exit(1);
}
//# sourceMappingURL=scaffold-xl1-dapp.js.map