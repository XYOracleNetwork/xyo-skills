#!/usr/bin/env node
// Bootstraps an XL1 application — either a React + Vite dApp or a Node.js
// service/CLI.
//
// Usage:
//   scaffold-xl1 [target-dir] [--template=react|node] [--force] [--no-install]
//
// Defaults: target-dir=src, template=react.

import { resolve } from 'node:path'

import { expandWithPeers, resolveLatestPnpmByMajor, resolveVersions } from './registry.js'
import { BASE, type Template } from './template.js'
import { nodeTemplate } from './presets/node.js'
import { reactTemplate } from './presets/react.js'
import { copyTemplateFile, ensureTargetDir, resolveTemplatesRoot, runPnpmStep, writeJson } from './writer.js'

const TEMPLATES: Record<string, Template> = {
  react: reactTemplate,
  node: nodeTemplate,
}

// pnpm 11.0.0-rc.2 hits ERR_PNPM_MISSING_TIME on @eslint-react/* and
// @typescript-eslint/* even with resolution-mode=highest set, so the script
// pins pnpm to the latest 10.x via `corepack pnpm@10` and resolves the
// concrete version for package.json's packageManager field at runtime.
const PNPM_MAJOR = '10'
const PACKAGE_NAME = 'xl1-dapp'

type Args = {
  target: string
  templateName: string
  force: boolean
  noInstall: boolean
}

function parseArgs(argv: string[]): Args {
  const flags = new Set<string>()
  const options: Record<string, string> = {}
  const positional: string[] = []
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq === -1) flags.add(a)
      else options[a.slice(2, eq)] = a.slice(eq + 1)
    } else {
      positional.push(a)
    }
  }
  return {
    target: positional[0] ?? 'src',
    templateName: options.template ?? 'react',
    force: flags.has('--force'),
    noInstall: flags.has('--no-install'),
  }
}

function buildTsconfig(template: Template) {
  return {
    extends: template.tsconfig.extends,
    compilerOptions: {
      ...BASE.tsconfig.compilerOptions,
      ...(template.tsconfig.compilerOptions ?? {}),
    },
    include: BASE.tsconfig.include,
  }
}

function buildPackageJson(args: {
  template: Template
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  packageManager: string
}) {
  return {
    name: PACKAGE_NAME,
    version: '0.1.0',
    private: true,
    type: 'module',
    packageManager: args.packageManager,
    // Template wins on key conflict.
    scripts: { ...BASE.scripts, ...args.template.scripts },
    dependencies: args.dependencies,
    devDependencies: args.devDependencies,
  }
}

async function main() {
  const { target: targetArg, templateName, force, noInstall } = parseArgs(process.argv.slice(2))
  const template = TEMPLATES[templateName]
  if (!template) {
    console.error(`Unknown template: ${templateName}. Available: ${Object.keys(TEMPLATES).join(', ')}`)
    process.exit(1)
  }

  // Prefer INIT_CWD — pnpm sets it to the user's original invocation dir.
  // Without this, running via `pnpm --filter ... run scaffold` resolves
  // relative to the filtered workspace package, not where the user ran from.
  const invocationCwd = process.env.INIT_CWD ?? process.cwd()
  const target = resolve(invocationCwd, targetArg)
  const templatesRoot = resolveTemplatesRoot(import.meta.url)

  console.log(`Bootstrapping ${template.description} at: ${target}`)
  ensureTargetDir(target, force)

  console.log('Resolving dependency graph from npm registry...')
  const runtime = [...template.deps.runtime, ...(template.deps.extras ?? [])]
  const expandedRuntime = await expandWithPeers(runtime, template.deps.dev)
  console.log(`  ${expandedRuntime.length} runtime deps (${template.deps.runtime.length} direct + peers + extras)`)

  const [dependencies, devDependencies, pnpmVersion] = await Promise.all([
    resolveVersions(expandedRuntime),
    resolveVersions(template.deps.dev),
    resolveLatestPnpmByMajor(PNPM_MAJOR),
  ])
  const packageManager = `pnpm@${pnpmVersion}`
  console.log(`  packageManager: ${packageManager}`)

  writeJson(target, 'package.json', buildPackageJson({ template, dependencies, devDependencies, packageManager }))
  writeJson(target, 'tsconfig.json', buildTsconfig(template))
  for (const f of [...BASE.sharedFiles, ...template.files]) copyTemplateFile(templatesRoot, template.name, f, target)

  if (noInstall) {
    console.log('\nSkipped install (--no-install).')
    console.log(`Next: cd ${targetArg} && pnpm install && ${template.nextSteps.join(' && ')}`)
    return
  }

  runPnpmStep(target, 'Running pnpm install', ['install'])
  runPnpmStep(target, 'Running typecheck', ['typecheck'])
  runPnpmStep(target, 'Running lint', ['lint'])
  runPnpmStep(target, 'Running build', ['build'])
  if (template.smokeTest) {
    runPnpmStep(target, `Running smoke test (pnpm ${template.smokeTest.pnpmScript})`, [template.smokeTest.pnpmScript])
  }

  console.log('\nBootstrap complete. Next:')
  console.log(`  cd ${targetArg}`)
  for (const step of template.nextSteps) console.log(`  ${step}`)
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(err.message)
    if ('cause' in err && err.cause) console.error('caused by:', err.cause)
  } else {
    console.error(err)
  }
  process.exit(1)
})
