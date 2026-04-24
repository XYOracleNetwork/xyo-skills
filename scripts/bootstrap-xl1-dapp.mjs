#!/usr/bin/env node
// Bootstraps a React + Vite + TypeScript XL1 dApp.
// Usage: node scripts/bootstrap-xl1-dapp.mjs [target-dir] [--force] [--no-install]
// Defaults target-dir to ./src (per CLAUDE.md convention).

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const positional = args.filter(a => !a.startsWith('--'))
const targetArg = positional[0] ?? 'src'
const TARGET = resolve(REPO_ROOT, targetArg)
const FORCE = flags.has('--force')
const NO_INSTALL = flags.has('--no-install')

const PACKAGE_NAME = 'xl1-dapp'

// Versions are resolved at runtime from the npm registry. See resolveVersions().
const DEPENDENCIES = [
  'react',
  'react-dom',
  'react-is',
  '@xyo-network/sdk-js',
  '@xyo-network/xl1-sdk',
  '@xyo-network/react-chain-client',
  // Peer deps of @xyo-network/react-chain-client.
  '@mui/material',
  '@emotion/react',
  '@emotion/styled',
  '@xylabs/sdk-js',
  '@xylabs/zod',
  '@xylabs/react-async-effect',
  '@xylabs/react-promise',
  '@xylabs/react-quick-tip-button',
  // Browser polyfill for Node's 'events' module — required because
  // @metamask/safe-event-emitter (pulled in by wallet postMessage transport)
  // imports 'events' directly. The npm "events" package is the canonical
  // browser shim.
  'events',
]

const DEV_DEPENDENCIES = [
  '@xylabs/toolchain',
  // tsconfig-react extends tsconfig-dom extends tsconfig. All three need to be
  // direct dev deps so the ESLint import resolver can find them when it walks
  // the tsconfig extends chain.
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
]

// pnpm 11.0.0-rc.2 hits ERR_PNPM_MISSING_TIME on @eslint-react/* and
// @typescript-eslint/* even with resolution-mode=highest set, so the script
// pins pnpm to the latest 10.x via `corepack pnpm@10` and resolves the
// concrete version for package.json's packageManager field at runtime.
const PNPM_MAJOR = '10'

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.json()
}

async function fetchLatestVersion(pkg) {
  const encoded = pkg.replaceAll('/', '%2F')
  const body = await fetchJson(`https://registry.npmjs.org/${encoded}/latest`)
  if (!body.version) throw new Error(`no version in registry response for ${pkg}`)
  return body.version
}

// Returns { "pkg": "^1.2.3", ... } for the given package names.
async function resolveVersions(packages) {
  const entries = await Promise.all(
    packages.map(async pkg => [pkg, `^${await fetchLatestVersion(pkg)}`]),
  )
  return Object.fromEntries(entries)
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
  writeFileSync(out, contents.endsWith('\n') ? contents : contents + '\n')
  console.log(`  wrote ${relPath}`)
}

function packageJson({ dependencies, devDependencies, packageManager }) {
  return JSON.stringify(
    {
      name: PACKAGE_NAME,
      version: '0.1.0',
      private: true,
      type: 'module',
      packageManager,
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
      dependencies,
      devDependencies,
    },
    null,
    2,
  )
}

function tsconfigJson() {
  return JSON.stringify(
    {
      extends: '@xylabs/tsconfig-react',
      compilerOptions: {
        outDir: './dist',
        rootDir: './src',
        noEmit: true,
      },
      include: ['src'],
    },
    null,
    2,
  )
}

function eslintConfig() {
  return `import { recommendedConfig as xylabsConfig } from '@xylabs/eslint-config-react-flat'

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  ...xylabsConfig,
]
`
}

function viteConfig() {
  // build.target: 'esnext' — bypass Vite's default ES2020 downleveling, which
  // fails on modern syntax used by @xyo-network/* deps (destructuring in
  // specific forms not supported by the ES2020 target).
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

function vitestConfig() {
  return `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
  },
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
  // a "time" field in their npm registry metadata (seen with @eslint-react/*
  // and @typescript-eslint/* via @xylabs/eslint-config-react-flat).
  // .npmrc is gitignored — re-run bootstrap on fresh clones.
  return `resolution-mode=highest
`
}

function runPnpmInstall() {
  console.log('\nRunning pnpm install...')
  const r = spawnSync('corepack', ['pnpm@10', 'install'], { cwd: TARGET, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('pnpm install failed.')
    process.exit(r.status ?? 1)
  }
}

function runVerification() {
  console.log('\nRunning typecheck...')
  const tc = spawnSync('corepack', ['pnpm@10', 'typecheck'], { cwd: TARGET, stdio: 'inherit' })
  if (tc.status !== 0) {
    console.error('typecheck failed.')
    process.exit(tc.status ?? 1)
  }
  console.log('\nRunning lint...')
  const lint = spawnSync('corepack', ['pnpm@10', 'lint'], { cwd: TARGET, stdio: 'inherit' })
  if (lint.status !== 0) {
    console.error('lint failed.')
    process.exit(lint.status ?? 1)
  }
}

async function main() {
  console.log(`Bootstrapping XL1 dApp at: ${TARGET}`)
  ensureTargetDir()

  console.log('Resolving latest versions from npm registry...')
  const [dependencies, devDependencies, pnpmVersion] = await Promise.all([
    resolveVersions(DEPENDENCIES),
    resolveVersions(DEV_DEPENDENCIES),
    resolveLatestPnpmByMajor(PNPM_MAJOR),
  ])
  const packageManager = `pnpm@${pnpmVersion}`
  console.log(`  packageManager: ${packageManager}`)

  write('package.json', packageJson({ dependencies, devDependencies, packageManager }))
  write('tsconfig.json', tsconfigJson())
  write('eslint.config.mjs', eslintConfig())
  write('vite.config.ts', viteConfig())
  write('vitest.config.ts', vitestConfig())
  write('index.html', indexHtml())
  write('src/main.tsx', mainTsx())
  write('src/App.tsx', appTsx())
  write('src/vite-env.d.ts', viteEnvDts())
  write('.gitignore', gitignore())
  write('.npmrc', npmrc())

  if (NO_INSTALL) {
    console.log('\nSkipped install (--no-install).')
    console.log(`Next: cd ${targetArg} && pnpm install && pnpm dev`)
    return
  }

  runPnpmInstall()
  runVerification()

  console.log('\nBootstrap complete. Next:')
  console.log(`  cd ${targetArg}`)
  console.log('  pnpm dev')
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
