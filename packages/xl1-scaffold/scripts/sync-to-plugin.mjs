#!/usr/bin/env node
// Mirrors the compiled scaffold output into the xl1-scaffold skill directory
// so the Claude Code plugin ships a ready-to-run runtime. The skill invokes
// the CLI directly via `node "${CLAUDE_SKILL_DIR}/scripts/scaffold/..."` —
// no reliance on the plugin's bin/ PATH mechanism.
//
// Runs as part of `pnpm build` in packages/xl1-scaffold. CI verifies the
// plugin tree is in sync via
// `git diff --exit-code plugins/xl1-skills/skills/xl1-scaffold/scripts`.
//
// Pass --verbose to print what each entry was classified as and why.

import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERBOSE = process.argv.includes('--verbose')

const HERE = dirname(fileURLToPath(import.meta.url))
const SCAFFOLD_ROOT = resolve(HERE, '..')
const SRC = resolve(SCAFFOLD_ROOT, 'dist')

// Walk up from the scaffold package to find the workspace root.
function findWorkspaceRoot(startDir) {
  let dir = startDir
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    dir = dirname(dir)
  }
  throw new Error(`pnpm-workspace.yaml not found walking up from ${startDir}`)
}

const WORKSPACE_ROOT = findWorkspaceRoot(SCAFFOLD_ROOT)
const DEST = resolve(WORKSPACE_ROOT, 'plugins/xl1-skills/skills/xl1-scaffold/scripts/scaffold')

if (!existsSync(SRC)) {
  console.error(`Source dir missing: ${SRC}. Run tsc first.`)
  process.exit(1)
}

// Clean slate — prevents stale files from lingering when scaffold src is renamed or deleted.
if (existsSync(DEST)) rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })

// ---------------------------------------------------------------------------
// Filter rules — declarative. Add a new SKIP_RULE entry to exclude a class of
// files; add to BUNDLE_DIRS for a directory that should be copied wholesale.
// ---------------------------------------------------------------------------

// Skip predicates evaluated in order. First matching rule wins; the rule's
// `name` is what gets logged in --verbose mode. Each `test` receives the
// entry shape { name, srcPath } and returns true to skip.
const SKIP_RULES = [
  {
    name: 'declaration & sourcemap files',
    test: ({ name }) => /\.(d\.ts|d\.ts\.map|js\.map)$/.test(name),
  },
  {
    name: 'spec files',
    test: ({ name }) => /\.spec\.[a-z]+(\.map)?$/.test(name),
  },
  {
    // tsc emits one .js per .ts even when the source is types-only — produces a
    // useless `export {};` stub. Detect and skip.
    name: 'types-only stubs',
    test: ({ srcPath }) => {
      if (!srcPath.endsWith('.js')) return false
      const body = readFileSync(srcPath, 'utf8')
        .split('\n')
        .filter(line => !line.startsWith('//#'))
        .join('\n')
        .trim()
      return body === 'export {};'
    },
  },
  {
    // Catches both *.spec.js (caught earlier by pattern) and test helpers like
    // shared-assertions.js that import vitest without following the spec naming.
    name: 'test code (imports vitest)',
    test: ({ srcPath }) => {
      if (!srcPath.endsWith('.js')) return false
      return /from ['"]vitest(\/[^'"]*)?['"]/.test(readFileSync(srcPath, 'utf8'))
    },
  },
]

// Directories whose contents are copied as-is (no per-file filtering).
const BUNDLE_DIRS = new Set(['templates'])

function findSkipRule(entry) {
  return SKIP_RULES.find(rule => rule.test(entry))
}

function logDecision(action, srcPath, reason) {
  if (!VERBOSE) return
  const rel = relative(SRC, srcPath) || '.'
  const detail = reason ? `  (${reason})` : ''
  console.log(`  ${action.padEnd(7)} ${rel}${detail}`)
}

function copyFiltered(src, dest) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      if (BUNDLE_DIRS.has(entry.name)) {
        cpSync(srcPath, destPath, { recursive: true })
        logDecision('bundle', srcPath, 'BUNDLE_DIRS')
      } else {
        logDecision('recurse', srcPath)
        copyFiltered(srcPath, destPath)
      }
      continue
    }

    const skipRule = findSkipRule({ name: entry.name, srcPath })
    if (skipRule) {
      logDecision('skip', srcPath, skipRule.name)
      continue
    }

    cpSync(srcPath, destPath)
    logDecision('copy', srcPath)
  }
}

copyFiltered(SRC, DEST)

// Mark the entry executable. The skill invokes via `node <path>` so this isn't
// strictly required, but it means direct exec (via shebang) also works and
// avoids "permission denied" if anything along the chain tries that path.
chmodSync(join(DEST, 'scaffold-xl1-dapp.js'), 0o755)

// Re-emit README so it survives the rmSync above.
writeFileSync(
  join(DEST, 'README.md'),
  `# xl1-scaffold/scripts/scaffold/ — generated

Do not hand-edit. This directory is regenerated by:

\`\`\`shell
pnpm -w run build
\`\`\`

Source of truth: [\`packages/xl1-scaffold/\`](../../../../../packages/xl1-scaffold/).

CI enforces sync via \`git diff --exit-code plugins/xl1-skills/skills/xl1-scaffold/scripts\`.
`,
)

console.log(`Synced scaffold → ${relative(WORKSPACE_ROOT, DEST)}`)
