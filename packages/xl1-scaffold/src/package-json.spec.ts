import {
  describe, expect, it,
} from 'vitest'

import { buildPackageJson } from './package-json.js'
import {
  nodeTemplate, reactTemplate, xl1MonorepoTemplate, xl1ServiceTemplate, xl1SharedTemplate,
} from './presets/index.js'
import type { Template } from './template.js'

function build(template: Template, workspaceMember: boolean): Record<string, unknown> {
  return buildPackageJson({
    template,
    workspaceMember,
    name: workspaceMember ? `@rps-game/${template.name}` : template.name,
    packageManager: 'pnpm@10.0.0',
    dependencies: {},
    devDependencies: {},
  })
}

describe('buildPackageJson', () => {
  // Regression: without `exports`, `import … from '@<scope>/shared'` fails to
  // resolve under NodeNext and Vite in app/service.
  it('emits an exports map for the xl1-shared workspace member', () => {
    const pkg = build(xl1SharedTemplate, true)
    expect(pkg.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        default: './dist/index.js',
      },
    })
  })

  it('lists the `types` condition first so TypeScript matches it before `default`', () => {
    const pkg = build(xl1SharedTemplate, true)
    const root = (pkg.exports as Record<string, Record<string, string>>)['.']
    expect(Object.keys(root)[0]).toBe('types')
  })

  it('emits no exports for app/service/root templates (nothing imports them)', () => {
    for (const template of [reactTemplate, nodeTemplate, xl1ServiceTemplate, xl1MonorepoTemplate]) {
      expect(build(template, false)).not.toHaveProperty('exports')
    }
  })

  it('omits packageManager for workspace members only', () => {
    expect(build(xl1SharedTemplate, true)).not.toHaveProperty('packageManager')
    expect(build(nodeTemplate, false).packageManager).toBe('pnpm@10.0.0')
  })
})
