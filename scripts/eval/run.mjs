#!/usr/bin/env node
// Eval harness for the xyo-skills stack.
//
// Assembles a throwaway Claude-shaped plugin tree under .preview/claude, copies
// the eval suite into it, and runs `claude plugin eval` against that tree.
//
// WHY THE DETOUR: `claude plugin eval` requires a plugin manifest at its target,
// and this repo deliberately carries none (CLAUDE.md, "Distribution Model").
// Rendering into .preview/ keeps every Claude-specific artifact downstream of
// the render boundary, exactly like the marketplace mirrors.
//
// RUN THIS BY HAND. The eval suite is deliberately not wired into CI and is not
// planned to be: it spends real model budget per run, and gating it would mean
// keeping an ANTHROPIC_API_KEY secret in a repo whose PRs can come from forks.
// Run it yourself before shipping skill changes — see evals/README.md. Do not
// add a workflow that invokes it.
//
// WHY evals/ IS A SIBLING OF skills/: the renderers copy a path allowlist
// (skills, assets, LICENSE), so anything outside that list cannot be published
// by any code path — exclusion by location, not by a filter someone has to
// remember. Moving cases under skills/ would put them inside an allowlisted
// path and ship them to both marketplace mirrors and every Skills.sh install.
// Do not move them.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { argv, exit } from 'node:process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')

const EVAL_SRC = path.join(REPO_ROOT, 'evals')
const PLUGIN_DIR = path.join(REPO_ROOT, '.preview', 'claude')
const RESULTS_ROOT = path.join(REPO_ROOT, '.eval-results')

// Pinned so a model rollout is not mistaken for a skill regression. The cost
// ceiling is sized so a full 3-run pass of the suite (~$11 list price at 23
// cases) completes; a ceiling hit skips judge graders and reports partial.
const AGENT_MODEL = 'claude-sonnet-5'
const JUDGE_MODEL = 'claude-haiku-4-5'
const THRESHOLD = '0.8'
const MAX_COST_USD = '20'
const CONCURRENCY = '4'

// The version `claude plugin eval` reached general availability. Older builds
// may still carry the command; whether it runs depends on server-side access,
// so this is advisory only — see warnStaleClaude below.
const MIN_CLAUDE = [2, 1, 269]

const USAGE = `\
Usage: pnpm eval [options] [-- <claude plugin eval flags>]

Options:
  --skill <name>   Run only evals/<name> (e.g. --skill xl1-patterns).
  --publish        Publish the HTML report (default: keep it local).
  --no-render      Reuse the existing .preview/claude tree.
  -h, --help       Show this message.

Any other flag is passed straight through to \`claude plugin eval\`, so
\`pnpm eval --runs 1 --ablation with-without\` works as you would expect.

Defaults applied unless you override them:
  --eval-dir evals  --ablation none  --threshold ${THRESHOLD}
  --model ${AGENT_MODEL}  --judge-model ${JUDGE_MODEL}
  --max-cost-usd ${MAX_COST_USD}  --concurrency ${CONCURRENCY}  --no-publish

Defaults the installed claude build does not accept are dropped automatically.

Ablation defaults to none. The no-plugin baseline answers "does the plugin help
at all?" — worth measuring once per case rather than on every run, and it doubles
the cost. For regression detection compare version over version instead (see
evals/README.md). Pass --ablation with-without when you want the delta.`

function parseArgs(args) {
  const opts = { skill: null, publish: false, render: true, passthrough: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--skill': opts.skill = args[++i]; break
      case '--publish': opts.publish = true; break
      case '--no-render': opts.render = false; break
      case '--': opts.passthrough.push(...args.slice(i + 1)); return opts
      case '-h':
      case '--help': console.log(USAGE); exit(0); break
      default: opts.passthrough.push(arg)
    }
  }
  return opts
}

