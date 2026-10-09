import path from 'node:path'

import {
  describe, expect, it,
} from 'vitest'

import { assertExtendsBase } from './shared-assertions.js'
import { xl1SharedTemplate } from './xl1-shared.js'

assertExtendsBase(xl1SharedTemplate)

describe('xl1-shared preset specifics', () => {
  it('extends the environment-neutral @ariestools/tsconfig (no DOM, no Node-only)', () => {
    expect(xl1SharedTemplate.tsconfig.extends).toBe('@ariestools/tsconfig')
  })

  it('emits dist/ so workspace consumers can import compiled JS', () => {
    expect(xl1SharedTemplate.tsconfig.compilerOptions?.noEmit).toBe(false)
    expect(xl1SharedTemplate.tsconfig.compilerOptions?.allowImportingTsExtensions).toBe(false)
  })

  it('exports map points at what tsc emits for src/index.ts', () => {
    const { outDir, rootDir } = xl1SharedTemplate.tsconfig.compilerOptions as { outDir: string; rootDir: string }
    const entry = path.posix.relative(rootDir, 'src/index.ts').replace(/\.ts$/, '')
    const emitted = `./${path.posix.join(outDir, entry)}`
    expect(xl1SharedTemplate.packageJson?.exports).toEqual({
      '.': {
        types: `${emitted}.d.ts`,
        default: `${emitted}.js`,
      },
    })
  })

  // Regression: without a config `eslint .` aborts ("couldn't find an
  // eslint.config.* file"), failing `pnpm -r run lint` across the monorepo.
  it('writes an eslint.config.mjs (reusing the node preset\'s flat config)', () => {
    expect(xl1SharedTemplate.files).toContainEqual({ src: 'node/eslint.config.mjs', dest: 'eslint.config.mjs' })
  })

  it('declares the dev deps its eslint.config.mjs needs', () => {
    expect(xl1SharedTemplate.deps.dev).toContain('@ariestools/eslint-config-flat')
    expect(xl1SharedTemplate.deps.dev).toContain('eslint')
  })

  it('writes src/index.ts', () => {
    expect(xl1SharedTemplate.files.some(f => f.dest === 'src/index.ts')).toBe(true)
  })

  it('build script runs tsc directly (no bundler)', () => {
    expect(xl1SharedTemplate.scripts.build).toBe('tsc')
  })

  it('has no smoke test (it\'s a library)', () => {
    expect(xl1SharedTemplate.smokeTest).toBeUndefined()
  })

  it('declares no runtime deps (consumer\'s job)', () => {
    expect(xl1SharedTemplate.deps.runtime).toEqual([])
  })
})
