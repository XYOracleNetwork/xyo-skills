import { describe, expect, it } from 'vitest'

import { assertExtendsBase } from './shared-assertions.js'
import { xl1MonorepoTemplate } from './xl1-monorepo.js'

assertExtendsBase(xl1MonorepoTemplate)

describe('xl1-monorepo preset specifics', () => {
  it('declares pnpm-workspace.yaml as a written file', () => {
    expect(xl1MonorepoTemplate.files.some(f => f.dest === 'pnpm-workspace.yaml')).toBe(true)
  })

  it('declares a top-level README', () => {
    expect(xl1MonorepoTemplate.files.some(f => f.dest === 'README.md')).toBe(true)
  })

  it('uses workspace orchestration scripts (pnpm -r)', () => {
    expect(xl1MonorepoTemplate.scripts.build).toBe('pnpm -r run build')
    expect(xl1MonorepoTemplate.scripts.lint).toBe('pnpm -r run lint')
    expect(xl1MonorepoTemplate.scripts.typecheck).toBe('pnpm -r run typecheck')
    expect(xl1MonorepoTemplate.scripts.test).toBe('pnpm -r run test')
  })

  it('declares a parallel `dev` script so app + service run concurrently', () => {
    // Locks in the browser-service-wiring prescription: one command at the
    // workspace root brings up both processes. --parallel is required so they
    // run concurrently (default `pnpm -r run` is sequential).
    expect(xl1MonorepoTemplate.scripts.dev).toBe('pnpm -r --parallel run dev')
  })

  it('skips emitting tsconfig.json (workspace root has no source)', () => {
    expect(xl1MonorepoTemplate.omitTsconfig).toBe(true)
  })

  it('has no smoke test', () => {
    expect(xl1MonorepoTemplate.smokeTest).toBeUndefined()
  })

  it('has no runtime deps at the root', () => {
    expect(xl1MonorepoTemplate.deps.runtime).toEqual([])
  })

  it('writes a workspace-level .env.example', () => {
    expect(xl1MonorepoTemplate.files.some(f => f.dest === '.env.example')).toBe(true)
  })
})
