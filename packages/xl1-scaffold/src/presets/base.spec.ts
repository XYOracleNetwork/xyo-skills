import {
  describe, expect, it,
} from 'vitest'

import {
  baseTemplate, extendBase, omitScripts,
} from './base.js'

describe('base preset', () => {
  // A fresh scaffold has no specs; plain `vitest run` exits 1 on
  // "No test files found", which failed `pnpm test` on every new project.
  it('runs vitest with --passWithNoTests', () => {
    expect(baseTemplate.scripts.test).toBe('vitest run --passWithNoTests')
  })

  it('pins typescript to ^5 (typescript-eslint does not support TS 7)', () => {
    expect(baseTemplate.deps.versions?.typescript).toBe('^5')
  })
})

describe('omitScripts', () => {
  it('drops the named scripts and keeps the rest', () => {
    const template = omitScripts(extendBase({ name: 'x', description: 'x' }), ['test:watch'])
    expect(template.scripts).not.toHaveProperty('test:watch')
    expect(template.scripts.test).toBe(baseTemplate.scripts.test)
    expect(template.scripts.lint).toBe(baseTemplate.scripts.lint)
  })

  it('does not mutate the input template', () => {
    const template = extendBase({ name: 'x', description: 'x' })
    omitScripts(template, ['test:watch'])
    expect(template.scripts).toHaveProperty('test:watch')
  })
})
