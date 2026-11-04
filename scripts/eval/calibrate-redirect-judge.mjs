#!/usr/bin/env node
// Exercise the actual production LLM rubrics against fixed negative/positive
// answers. Official scaffold + file-focus fields keep the candidate independent
// of the agent's new response. No custom grader or copied rubric is involved.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const PLUGIN = path.join(ROOT, '.preview', 'redirect-judge-calibration')
const AGENT_MODEL = 'claude-sonnet-5'
const JUDGE_MODEL = 'claude-haiku-4-5'
const MAX_COST_USD = '20'

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: pnpm eval:judge-calibration [--prepare-only]\n\nChecks both production redirect judges against fixed omission and valid-referral answers.\nNegative native cases intentionally fail; calibration passes only when all expected verdicts match.\n--prepare-only writes ignored native fixtures without making model calls.')
    return
  }
  assert(args.every(arg => arg === '--prepare-only'), 'Unknown calibration argument')
  const fixtures = JSON.parse(await fs.readFile(path.join(HERE, 'fixtures/redirect-judge-candidates.json'), 'utf8'))
  assert.equal(new Set(fixtures.map(f => f.name)).size, fixtures.length, 'Duplicate calibration fixture name')
  for (const rubric of new Set(fixtures.map(f => f.rubric))) {
    assert.deepEqual(new Set(fixtures.filter(f => f.rubric === rubric).map(f => f.expectedPass)), new Set([false, true]), `${rubric} needs both negative and positive controls`)
  }

  await fs.rm(PLUGIN, { recursive: true, force: true })
  await fs.mkdir(path.join(PLUGIN, '.claude-plugin'), { recursive: true })
  await fs.writeFile(path.join(PLUGIN, '.claude-plugin/plugin.json'), JSON.stringify({
    name: 'xyo-redirect-judge-calibration', version: '0.0.0',
    description: 'Local calibration of the XYO production redirect rubrics',
  }, null, 2) + '\n')

  for (const fixture of fixtures) {
    assert(/^[a-z0-9-]+$/.test(fixture.name), 'Invalid fixture name')
    const production = await fs.readFile(path.join(ROOT, 'evals', fixture.rubric, 'graders/defers-instead-of-inventing.md'), 'utf8')
    const parts = production.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    assert(parts && /^type:\s*llm\s*$/m.test(parts[1]), 'Expected a production LLM rubric')
    const dir = path.join(PLUGIN, 'evals', fixture.name)
    await fs.mkdir(path.join(dir, 'graders'), { recursive: true })
    await fs.writeFile(path.join(dir, 'prompt.md'), `---\nmax_turns: 1\ntimeout_seconds: 90\nallowed_tools: []\n---\nThis is a seeded judge calibration. Do not read or change any files. Reply READY only.\n`)
    await fs.writeFile(path.join(dir, 'case.yaml'), `schema_version: "1.1"\nname: ${fixture.name}\ncontext:\n  scaffold_script: fixture.sh\n`)
    const delimiter = 'XYO_CALIBRATION_CANDIDATE_EOF'
    assert(!fixture.candidate.split('\n').includes(delimiter), 'Fixture collides with heredoc delimiter')
    await fs.writeFile(path.join(dir, 'fixture.sh'), `#!/usr/bin/env bash\nset -euo pipefail\ncat > candidate.md <<'${delimiter}'\n${fixture.candidate}\n${delimiter}\n`)
    await fs.writeFile(path.join(dir, 'graders/production-rubric.md'), `---\n${parts[1]}\nfocus:\n  source: file\n  path: candidate.md\n---\n${parts[2]}`)
  }
  console.log(`Prepared ${fixtures.length} seeded cases using the production rubrics: ${PLUGIN}`)
  if (args.includes('--prepare-only')) return

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const output = path.join(ROOT, '.eval-results', `redirect-judge-calibration-${stamp}`)
  const command = ['plugin', 'eval', PLUGIN, '--eval-dir', 'evals', '--output-dir', output,
    '--ablation', 'none', '--runs', '1', '--threshold', '0.8',
    '--model', AGENT_MODEL, '--judge-model', JUDGE_MODEL,
    '--max-cost-usd', MAX_COST_USD, '--concurrency', '4',
    '--scaffold', '--no-publish', '--trust-plugin']
  const native = spawnSync('claude', command, { cwd: ROOT, stdio: 'inherit' })
  if (native.error) throw native.error
  assert(native.status === 0 || native.status === 1, `Native calibration did not complete (exit ${native.status})`)
  const result = JSON.parse(await fs.readFile(path.join(output, 'aggregate-result.json'), 'utf8'))
  assert.equal(result.partial, false, `Partial calibration: ${result.partialReason}`)
  assert.equal(result.cases.length, fixtures.length, 'Calibration case count mismatch')
  assert.equal(new Set(result.cases.map(c => c.name)).size, fixtures.length, 'Duplicate result case')
  const checks = []
  for (const fixture of fixtures) {
    const item = result.cases.find(c => c.name === fixture.name)
    assert(item, `Missing calibration case ${fixture.name}`)
    assert.deepEqual(Object.keys(item.arms), ['with'], 'Unexpected calibration arm')
    assert.equal(item.arms.with.length, 1, 'Expected one calibration run')
    const run = item.arms.with[0]
    assert(!run.error && !run.aborted && !run.skippedPaidGraders, `Incomplete run ${fixture.name}`)
    assert.equal(run.graders.length, 1, 'Expected one actual production judge')
    const grader = run.graders[0]
    assert.equal(grader.name, 'production-rubric')
    assert.equal(grader.scored, true, 'Production judge was not scored')
    assert.equal(grader.judgeVotes.length, 3, 'Production judge did not return three votes')
    assert.equal(grader.evidence.trim(), fixture.candidate.trim(), 'Judge did not receive the fixed candidate')
    checks.push({ name: fixture.name, rubric: fixture.rubric, expectedPass: fixture.expectedPass,
      actualPass: grader.passed, judgeVotes: grader.judgeVotes, matched: grader.passed === fixture.expectedPass })
  }
  const summary = { passed: checks.every(check => check.matched), costUsd: result.costUsd,
    claudeVersion: result.claudeVersion, durationSeconds: result.durationSeconds, checks }
  await fs.writeFile(path.join(output, 'verified-calibration-summary.json'), JSON.stringify(summary, null, 2) + '\n')
  assert(summary.passed, `Judge calibration verdict mismatch. Results: ${output}`)
  console.log(`✓ ${checks.length} judge calibration verdicts matched (including positive controls). Results: ${output}`)
}

main().catch(error => {
  console.error(`✗ ${error.message}`)
  process.exit(1)
})
