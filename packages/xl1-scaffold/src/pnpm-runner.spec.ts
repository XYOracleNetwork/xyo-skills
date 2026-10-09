import {
  describe, expect, it,
} from 'vitest'

import type { PnpmRunner, ProbeResult } from './pnpm-runner.js'
import {
  parsePnpmVersion, pnpmRunners, pnpmUnavailableMessage, selectPnpmRunner,
} from './pnpm-runner.js'

const RUNNERS = pnpmRunners('12.10.1')

function ok(stdout: string): ProbeResult {
  return {
    status: 0, stdout, stderr: '',
  }
}
function missing(): ProbeResult {
  return {
    errorCode: 'ENOENT', status: null, stdout: '', stderr: '',
  }
}

// Fake probe keyed by command name; records the order it was asked in.
function fakeProbe(results: Record<string, ProbeResult>) {
  const calls: string[] = []
  const probe = (runner: PnpmRunner): ProbeResult => {
    calls.push(runner.command)
    return results[runner.command] ?? missing()
  }
  return { calls, probe }
}

describe('pnpmRunners', () => {
  it('tries pnpm on PATH first, then corepack pinned to the exact version', () => {
    expect(RUNNERS.map(r => [r.command, ...r.args])).toEqual([['pnpm'], ['corepack', 'pnpm@12.10.1']])
  })
})

describe('parsePnpmVersion', () => {
  it('takes the last version-looking line', () => {
    expect(parsePnpmVersion('Switching to pnpm 12.10.1...\n12.10.1\n')).toBe('12.10.1')
    expect(parsePnpmVersion('nothing here')).toBeUndefined()
  })
})

describe('selectPnpmRunner', () => {
  it('uses pnpm on PATH when it reports the pinned major (stock Node 26 + npm i -g pnpm)', () => {
    const { calls, probe } = fakeProbe({ pnpm: ok('12.10.1\n') })
    const selection = selectPnpmRunner(RUNNERS, '12', probe)
    expect(selection.runner?.command).toBe('pnpm')
    expect(calls).toEqual(['pnpm'])
  })

  it('falls back to corepack when pnpm is not on PATH', () => {
    const { calls, probe } = fakeProbe({ corepack: ok('12.10.1\n') })
    const selection = selectPnpmRunner(RUNNERS, '12', probe)
    expect(selection.runner?.command).toBe('corepack')
    expect(selection.failures.map(f => f.reason)).toEqual(['not found on PATH (ENOENT)'])
    expect(calls).toEqual(['pnpm', 'corepack'])
  })

  // pnpm 10 on macOS cannot start the pnpm 12 it downloads for the switch.
  it('falls back when pnpm on PATH fails to switch to the pinned version', () => {
    const { probe } = fakeProbe({
      pnpm: {
        status: 1, stdout: '', stderr: 'ERROR  Failed to switch pnpm to v12.10.1\nspawnSync …/pnpm ENOEXEC',
      },
      corepack: ok('12.10.1'),
    })
    const selection = selectPnpmRunner(RUNNERS, '12', probe)
    expect(selection.runner?.command).toBe('corepack')
    expect(selection.failures[0].reason).toMatch(/exited 1: .*Failed to switch pnpm to v12\.10\.1/)
  })

  it('rejects a runner on the wrong major (version switching turned off)', () => {
    const { probe } = fakeProbe({ pnpm: ok('10.33.2'), corepack: ok('12.10.1') })
    const selection = selectPnpmRunner(RUNNERS, '12', probe)
    expect(selection.runner?.command).toBe('corepack')
    expect(selection.failures[0].reason).toBe('runs pnpm 10.33.2, not 12.x')
  })

  // Stock Node 26: only node, npm and npx — neither pnpm nor corepack.
  it('returns no runner, with every failure, when nothing can run pnpm', () => {
    const { probe } = fakeProbe({})
    const selection = selectPnpmRunner(RUNNERS, '12', probe)
    expect(selection.runner).toBeUndefined()
    expect(selection.failures.map(f => f.runner.command)).toEqual(['pnpm', 'corepack'])
  })

  it('reports a launcher that cannot be executed (pnpm installed with scripts skipped)', () => {
    const { probe } = fakeProbe({
      pnpm: {
        errorCode: 'ENOEXEC', status: null, stdout: '', stderr: '',
      },
    })
    expect(selectPnpmRunner(RUNNERS, '12', probe).failures[0].reason).toBe('could not be started (ENOEXEC)')
  })
})

describe('pnpmUnavailableMessage', () => {
  it('lists what was tried and how to install pnpm without corepack', () => {
    const { probe } = fakeProbe({})
    const { failures } = selectPnpmRunner(RUNNERS, '12', probe)
    const message = pnpmUnavailableMessage('12.10.1', failures, 'cd app && pnpm install')
    expect(message).toContain('pnpm@12.10.1')
    expect(message).toContain('pnpm (on PATH): not found on PATH (ENOENT)')
    expect(message).toContain('corepack pnpm@12.10.1: not found on PATH (ENOENT)')
    expect(message).toContain('npm i -g pnpm@12')
    expect(message).toContain('npm i -g corepack')
    expect(message).toContain('Next: cd app && pnpm install')
    expect(message).not.toContain('ENOEXEC')
    expect(message).not.toContain('could not run pnpm 12')
  })

  it('adds the upgrade hint when an older pnpm could not switch, and the ENOEXEC hint only for ENOEXEC', () => {
    const switchFailed = selectPnpmRunner(RUNNERS, '12', fakeProbe({
      pnpm: {
        status: 1, stdout: '', stderr: 'ERROR  Failed to switch pnpm to v12.10.1',
      },
    }).probe)
    const switchMessage = pnpmUnavailableMessage('12.10.1', switchFailed.failures, 'x')
    expect(switchMessage).toContain('could not run pnpm 12')
    expect(switchMessage).not.toContain('--allow-scripts')

    const unstartable = selectPnpmRunner(RUNNERS, '12', fakeProbe({
      pnpm: {
        errorCode: 'ENOEXEC', status: null, stdout: '', stderr: '',
      },
    }).probe)
    expect(pnpmUnavailableMessage('12.10.1', unstartable.failures, 'x')).toContain('npm i -g pnpm@12 --allow-scripts=pnpm')
  })
})
