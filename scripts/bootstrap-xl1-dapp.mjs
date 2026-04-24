#!/usr/bin/env node
// Bootstraps an XL1 application — either a React + Vite dApp or a Node.js
// service/CLI.
//
// Usage:
//   node scripts/bootstrap-xl1-dapp.mjs [target-dir] [--template=react|node]
//                                       [--force] [--no-install]
//
// Defaults: target-dir=src, template=react.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

function parseArgs(argv) {
  const flags = new Set()
  const options = {}
  const positional = []
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq === -1) flags.add(a)
      else options[a.slice(2, eq)] = a.slice(eq + 1)
    } else {
      positional.push(a)
    }
  }
  return { flags, options, positional }
}

const { flags, options, positional } = parseArgs(process.argv.slice(2))
const targetArg = positional[0] ?? 'src'
const TARGET = resolve(REPO_ROOT, targetArg)
const FORCE = flags.has('--force')
const NO_INSTALL = flags.has('--no-install')
const TEMPLATE_NAME = options.template ?? 'react'

const PACKAGE_NAME = 'xl1-dapp'

// pnpm 11.0.0-rc.2 hits ERR_PNPM_MISSING_TIME on @eslint-react/* and
// @typescript-eslint/* even with resolution-mode=highest set, so the script
// pins pnpm to the latest 10.x via `corepack pnpm@10` and resolves the
// concrete version for package.json's packageManager field at runtime.
const PNPM_MAJOR = '10'

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const REACT_TEMPLATE = {
  name: 'react',
  description: 'React + Vite + TypeScript XL1 dApp',
  dependencies: [
    'react',
    'react-dom',
    '@xyo-network/sdk-js',
    '@xyo-network/xl1-sdk',
    '@xyo-network/react-chain-client',
  ],
  // Added on top of peers auto-resolved from `dependencies`. Covers peers of
  // peers (emotion is peer of @mui/material) and non-peer extras like the
  // 'events' polyfill needed by @metamask/safe-event-emitter.
  extraDependencies: [
    '@emotion/react',
    '@emotion/styled',
    'events',
  ],
  devDependencies: [
    '@xylabs/toolchain',
    // tsconfig-react extends tsconfig-dom extends tsconfig. All three need to
    // be direct dev deps so the ESLint import resolver can find them when it
    // walks the tsconfig extends chain.
    '@xylabs/tsconfig',
    '@xylabs/tsconfig-dom',
    '@xylabs/tsconfig-react',
    '@xylabs/eslint-config-react-flat',
    '@types/react',
    '@types/react-dom',
    '@vitejs/plugin-react',
    'eslint',
    'happy-dom',
    'typescript',
    'vite',
    'vite-plugin-top-level-await',
    'vite-tsconfig-paths',
    'vitest',
  ],
  scripts: {
    dev: 'vite',
    build: 'tsc --noEmit && vite build',
    preview: 'vite preview',
    lint: 'eslint .',
    'lint:fix': 'eslint . --fix',
    test: 'vitest run',
    'test:watch': 'vitest',
    typecheck: 'tsc --noEmit',
  },
  tsconfig: {
    extends: '@xylabs/tsconfig-react',
    compilerOptions: { outDir: './dist', rootDir: './src', noEmit: true },
    include: ['src'],
  },
  files: [
    { path: 'eslint.config.mjs', contents: reactEslintConfig() },
    { path: 'vite.config.ts', contents: viteConfig() },
    { path: 'vitest.config.ts', contents: vitestConfigReact() },
    { path: 'index.html', contents: indexHtml() },
    { path: 'src/main.tsx', contents: mainTsx() },
    { path: 'src/App.tsx', contents: appTsx() },
    { path: 'src/vite-env.d.ts', contents: viteEnvDts() },
  ],
  nextSteps: ['pnpm dev'],
}