function run(cmd, args, label) {
  const result = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit' })
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`)
  return result.status ?? 1
}

// Advisory, never fatal. `plugin eval` ships in builds older than its GA
// version, and whether it runs is decided server-side — so an older build is a
// reason to warn, not to refuse. If the command really is unavailable it says
// so itself ("plugin eval is currently in early access"), which beats guessing
// from a version string.
function warnStaleClaude() {
  const probe = spawnSync('claude', ['--version'], { encoding: 'utf8' })
  if (probe.error) {
    throw new Error('`claude` was not found on PATH. Install Claude Code, then re-run.')
  }
  const found = probe.stdout.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!found) return
  const version = found.slice(1, 4).map(Number)
  for (let i = 0; i < 3; i++) {
    if (version[i] > MIN_CLAUDE[i]) return
    if (version[i] < MIN_CLAUDE[i]) {
      console.warn(
        `⚠ claude ${version.join('.')} predates \`plugin eval\` general availability ` +
        `(${MIN_CLAUDE.join('.')}). Trying anyway.\n` +
        `  If it reports early access, upgrade with:\n` +
        `    brew uninstall --cask claude-code && brew install --cask claude-code@latest\n`,
      )
      return
    }
  }
}

// The flag set moves between Claude Code builds — `-j/--concurrency` is
// documented but absent from older ones, and passing an unknown flag aborts the
// run before any case executes. Read what this build actually accepts instead of
// hardcoding the documented set.
function supportedFlags() {
  const help = spawnSync('claude', ['plugin', 'eval', '--help'], { encoding: 'utf8' })
  if (help.error || !help.stdout) return null // can't tell; add nothing conditional
  return new Set(help.stdout.match(/(?<![\w-])-{1,2}[a-z][\w-]*/g) ?? [])
}

async function resolveEvalDir(skill) {
  if (!skill) return 'evals'
  const dir = path.join(EVAL_SRC, skill)
  try {
    if (!(await fs.stat(dir)).isDirectory()) throw new Error('not a directory')
  } catch {
    const available = (await fs.readdir(EVAL_SRC, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    throw new Error(`no eval group at evals/${skill}. Available: ${available.join(', ') || '(none)'}`)
  }
  return `evals/${skill}`
}

async function assembleTree(render) {
  if (render) {
    const status = run('node', ['scripts/marketplace-sync/build-claude.mjs', '--out', PLUGIN_DIR], 'renderer')
    if (status !== 0) throw new Error('marketplace render failed')
  }

  // `evals` is not in the renderer's managedPaths, so a re-render leaves any
  // previous copy in place. Clear it so stale cases cannot survive a rename.
  const dest = path.join(PLUGIN_DIR, 'evals')
  await fs.rm(dest, { recursive: true, force: true })
  await fs.cp(EVAL_SRC, dest, { recursive: true })
}

async function main() {
  const opts = parseArgs(argv.slice(2))
  const passthrough = opts.passthrough
  const has = (flag) => passthrough.includes(flag)

  warnStaleClaude()

  try {
    await fs.access(EVAL_SRC)
  } catch {
    throw new Error('no evals/ directory at the repo root — nothing to run.')
  }

  const evalDir = await resolveEvalDir(opts.skill)
  await assembleTree(opts.render)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputDir = path.join(RESULTS_ROOT, stamp)

  const flags = ['plugin', 'eval', PLUGIN_DIR, '--eval-dir', evalDir, '--output-dir', outputDir]
  const supported = supportedFlags()

  // Apply a default only when this build accepts the flag and the caller has
  // not already passed it.
  const addDefault = (flag, ...values) => {
    if (has(flag)) return false
    if (supported && !supported.has(flag)) return false
    flags.push(flag, ...values)
    return true
  }

  addDefault('--ablation', 'none')
  addDefault('--threshold', THRESHOLD)
  addDefault('--model', AGENT_MODEL)
  addDefault('--judge-model', JUDGE_MODEL)
  addDefault('--max-cost-usd', MAX_COST_USD)
  if (!has('-j') && !has('--concurrency')) addDefault('--concurrency', CONCURRENCY)

  // Reports leave the machine when published, so that is opt-in.
  if (!opts.publish && !has('--publish-report')) addDefault('--no-publish')

  flags.push(...passthrough)

  console.log(`\n▶ claude ${flags.join(' ')}\n`)
  const status = run('claude', flags, 'claude plugin eval')

  // 0 = every case met the threshold. 1 = a real failure. 2 = partial run
  // (cost ceiling or rejected credential), which is a budget signal rather than
  // a quality one — report it without calling the suite failed.
  if (status === 2) {
    console.warn(`\n⚠ partial run (exit 2): cost ceiling hit or credentials rejected. Results: ${outputDir}`)
    exit(0)
  }
  if (status === 0) console.log(`\n✓ suite passed. Results: ${outputDir}`)
  exit(status)
}

main().catch((err) => {
  console.error(`✗ ${err.message}`)
  exit(1)
})
