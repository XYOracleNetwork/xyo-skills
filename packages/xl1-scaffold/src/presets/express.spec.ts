import { describe, expect, it } from 'vitest'

import { expressTemplate } from './express.js'
import { assertExtendsBase } from './shared-assertions.js'

assertExtendsBase(expressTemplate)

describe('express preset specifics', () => {
  it('declares express as a runtime dep', () => {
    expect(expressTemplate.deps.runtime).toContain('express')
  })

  it('pins express to the v5 major', () => {
    expect(expressTemplate.deps.versions?.express).toBe('^5')
  })

  it('declares @types/express as a dev dep', () => {
    expect(expressTemplate.deps.dev).toContain('@types/express')
  })

  it('inherits node-only dev deps', () => {
    expect(expressTemplate.deps.dev).toContain('tsx')
    expect(expressTemplate.deps.dev).toContain('@types/node')
  })

  it('inherits node\'s start script', () => {
    expect(expressTemplate.scripts.start).toBe('node dist/index.js')
  })

  it('overrides the entry source (not node\'s hello-world)', () => {
    const indexEntry = expressTemplate.files.find(f => f.dest === 'src/index.ts')
    expect(indexEntry?.src).toBe('express/src/index.ts')
  })

  it('inherits node\'s eslint and vitest configs verbatim', () => {
    const eslint = expressTemplate.files.find(f => f.dest === 'eslint.config.mjs')
    expect(eslint?.src).toBe('node/eslint.config.mjs')
    const vitest = expressTemplate.files.find(f => f.dest === 'vitest.config.ts')
    expect(vitest?.src).toBe('node/vitest.config.ts')
  })

  it('declares a real smoke test that exits cleanly', () => {
    expect(expressTemplate.smokeTest).toEqual({ pnpmScript: 'smoke' })
    expect(expressTemplate.scripts.smoke).toContain('--smoke-test')
  })
})