const NODE_TEMPLATE = {
  name: 'node',
  description: 'Node.js + TypeScript XL1 service/CLI',
  dependencies: [
    '@xyo-network/sdk-js',
    '@xyo-network/xl1-sdk',
  ],
  extraDependencies: [],
  devDependencies: [
    '@xylabs/toolchain',
    '@xylabs/tsconfig',
    '@xylabs/eslint-config-flat',
    '@types/node',
    'eslint',
    'tsx',
    'typescript',
    'vitest',
  ],
  scripts: {
    dev: 'tsx --watch src/index.ts',
    start: 'node dist/index.js',
    build: 'tsc',
    lint: 'eslint .',
    'lint:fix': 'eslint . --fix',
    test: 'vitest run',
    'test:watch': 'vitest',
    typecheck: 'tsc --noEmit',
  },
  tsconfig: {
    extends: '@xylabs/tsconfig',
    compilerOptions: {
      outDir: './dist',
      rootDir: './src',
      // Base @xylabs/tsconfig sets noEmit: true + allowImportingTsExtensions:
      // true. Both must be overridden so `tsc` actually produces dist/ for
      // `pnpm start` (node dist/index.js). `typecheck` passes --noEmit on the
      // CLI, so type-check-only runs still do the right thing.
      noEmit: false,
      allowImportingTsExtensions: false,
    },
    include: ['src'],
  },
  files: [
    { path: 'eslint.config.mjs', contents: nodeEslintConfig() },
    { path: 'vitest.config.ts', contents: vitestConfigNode() },
    { path: 'src/index.ts', contents: nodeIndexTs() },
  ],
  nextSteps: ['pnpm dev'],
}

const TEMPLATES = { react: REACT_TEMPLATE, node: NODE_TEMPLATE }

// ---------------------------------------------------------------------------
// File contents
// ---------------------------------------------------------------------------

function reactEslintConfig() {
  return `import { recommendedConfig as xylabsConfig } from '@xylabs/eslint-config-react-flat'

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  ...xylabsConfig,
]
`
}

function nodeEslintConfig() {
  // The config files themselves (eslint.config.mjs, vitest.config.ts) live
  // outside src/ so the typescript-eslint project service can't find them via
  // tsconfig. Ignoring rather than adding them to tsconfig include, because
  // that would fight rootDir: './src'.
  return `import { config as xylabsConfig } from '@xylabs/eslint-config-flat'

export default [
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'eslint.config.mjs',
      'vitest.config.ts',
    ],
  },
  ...xylabsConfig,
]
`
}

function viteConfig() {
  // build.target: 'esnext' — bypass Vite's default ES2020 downleveling, which
  // fails on modern syntax used by @xyo-network/* deps.
  return `import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), topLevelAwait(), tsconfigPaths()],
  build: { target: 'esnext' },
})
`
}

function vitestConfigReact() {
  return `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { globals: true, environment: 'happy-dom' },
})
`
}

function vitestConfigNode() {
  return `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { globals: true, environment: 'node' },
})
`
}

function indexHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>XL1 dApp</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
}

function mainTsx() {
  return `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'

const container = document.querySelector('#root')
if (!container) throw new Error('Root container #root not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`
}

function appTsx() {
  return `import { ConnectAccountsStack, WalletGatewayProvider } from '@xyo-network/react-chain-client'
import { MainNetwork } from '@xyo-network/xl1-sdk'
import { useState } from 'react'

export function App() {
  const [address, setAddress] = useState<string | undefined>()

  return (
    <WalletGatewayProvider gatewayName={MainNetwork.id}>
      <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
        <h1>XL1 dApp</h1>
        <ConnectAccountsStack onAccountConnected={setAddress} />
        {address ? <p>{\`Connected account: \${address}\`}</p> : null}
      </main>
    </WalletGatewayProvider>
  )
}
`
}

function viteEnvDts() {
  return `/// <reference types="vite/client" />
`
}

function nodeIndexTs() {
  return `import { MainNetwork } from '@xyo-network/xl1-sdk'

console.log('Hello world')
console.log(\`XL1 network id: \${MainNetwork.id}\`)
`
}

function gitignore() {
  return `node_modules/
dist/
coverage/
.npmrc
.vite/
*.log
.DS_Store
`
}

function npmrc() {
  // resolution-mode=highest avoids ERR_PNPM_MISSING_TIME on packages that lack
  // a "time" field in their npm registry metadata. auto-install-peers=true is
  // required because @xyo-network/sdk-js and @xyo-network/xl1-sdk declare
  // their runtime deps (ajv, zod, ethers, lru-cache, @metamask/*, etc.) as
  // peer dependencies — without this, pnpm skips them and imports fail at
  // runtime with "does not provide an export named X". .npmrc is gitignored —
  // re-run bootstrap on fresh clones.
  return `resolution-mode=highest
auto-install-peers=true
`
}

// ---------------------------------------------------------------------------
// Registry resolution
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.json()
}

async function fetchLatestPackument(pkg) {
  const encoded = pkg.replaceAll('/', '%2F')
  return fetchJson(`https://registry.npmjs.org/${encoded}/latest`)
}

async function fetchLatestVersion(pkg) {
  const body = await fetchLatestPackument(pkg)
  if (!body.version) throw new Error(`no version in registry response for ${pkg}`)
  return body.version
}

