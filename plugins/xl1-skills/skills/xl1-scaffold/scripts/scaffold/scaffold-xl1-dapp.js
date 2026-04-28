#!/usr/bin/env node
// Scaffolds an XL1 application — either a React + Vite dApp or a Node.js
// service/CLI.
//
// Usage:
//   scaffold-xl1 [target-dir] [--template=react|node] [--force] [--no-install]
//
// Defaults: target-dir=src, template=react.
import path from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';
import { nodeTemplate, reactTemplate } from './presets/index.js';
import { expandWithPeers, resolveLatestPnpmByMajor, resolveVersions, } from './registry.js';
import { copyTemplateFile, ensureTargetDir, resolveTemplatesRoot, runPnpmStep, writeJson, } from './writer.js';
const TEMPLATES = {
    react: reactTemplate,
    node: nodeTemplate,
};
// pnpm 11.0.0-rc.2 hits ERR_PNPM_MISSING_TIME on @eslint-react/* and
// @typescript-eslint/* even with resolution-mode=highest set, so the script
// pins pnpm to the latest 10.x via `corepack pnpm@10` and resolves the
// concrete version for package.json's packageManager field at runtime.
const PNPM_MAJOR = '10';
const PACKAGE_NAME = 'xl1-dapp';
// Supported flag forms (any order relative to each other and to positionals):
//   --force, --no-install             boolean switches
//   --template=node, --template node  option with value (also --template's short form -t)
//   --target=my-app, --target my-app  same; target is also acceptable as positional[0]
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
        },
    });
    return {
        target: values.target ?? positionals[0] ?? 'src',
        templateName: values.template,
        force: values.force,
        noInstall: values['no-install'],
    };
}
function buildTsconfig(template) {
    return {
        extends: template.tsconfig.extends,
        compilerOptions: template.tsconfig.compilerOptions,
        include: template.tsconfig.include,
    };
}
function buildPackageJson(args) {
    return {
        name: PACKAGE_NAME,
        version: '0.1.0',
        private: true,
        type: 'module',
        packageManager: args.packageManager,
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
    const [dependencies, devDependencies, pnpmVersion] = await Promise.all([
        resolveVersions(expandedRuntime),
        resolveVersions(template.deps.dev),
        resolveLatestPnpmByMajor(PNPM_MAJOR),
    ]);
    const packageManager = `pnpm@${pnpmVersion}`;
    console.log(`  packageManager: ${packageManager}`);
    return {
        dependencies, devDependencies, packageManager,
    };
}
async function main() {
    const { target: targetArg, templateName, force, noInstall, } = parseArgs(process.argv.slice(2));
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
    console.log(`Scaffolding ${template.description} at: ${target}`);
    ensureTargetDir(target, force);
    const { dependencies, devDependencies, packageManager, } = await resolveVersionsForTemplate(template);
    writeJson(target, 'package.json', buildPackageJson({
        template, dependencies, devDependencies, packageManager,
    }));
    writeJson(target, 'tsconfig.json', buildTsconfig(template));
    for (const f of template.files)
        copyTemplateFile(templatesRoot, template.name, f, target);
    if (noInstall) {
        console.log('\nSkipped install (--no-install).');
        console.log(`Next: cd ${targetArg} && pnpm install && ${template.nextSteps.join(' && ')}`);
        return;
    }
    runPnpmStep(target, 'Running pnpm install', ['install']);
    runPnpmStep(target, 'Running typecheck', ['typecheck']);
    runPnpmStep(target, 'Running lint', ['lint']);
    runPnpmStep(target, 'Running build', ['build']);
    if (template.smokeTest) {
        runPnpmStep(target, `Running smoke test (pnpm ${template.smokeTest.pnpmScript})`, [template.smokeTest.pnpmScript]);
    }
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