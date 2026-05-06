import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { assertExtendsBase } from './shared-assertions.js'
import { xl1ServiceTemplate } from './xl1-service.js'

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates')

assertExtendsBase(xl1ServiceTemplate)

describe('xl1-service preset specifics', () => {
  it('declares express as a runtime dep', () => {
    expect(xl1ServiceTemplate.deps.runtime).toContain('express')
  })

  it('pins express to the v5 major', () => {
    expect(xl1ServiceTemplate.deps.versions?.express).toBe('^5')
  })

  it('declares @types/express as a dev dep', () => {
    expect(xl1ServiceTemplate.deps.dev).toContain('@types/express')
  })

  it('inherits node-only dev deps', () => {
    expect(xl1ServiceTemplate.deps.dev).toContain('tsx')
    expect(xl1ServiceTemplate.deps.dev).toContain('@types/node')
  })

  it('inherits node\'s start script', () => {
    expect(xl1ServiceTemplate.scripts.start).toBe('node dist/index.js')
  })

  it('overrides the entry source (not node\'s hello-world)', () => {
    const indexEntry = xl1ServiceTemplate.files.find(f => f.dest === 'src/index.ts')
    expect(indexEntry?.src).toBe('xl1-service/src/index.ts')
  })

  it('inherits node\'s eslint and vitest configs verbatim', () => {
    const eslint = xl1ServiceTemplate.files.find(f => f.dest === 'eslint.config.mjs')
    expect(eslint?.src).toBe('node/eslint.config.mjs')
    const vitest = xl1ServiceTemplate.files.find(f => f.dest === 'vitest.config.ts')
    expect(vitest?.src).toBe('node/vitest.config.ts')
  })

  it('declares a real smoke test that exits cleanly', () => {
    expect(xl1ServiceTemplate.smokeTest).toEqual({ pnpmScript: 'smoke' })
    expect(xl1ServiceTemplate.scripts.smoke).toContain('--smoke-test')
  })

  it('inherits dotenv from the node preset', () => {
    expect(xl1ServiceTemplate.deps.runtime).toContain('dotenv')
  })

  it('overrides node\'s .env.example with a service-specific one', () => {
    const envExample = xl1ServiceTemplate.files.find(f => f.dest === '.env.example')
    expect(envExample?.src).toBe('xl1-service/_env.example')
  })

  describe('browser-service-wiring (template file contents)', () => {
    // Lock in the prescriptive port (3001) and the /api/* base path. Both are
    // load-bearing for the same-origin Vite proxy prescription documented in
    // xl1-patterns/browser-service-wiring.md.
    it('defaults the service port to 3001 in .env.example', () => {
      const envExample = readFileSync(path.join(TEMPLATES_DIR, 'xl1-service/_env.example'), 'utf8')
      expect(envExample).toMatch(/^PORT=3001$/m)
    })

    it('defaults the service port to 3001 in src/index.ts', () => {
      const indexSrc = readFileSync(path.join(TEMPLATES_DIR, 'xl1-service/src/index.ts'), 'utf8')
      expect(indexSrc).toMatch(/process\.env\.PORT\)?\s*\|\|\s*3001/)
    })

    it('mounts the hello route under /api/*', () => {
      const indexSrc = readFileSync(path.join(TEMPLATES_DIR, 'xl1-service/src/index.ts'), 'utf8')
      expect(indexSrc).toContain("app.get('/api/")
      expect(indexSrc).not.toMatch(/app\.get\(['"]\/['"]/)
    })

    it('does NOT pull in `cors` middleware', () => {
      // The default same-origin topology has nothing to CORS for; cors() in
      // the template would train agents to assume cross-origin layouts.
      expect(xl1ServiceTemplate.deps.runtime).not.toContain('cors')
      expect(xl1ServiceTemplate.deps.dev).not.toContain('@types/cors')
      const indexSrc = readFileSync(path.join(TEMPLATES_DIR, 'xl1-service/src/index.ts'), 'utf8')
      expect(indexSrc).not.toMatch(/from\s+['"]cors['"]/)
    })
  })
})