async function resolveVersions(packages) {
  const entries = await Promise.all(
    packages.map(async pkg => [pkg, `^${await fetchLatestVersion(pkg)}`]),
  )
  return Object.fromEntries(entries)
}

// @xyo-network/sdk-js and xl1-sdk declare their runtime deps (ajv, zod, ethers
// and dozens of @xyo-network/* sub-packages) as peer dependencies. pnpm's
// auto-install-peers setting does not reliably pull the right major versions,
// so we walk peer deps one level deep and add them to the direct dep list.
// Filters out anything already in our dev deps (e.g. typescript).
async function expandWithPeers(directDeps, excludes = []) {
  const excludeSet = new Set([...excludes, ...directDeps])
  const peers = new Set()
  const packuments = await Promise.all(directDeps.map(fetchLatestPackument))
  for (const p of packuments) {
    for (const peer of Object.keys(p.peerDependencies ?? {})) {
      if (!excludeSet.has(peer)) peers.add(peer)
    }
  }
  return [...directDeps, ...peers]
}

async function resolveLatestPnpmByMajor(major) {
  const body = await fetchJson('https://registry.npmjs.org/pnpm')
  const candidates = Object.keys(body.versions).filter(v => v.startsWith(`${major}.`) && !v.includes('-'))
  if (candidates.length === 0) throw new Error(`no stable pnpm ${major}.x on registry`)
  candidates.sort((a, b) => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2]
  })
  return candidates.at(-1)
}

// ---------------------------------------------------------------------------
// Filesystem + process helpers
// ---------------------------------------------------------------------------

function ensureTargetDir() {
  if (!existsSync(TARGET)) {
    mkdirSync(TARGET, { recursive: true })
    return
  }
  const entries = readdirSync(TARGET)
  if (entries.length > 0 && !FORCE) {
    console.error(`Target dir is not empty: ${TARGET}`)
    console.error('Pass --force to overwrite files in place.')
    process.exit(1)
  }
}

function write(relPath, contents) {
  const out = join(TARGET, relPath)
  mkdirSync(dirname(out), { recursive: true })
  const body = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
  writeFileSync(out, body.endsWith('\n') ? body : body + '\n')
  console.log(`  wrote ${relPath}`)
}

function packageJson({ template, dependencies, devDependencies, packageManager }) {
  return {
    name: PACKAGE_NAME,
    version: '0.1.0',
    private: true,
    type: 'module',
    packageManager,
    scripts: template.scripts,
    dependencies,
    devDependencies,
  }
}

function runStep(label, pnpmArgs) {
  console.log(`\n${label}...`)
  const r = spawnSync('corepack', ['pnpm@10', ...pnpmArgs], { cwd: TARGET, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`${label} failed.`)
    process.exit(r.status ?? 1)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const template = TEMPLATES[TEMPLATE_NAME]
  if (!template) {
    console.error(`Unknown template: ${TEMPLATE_NAME}. Available: ${Object.keys(TEMPLATES).join(', ')}`)
    process.exit(1)
  }

  console.log(`Bootstrapping ${template.description} at: ${TARGET}`)
  ensureTargetDir()

  console.log('Resolving dependency graph from npm registry...')
  const expandedDeps = await expandWithPeers(
    [...template.dependencies, ...template.extraDependencies],
    template.devDependencies,
  )
  console.log(`  ${expandedDeps.length} runtime deps (${template.dependencies.length} direct + peers + extras)`)

  const [dependencies, devDependencies, pnpmVersion] = await Promise.all([
    resolveVersions(expandedDeps),
    resolveVersions(template.devDependencies),
    resolveLatestPnpmByMajor(PNPM_MAJOR),
  ])
  const packageManager = `pnpm@${pnpmVersion}`
  console.log(`  packageManager: ${packageManager}`)

  write('package.json', packageJson({ template, dependencies, devDependencies, packageManager }))
  write('tsconfig.json', template.tsconfig)
  for (const f of template.files) write(f.path, f.contents)
  write('.gitignore', gitignore())
  write('.npmrc', npmrc())

  if (NO_INSTALL) {
    console.log('\nSkipped install (--no-install).')
    console.log(`Next: cd ${targetArg} && pnpm install && ${template.nextSteps.join(' && ')}`)
    return
  }

  runStep('Running pnpm install', ['install'])
  runStep('Running typecheck', ['typecheck'])
  runStep('Running lint', ['lint'])
  runStep('Running build', ['build'])

  console.log('\nBootstrap complete. Next:')
  console.log(`  cd ${targetArg}`)
  for (const step of template.nextSteps) console.log(`  ${step}`)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
