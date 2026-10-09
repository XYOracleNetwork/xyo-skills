import {
  describe, expect, it,
} from 'vitest'

import { buildPackageJson, NODE_ENGINE_RANGE } from './package-json.js'
import {
  nodeTemplate, reactTemplate, xl1MonorepoTemplate, xl1ServiceTemplate, xl1SharedTemplate,
} from './presets/index.js'
import type { Template } from './template.js'

const ALL_TEMPLATES = [reactTemplate, nodeTemplate, xl1ServiceTemplate, xl1MonorepoTemplate, xl1SharedTemplate]

function build(template: Template, workspaceMember: boolean): Record<string, unknown> {
  return buildPackageJson({
    template,
    workspaceMember,
    name: workspaceMember ? `@rps-game/${template.name}` : template.name,
    network: 'sequence',
    packageManager: 'pnpm@12.10.1',
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
    expect(build(nodeTemplate, false).packageManager).toBe('pnpm@12.10.1')
    expect(build(xl1MonorepoTemplate, false).packageManager).toBe('pnpm@12.10.1')
  })

  // npm and pnpm do not inherit `engines` from a workspace root, and
  // @xyo-network/sdk requires Node 26 — so every package declares it.
  it('declares engines.node >=26 for every template, members included', () => {
    expect(NODE_ENGINE_RANGE).toBe('>=26')
    for (const template of ALL_TEMPLATES) {
      for (const member of [false, true]) {
        expect(build(template, member).engines).toEqual({ node: '>=26' })
      }
    }
  })

  it('records xl1.network on standalone projects and the workspace root only', () => {
    expect(build(reactTemplate, false).xl1).toEqual({ network: 'sequence' })
    expect(build(xl1MonorepoTemplate, false).xl1).toEqual({ network: 'sequence' })
    expect(build(reactTemplate, true)).not.toHaveProperty('xl1')
    expect(build(xl1ServiceTemplate, true)).not.toHaveProperty('xl1')
  })
})
