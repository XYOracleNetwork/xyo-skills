// Shared spec assertions for preset tests. Call `assertExtendsBase(yourTemplate)`
// from a `<preset>.spec.ts` file to verify the preset properly inherits everything
// in the shared base.
//
// Usage is OPT-IN: a new preset that doesn't yet inherit base won't fail CI
// unless its author imports this helper. Once the preset stabilizes, copy one of
// the sibling spec files as a template and add this assertion.

import { describe, expect, it } from 'vitest'

import type { Template } from '../template.js'
import { baseTemplate } from './base.js'

export function assertExtendsBase(template: Template): void {
  describe(`${template.name} preset inherits base`, () => {
    it('includes base dev deps', () => {
      for (const dep of baseTemplate.deps.dev) expect(template.deps.dev).toContain(dep)
    })

    it('includes base scripts', () => {
      for (const key of Object.keys(baseTemplate.scripts)) expect(template.scripts).toHaveProperty(key)
    })

    it('includes base files (matched by dest)', () => {
      for (const f of baseTemplate.files) {
        expect(template.files.some(g => g.dest === f.dest)).toBe(true)
      }
    })

    it('preserves base tsconfig.compilerOptions', () => {
      expect(template.tsconfig.compilerOptions).toMatchObject(baseTemplate.tsconfig.compilerOptions ?? {})
    })

    it('preserves base tsconfig.include entries', () => {
      for (const dir of baseTemplate.tsconfig.include ?? []) {
        expect(template.tsconfig.include).toContain(dir)
      }
    })
  })
}
