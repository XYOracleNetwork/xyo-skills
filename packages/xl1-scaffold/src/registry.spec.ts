import {
  describe, expect, it,
} from 'vitest'

import type { Packument } from './registry.js'
import {
  compareVersions, isReleaseAgeExempt, pickPnpmVersion, pickVersion, RELEASE_AGE_POLICY, releaseAgeCutoff,
} from './registry.js'

const NOW = new Date('2026-10-09T19:00:00Z')
const CUTOFF = releaseAgeCutoff(RELEASE_AGE_POLICY, NOW)

function packument(latest: string, times: Record<string, string>, deprecated: string[] = []): Packument {
  return {
    'dist-tags': { latest },
    'time': times,
    'versions': Object.fromEntries(Object.keys(times).map(v => [v, deprecated.includes(v) ? { deprecated: 'no' } : {}])),
  }
}

describe('release-age policy', () => {
  it('matches pnpm: 1 day, with our own scopes exempt', () => {
    expect(RELEASE_AGE_POLICY.minutes).toBe(1440)
    expect(RELEASE_AGE_POLICY.exclude).toEqual(['@ariestools/*', '@xyo-network/*'])
  })

  it('treats @xyo-network/* and @ariestools/* as exempt, everything else as gated', () => {
    expect(isReleaseAgeExempt('@xyo-network/xl1-sdk', RELEASE_AGE_POLICY)).toBe(true)
    expect(isReleaseAgeExempt('@ariestools/eslint-config-flat', RELEASE_AGE_POLICY)).toBe(true)
    expect(isReleaseAgeExempt('@types/node', RELEASE_AGE_POLICY)).toBe(false)
    expect(isReleaseAgeExempt('@xyo-network-fake/x', RELEASE_AGE_POLICY)).toBe(false)
    expect(isReleaseAgeExempt('react', RELEASE_AGE_POLICY)).toBe(false)
  })

  it('cuts off one day before now', () => {
    expect(CUTOFF.toISOString()).toBe('2026-10-08T19:00:00.000Z')
  })
})

describe('compareVersions', () => {
  it('orders numerically, not lexically', () => {
    expect(compareVersions('26.10.0', '26.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('9.0.0', '10.0.0')).toBeLessThan(0)
  })
})

describe('pickVersion', () => {
  // The @types/node case: 26.6.5 published today must not be written as the
  // floor, or pnpm's minimumReleaseAge check rejects the install.
  it('skips a latest published inside the cutoff for the newest mature version', () => {
    const doc = packument('26.6.5', { '26.6.4': '2026-10-01T22:39:22Z', '26.6.5': '2026-10-09T18:46:47Z' })
    expect(pickVersion(doc, { cutoff: CUTOFF })).toEqual({ version: '26.6.4', immature: false })
  })

  it('takes latest when it is old enough', () => {
    const doc = packument('2.0.0', { '1.0.0': '2025-01-01T00:00:00Z', '2.0.0': '2026-10-01T00:00:00Z' })
    expect(pickVersion(doc, { cutoff: CUTOFF }).version).toBe('2.0.0')
  })

  it('never picks above dist-tags.latest (e.g. a release on `next`)', () => {
    const doc = packument('1.0.0', { '1.0.0': '2025-01-01T00:00:00Z', '1.1.0': '2025-02-01T00:00:00Z' })
    expect(pickVersion(doc, { cutoff: CUTOFF }).version).toBe('1.0.0')
  })

  it('ignores prereleases and deprecated versions', () => {
    const doc = packument('3.0.0', {
      '2.0.0': '2025-01-01T00:00:00Z',
      '2.1.0': '2025-02-01T00:00:00Z',
      '3.0.0-rc.1': '2025-03-01T00:00:00Z',
      '3.0.0': '2026-10-09T12:00:00Z',
    }, ['2.1.0'])
    expect(pickVersion(doc, { cutoff: CUTOFF }).version).toBe('2.0.0')
  })

  it('falls back to the newest candidate, flagged immature, when nothing is old enough', () => {
    const doc = packument('0.1.0', { '0.0.1': '2026-10-09T01:00:00Z', '0.1.0': '2026-10-09T02:00:00Z' })
    expect(pickVersion(doc, { cutoff: CUTOFF })).toEqual({ version: '0.1.0', immature: true })
  })

  it('applies no age check without a cutoff', () => {
    const doc = packument('26.6.5', { '26.6.4': '2026-10-01T22:39:22Z', '26.6.5': '2026-10-09T18:46:47Z' })
    expect(pickVersion(doc)).toEqual({ version: '26.6.5', immature: false })
  })

  it('throws when no stable version qualifies', () => {
    expect(() => pickVersion(packument('1.0.0-beta.1', { '1.0.0-beta.1': '2025-01-01T00:00:00Z' }))).toThrow()
  })
})

describe('pickPnpmVersion', () => {
  // Shape of the real pnpm packument on 2026-10-09: 12.11.x is on `next-12`
  // and under a day old; `latest` / `latest-12` is 12.10.1.
  const doc: Packument = {
    'dist-tags': {
      'latest': '12.10.1', 'latest-12': '12.10.1', 'next-12': '12.11.2', 'latest-11': '11.28.2',
    },
    'time': {
      '11.28.2': '2026-09-30T00:00:00Z',
      '12.10.0': '2026-10-06T05:24:13Z',
      '12.10.1': '2026-10-06T17:35:56Z',
      '12.11.0': '2026-10-09T06:42:45Z',
      '12.11.2': '2026-10-09T17:35:58Z',
    },
    'versions': {
      '11.28.2': {}, '12.10.0': {}, '12.10.1': {}, '12.11.0': {}, '12.11.2': {},
    },
  }

  it('pins the newest mature release at or below the major\'s dist-tag', () => {
    expect(pickPnpmVersion(doc, '12', CUTOFF)).toEqual({ version: '12.10.1', immature: false })
  })

  it('uses latest-<major> for an older major', () => {
    expect(pickPnpmVersion(doc, '11', CUTOFF).version).toBe('11.28.2')
  })
})
