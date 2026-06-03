import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  describe, expect, it,
} from 'vitest'

import { reactTemplate } from './react.js'
import { assertExtendsBase } from './shared-assertions.js'

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates')

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

  it('writes a .env.example for users to copy (Vite reads .env natively)', () => {
    expect(reactTemplate.files.some(f => f.dest === '.env.example')).toBe(true)
  })

  it('does NOT pull in the dotenv package (Vite handles env loading)', () => {
    expect(reactTemplate.deps.runtime).not.toContain('dotenv')
  })

  describe('browser-service-wiring (vite.config.ts contents)', () => {
    // Lock in the same-origin /api/* proxy prescription so a future edit
    // can't silently revert the React app to a CORS-dependent layout.
    // See xl1-patterns/browser-service-wiring.md.
    const viteConfig = readFileSync(path.join(TEMPLATES_DIR, 'react/vite.config.ts'), 'utf8')

    it('pins the dev server to port 3000', () => {
      expect(viteConfig).toMatch(/port:\s*3000/)
    })

    it('proxies /api to the companion service on :3001', () => {
      expect(viteConfig).toContain("'/api'")
      expect(viteConfig).toContain('http://localhost:3001')
    })

    it('uses changeOrigin: true on the proxy rule', () => {
      expect(viteConfig).toMatch(/changeOrigin:\s*true/)
    })
  })
})
