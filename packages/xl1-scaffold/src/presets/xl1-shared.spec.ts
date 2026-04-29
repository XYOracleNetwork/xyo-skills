import { describe, expect, it } from 'vitest'

import { assertExtendsBase } from './shared-assertions.js'
import { xl1SharedTemplate } from './xl1-shared.js'

assertExtendsBase(xl1SharedTemplate)

describe('xl1-shared preset specifics', () => {
  it('extends the environment-neutral @xylabs/tsconfig (no DOM, no Node-only)', () => {
    expect(xl1SharedTemplate.tsconfig.extends).toBe('@xylabs/tsconfig')
  })

  it('emits dist/ so workspace consumers can import compiled JS', () => {
    expect(xl1SharedTemplate.tsconfig.compilerOptions?.noEmit).toBe(false)
    expect(xl1SharedTemplate.tsconfig.compilerOptions?.allowImportingTsExtensions).toBe(false)
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
