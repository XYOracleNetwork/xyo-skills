import {
  describe, expect, it,
} from 'vitest'

import { RELEASE_AGE_POLICY } from './registry.js'
import {
  addReleaseAgeExcludes, ALLOW_BUILDS, buildPnpmWorkspaceYaml,
} from './workspace-yaml.js'

describe('buildPnpmWorkspaceYaml', () => {
  const standalone = buildPnpmWorkspaceYaml({ policy: RELEASE_AGE_POLICY })
  const root = buildPnpmWorkspaceYaml({ policy: RELEASE_AGE_POLICY, packages: ['packages/*'] })

  it('lists workspace packages only for a workspace root', () => {
    expect(root).toMatch(/^packages:\n {2}- 'packages\/\*'\n/)
    expect(standalone).not.toMatch(/^packages:/m)
  })

  it('sets an explicit one-day minimumReleaseAge with our scopes exempt', () => {
    for (const yaml of [standalone, root]) {
      expect(yaml).toMatch(/^minimumReleaseAge: 1440$/m)
      expect(yaml).toContain("minimumReleaseAgeExclude:\n  - '@ariestools/*'\n  - '@xyo-network/*'\n")
    }
  })

  it('allow-lists the dependency builds pnpm 12 would otherwise fail on', () => {
    for (const name of Object.keys(ALLOW_BUILDS)) expect(standalone).toMatch(new RegExp(`^ {2}${name}: (?:true|false)$`, 'm'))
    expect(ALLOW_BUILDS).toMatchObject({ 'esbuild': true, 'unrs-resolver': true })
  })

  it('appends immature picks to the exclude list', () => {
    const yaml = buildPnpmWorkspaceYaml({ policy: RELEASE_AGE_POLICY, extraExcludes: ['brand-new@0.1.0'] })
    expect(yaml).toContain("  - '@xyo-network/*'\n  - 'brand-new@0.1.0'\n")
  })

  it('writes only settings pnpm 12 recognizes (it rejects unknown keys)', () => {
    const keys = root.matchAll(/^([A-Za-z]+):/gm).map(m => m[1]).toArray()
    expect(keys.toSorted()).toEqual(['allowBuilds', 'minimumReleaseAge', 'minimumReleaseAgeExclude', 'packages'])
  })
})

describe('addReleaseAgeExcludes', () => {
  const yaml = buildPnpmWorkspaceYaml({ policy: RELEASE_AGE_POLICY, packages: ['packages/*'] })

  it('appends new entries to the end of the list', () => {
    const out = addReleaseAgeExcludes(yaml, ['a@1.0.0', 'b@2.0.0'])
    expect(out).toContain("  - '@xyo-network/*'\n  - 'a@1.0.0'\n  - 'b@2.0.0'\n")
  })

  it('does not duplicate an entry already present', () => {
    const once = addReleaseAgeExcludes(yaml, ['a@1.0.0']) ?? ''
    expect(addReleaseAgeExcludes(once, ['a@1.0.0'])).toBe(once)
  })

  it('returns undefined for a file without the list', () => {
    expect(addReleaseAgeExcludes("packages:\n  - 'packages/*'\n", ['a@1.0.0'])).toBeUndefined()
  })
})
