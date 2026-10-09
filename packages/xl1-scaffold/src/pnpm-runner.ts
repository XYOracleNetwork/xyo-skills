import { spawnSync } from 'node:child_process'

// How the scaffold starts pnpm in the generated project.
//
// Node 25+ no longer ships corepack, so `corepack pnpm@…` alone fails on a
// stock Node 26 (only node, npm and npx are on PATH). A pnpm on PATH is
// preferred: since 9.7 pnpm switches itself to the version the project's
// `packageManager` pins (manage-package-manager-versions). That switch is not
// guaranteed — pnpm 10 on macOS cannot start a pnpm 12 it downloads (ENOEXEC
// on the native-binary launcher) — so every candidate is probed with
// `--version` inside the project before it is used, and must report the
// pinned major.
export interface PnpmRunner {
  args: readonly string[]
  command: string
  label: string
}

export interface ProbeResult {
  // Spawn error code (ENOENT, ENOEXEC, EACCES, …) when the process never started.
  errorCode?: string
  status: number | null
  stderr: string
  stdout: string
}

export type Probe = (runner: PnpmRunner) => ProbeResult

export interface ProbeFailure {
  // missing: not on PATH. unstartable: on PATH but the OS refused to run it
  // (ENOEXEC: a pnpm 12 installed with its install script skipped). failed:
  // ran but `--version` failed (e.g. an older pnpm that cannot switch).
  // wrong-major: ran a pnpm other than the pinned major.
  kind: 'failed' | 'missing' | 'unstartable' | 'wrong-major'
  reason: string
  runner: PnpmRunner
}

export type RunnerSelection
  = | { failures: ProbeFailure[]; runner: PnpmRunner; version: string }
    | { failures: ProbeFailure[]; runner?: undefined }

// pnpm on PATH first, then corepack pinned to the exact version.
export function pnpmRunners(pnpmVersion: string): PnpmRunner[] {
  return [
    {
      command: 'pnpm', args: [], label: 'pnpm (on PATH)',
    },
    {
      command: 'corepack', args: [`pnpm@${pnpmVersion}`], label: `corepack pnpm@${pnpmVersion}`,
    },
  ]
}

// Last line of `pnpm --version` stdout that looks like a version. pnpm may
// print notices around it while it switches versions.
export function parsePnpmVersion(stdout: string): string | undefined {
  return stdout.split(/\r?\n/).map(line => line.trim()).findLast(line => /^\d+\.\d+\.\d+/.test(line))
}

function lastLines(text: string, count: number): string {
  return text.trim().split(/\r?\n/).slice(-count).join(' | ')
}

// Probes each runner in order and returns the first that runs pnpm `major`.
// Pure apart from the injected probe, so the fallback order is unit-testable.
export function selectPnpmRunner(runners: readonly PnpmRunner[], major: string, probe: Probe): RunnerSelection {
  const failures: ProbeFailure[] = []
  for (const runner of runners) {
    const result = probe(runner)
    if (result.errorCode !== undefined) {
      failures.push(result.errorCode === 'ENOENT'
        ? {
            runner, kind: 'missing', reason: 'not found on PATH (ENOENT)',
          }
        : {
            runner, kind: 'unstartable', reason: `could not be started (${result.errorCode})`,
          })
      continue
    }
    const version = parsePnpmVersion(result.stdout)
    if (result.status !== 0 || version === undefined) {
      const detail = lastLines(`${result.stderr}\n${result.stdout}`, 2)
      failures.push({
        runner, kind: 'failed', reason: `\`--version\` exited ${result.status ?? 'abnormally'}${detail ? `: ${detail}` : ''}`,
      })
      continue
    }
    if (version.split('.', 1)[0] !== major) {
      failures.push({
        runner, kind: 'wrong-major', reason: `runs pnpm ${version}, not ${major}.x`,
      })
      continue
    }
    return {
      runner, version, failures,
    }
  }
  return { failures }
}

// The message printed when no runner works. `continueWith` is the command
// sequence that finishes the job once pnpm is installed.
export function pnpmUnavailableMessage(pnpmVersion: string, failures: readonly ProbeFailure[], continueWith: string): string {
  const major = pnpmVersion.split('.', 1)[0]
  const kinds = new Set(failures.map(f => f.kind))
  const hints: string[] = []
  if (kinds.has('failed') || kinds.has('wrong-major')) {
    hints.push(`  # The pnpm on PATH could not run pnpm ${major}; upgrading it to ${major} fixes that.`)
  }
  if (kinds.has('unstartable')) {
    hints.push(`  # ENOEXEC: npm skipped pnpm's install script. Reinstall with: npm i -g pnpm@${major} --allow-scripts=pnpm`)
  }
  return [
    `pnpm ${major} is needed to install the generated project (package.json pins pnpm@${pnpmVersion}), but no usable pnpm was found:`,
    ...failures.map(f => `  - ${f.runner.label}: ${f.reason}`),
    '',
    'Node.js 25+ no longer bundles corepack. Install pnpm, then finish the scaffold:',
    `  npm i -g pnpm@${major}    # standalone pnpm; it switches itself to the pinned version`,
    '  # or: npm i -g corepack && corepack enable pnpm',
    ...hints,
    '',
    `The project files are already written. Next: ${continueWith}`,
  ].join('\n')
}

// spawnSync reports a process that never started through `error` (with
// `status` null); its errno code is what tells "not installed" from "cannot run".
function spawnErrorCode(error: Error | undefined): string | undefined {
  if (error === undefined) return undefined
  const { code } = error as Error & { code?: unknown }
  return typeof code === 'string' ? code : error.name
}

export function probeWithSpawn(cwd: string): Probe {
  return (runner) => {
    const r = spawnSync(runner.command, [...runner.args, '--version'], { cwd, encoding: 'utf8' })
    return {
      errorCode: spawnErrorCode(r.error),
      status: r.status,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
    }
  }
}
