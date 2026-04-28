import { describe, expect, it } from 'vitest'

import { nodeTemplate } from './node.js'
import { assertExtendsBase } from './shared-assertions.js'

assertExtendsBase(nodeTemplate)

describe('node preset specifics', () => {
  it('extends the base @xylabs/tsconfig (no DOM)', () => {
    expect(nodeTemplate.tsconfig.extends).toBe('@xylabs/tsconfig')
  })

  it('overrides noEmit to false so `tsc` produces dist/', () => {
    expect(nodeTemplate.tsconfig.compilerOptions?.noEmit).toBe(false)
  })

  it('overrides allowImportingTsExtensions (required when noEmit is false)', () => {
    expect(nodeTemplate.tsconfig.compilerOptions?.allowImportingTsExtensions).toBe(false)
  })

  it('declares tsx for the dev script', () => {
    expect(nodeTemplate.deps.dev).toContain('tsx')
  })

  it('declares @types/node for Node-only globals', () => {
    expect(nodeTemplate.deps.dev).toContain('@types/node')
  })

  it('writes a single src/index.ts entry', () => {
    expect(nodeTemplate.files.some(f => f.dest === 'src/index.ts')).toBe(true)
  })

  it('declares a start script that runs the compiled entry', () => {
    expect(nodeTemplate.scripts.start).toBe('node dist/index.js')
  })

  it('declares a smoke test that runs `pnpm start`', () => {
    expect(nodeTemplate.smokeTest).toEqual({ pnpmScript: 'start' })
  })
})
