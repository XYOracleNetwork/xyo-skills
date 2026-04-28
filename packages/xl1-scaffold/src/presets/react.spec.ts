import { describe, expect, it } from 'vitest'

import { reactTemplate } from './react.js'
import { assertExtendsBase } from './shared-assertions.js'

assertExtendsBase(reactTemplate)

describe('react preset specifics', () => {
  it('uses the @xylabs/tsconfig-react base', () => {
    expect(reactTemplate.tsconfig.extends).toBe('@xylabs/tsconfig-react')
  })

  it('disables tsc emit (Vite handles bundling)', () => {
    expect(reactTemplate.tsconfig.compilerOptions?.noEmit).toBe(true)
  })

  it('declares Vite as a dev dep', () => {
    expect(reactTemplate.deps.dev).toContain('vite')
  })

  it('declares the Vite React plugin as a dev dep', () => {
    expect(reactTemplate.deps.dev).toContain('@vitejs/plugin-react')
  })

  it('writes Vite + React entry files', () => {
    const expectedDests = ['vite.config.ts', 'index.html', 'src/main.tsx', 'src/App.tsx']
    for (const dest of expectedDests) {
      expect(reactTemplate.files.some(f => f.dest === dest)).toBe(true)
    }
  })

  it('runs `vite build` from the build script', () => {
    expect(reactTemplate.scripts.build).toContain('vite build')
  })
})
