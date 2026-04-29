import { describe, expect, it } from 'vitest'

import { assertExtendsBase } from './shared-assertions.js'
import { xl1ServiceTemplate } from './xl1-service.js'

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
})
