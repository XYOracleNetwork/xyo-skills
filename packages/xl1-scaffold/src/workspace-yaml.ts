import type { ReleaseAgePolicy } from './registry.js'

// Packages in a generated project's dependency graph whose install scripts
// pnpm must run. pnpm 11+ fails the install (strictDepBuilds) when a
// dependency's build script is neither allowed nor denied here. One list
// covers every template: the monorepo root's file is written before its
// members' deps are resolved, and an entry for a package that is not in the
// graph is harmless.
export const ALLOW_BUILDS: Readonly<Record<string, boolean>> = {
  // tsx and Vite — native binary.
  'esbuild': true,
  // eslint-import-resolver-typescript (via @ariestools/eslint-config-flat) — native binary.
  'unrs-resolver': true,
}

export interface PnpmWorkspaceYamlOptions {
  allowBuilds?: Readonly<Record<string, boolean>>
  // `name@version` entries for picks no mature version could satisfy.
  extraExcludes?: readonly string[]
  // Workspace package globs. Omitted for a standalone project, whose file
  // only carries settings.
  packages?: readonly string[]
  policy: ReleaseAgePolicy
}

// The key line that opens the exclude list, so a later member scaffold can
// append to the root's file without a YAML parser.
const EXCLUDE_KEY = 'minimumReleaseAgeExclude:'

function quote(value: string): string {
  return `'${value.replaceAll('\'', '\'\'')}'`
}

// Builds pnpm-workspace.yaml for a standalone project or a monorepo root.
// pnpm 11+ reads every non-auth setting from this file (`.npmrc` is auth and
// registry only), and pnpm 12 rejects keys it does not recognize when the
// project's packageManager pin is the running pnpm — so only settings pnpm 12
// knows go in here.
//
// A standalone project gets this file too. Besides carrying the settings, it
// makes the project its own workspace root, so pnpm never walks up into an
// enclosing workspace (the job `--ignore-workspace` used to do, which also
// made pnpm skip the settings in this file).
export function buildPnpmWorkspaceYaml(options: PnpmWorkspaceYamlOptions): string {
  const {
    packages, policy, allowBuilds = ALLOW_BUILDS, extraExcludes = [],
  } = options
  const lines: string[] = []
  if (packages && packages.length > 0) {
    lines.push('packages:', ...packages.map(p => `  - ${quote(p)}`), '')
  }
  lines.push(
    '# pnpm 11+ fails the install when a dependency\'s build script is not listed',
    '# here (strictDepBuilds). `true` runs it, `false` skips it without failing.',
    'allowBuilds:',
    ...Object.entries(allowBuilds).toSorted(([a], [b]) => a.localeCompare(b)).map(([name, allowed]) => `  ${name}: ${allowed}`),
    '',
    `# Only install versions published at least ${policy.minutes} minutes ago. This is pnpm's`,
    '# default, set explicitly so pnpm gates a too-new version instead of silently',
    '# allow-listing it. The scaffold resolved every dependency under this same',
    '# rule. XYO\'s own scopes are exempt so a same-day SDK release can be used.',
    `minimumReleaseAge: ${policy.minutes}`,
    EXCLUDE_KEY,
    ...[...policy.exclude, ...extraExcludes].map(p => `  - ${quote(p)}`),
  )
  return `${lines.join('\n')}\n`
}

// Appends `name@version` entries to the minimumReleaseAgeExclude list of a
// pnpm-workspace.yaml written by buildPnpmWorkspaceYaml. Returns undefined
// when the file does not have that list (hand-edited or not ours), so the
// caller can tell the user to add the entries instead.
export function addReleaseAgeExcludes(yaml: string, entries: readonly string[]): string | undefined {
  const lines = yaml.split('\n')
  const start = lines.findIndex(line => line.trimEnd() === EXCLUDE_KEY)
  if (start === -1) return undefined
  let end = start + 1
  while (end < lines.length && /^\s+-\s/.test(lines[end])) end++
  const existing = new Set(lines.slice(start + 1, end).map(line => line.replace(/^\s+-\s+/, '').replaceAll(/^'|'$/g, '')))
  const added = entries.filter(entry => !existing.has(entry)).map(entry => `  - ${quote(entry)}`)
  return [...lines.slice(0, end), ...added, ...lines.slice(end)].join('\n')
}
