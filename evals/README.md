# Eval suite

Behavioral tests for the skill stack, run with [`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals).

```shell
pnpm eval                          # whole suite, 3 runs per case
pnpm eval --skill xl1-patterns     # one skill's cases
pnpm eval:smoke                    # tagged smoke cases, one run each
pnpm eval --tag xl1-build --tag xl1-scaffold --runs 1   # --tag is repeatable (OR)
pnpm eval --skill stack --case rps-evaluation-prompt    # --case takes ONE glob
pnpm eval --skill xl1-testing --runs 1 --keep-temp      # keep every run's trace
```

Every case is first-party, so `--scaffold` (run a case's fixture script) is on
by default; pass `--no-scaffold` to skip fixtures.

`pnpm eval --help` lists the defaults and every passthrough flag.

## Run this by hand

The suite is **deliberately not wired into CI, and that is not a pending
follow-up.** Every run spends real model budget, and gating it would mean
keeping an `ANTHROPIC_API_KEY` secret in a repo whose PRs can arrive from forks.
Please do not add a workflow that invokes `pnpm eval`.

The point to run it is before shipping skill changes — ahead of a
`develop` → `main` integration PR, since that is when edits actually reach
users. `pnpm validate:skills` is the free, agent-neutral check that *is* safe to
run anywhere, and CI already runs it on PRs touching `skills/**`.

The one eval-related thing CI does assert is that no rendered marketplace tree
contains an `evals/` directory (`.github/workflows/validate-plugins.yml`). That
costs nothing and guards the exclusion property described below — it does not
run any case.

## Why this directory is a sibling of `skills/`, not inside it

The marketplace renderers copy a **path allowlist** — `skills`, `assets`, `LICENSE`
(`scripts/marketplace-sync/lib.mjs`). Nothing else can reach the mirror repos or a
Skills.sh install, because no code path reads it.

That makes `evals/` excluded **by location**. Colocating cases under
`skills/<name>/evals/` would place them inside an allowlisted path, where they
would ship to consumers unless a subtractive filter removed them — and a filter
is something a future edit can regress past without anyone noticing. Cases can
carry `scaffold_script` shell, mock fixtures, and captured `.jsonl` transcripts,
so that leak is a security concern rather than only bloat.

**Do not move cases under `skills/`.** Mirror the skills tree here instead:

```
skills/xl1-patterns/SKILL.md
evals/xl1-patterns/commit-reveal-routing/
```

## Layout

Each case is a directory holding `prompt.md` (frontmatter: run limits and tags;
body: the prompt) and a `graders/` directory with one grader per file. One level
of grouping — `evals/<skill-name>/<case-name>/` — keeps `--eval-dir evals/<skill>`
working as the per-skill runner.

Case names are the bare directory name — the report shows `commit-reveal-routing`,
not `xl1-patterns/commit-reveal-routing`. The report keys on them and `--case`
globs match them, so two skills must not reuse a case directory name; make each
specific enough to stand alone.

## Suite map

Thirty-one cases. Judges marked **†** were rewritten after the audit so they
demand a fact only this pack carries; before that, every one of them passed
with no plugin loaded. At three runs per case on Claude Code 2.1.273 (Sonnet 5 agent, Haiku 4.5 judge):
29 cases at 1.00; `rps-evaluation-prompt` 0.94 (the DoD reference and the
stamp each missed one run of three); `dashboard-is-react-only` 0.83 on a
formatting-brittle regex since fixed, judge 3/3. Every case clears 0.8.

| Layer | Group | Cases | What they prove |
|---|---|---|---|
| L4 | `xl1-knowledge` | `rejects-raw-rpc`† · `rejects-ethereum-tooling` · `prefers-finalized-block-stream` · `indirect-intent-finality` | No JSON-RPC by method name (a concrete viewer call must be named), no EVM tooling, `FinalizedBlockStream` over `headUpdated` — and routing on intent stated without any doc vocabulary. |
| L5 | `xl1-patterns` | `commit-reveal-routing`† · `reads-indexing-protocol-first`† · `no-cors-same-origin`† · `refuses-datalake-permissions` · `missing-reveal-blocks-settlement` · `browser-ux-required` | CSPRNG salt + commit-deadline gate; protocol file before role file with floor block, hash checkpoint, finalized stream; Vite `server.proxy` and the single-domain reverse proxy; `xyoDataLakes_*` refused for `createRestDataLake*`; missing reveal blocks settlement; the REQUIRED browser-ux lifecycle and capability gating. |
| L9/L8 | `xl1-build` · `xl1-scaffold` | `vague-request-runs-wizard`† · `synthesized-prompt-shape` · `concrete-spec-skips-wizard` · `existing-project-stays-quiet` · `dashboard-is-react-only` · `existing-project-by-fixture` | Vague → wizard offering its own archetypes; concrete → scaffold; existing project → neither (by prompt, and by a `package.json` fixture in the cwd); read-only page → `react` alone, not the monorepo. |
| L7 | `xl1-testing` | `defaults-to-testnet`† · `routes-browser-code-to-browser-mode`† · `service-round-trip-required`† · `headless-signer-derivation` | Sequence/local with the canonical signer, `buildRunner`, explicit confirm options; browser mode + Playwright + MSW; both watermark gates and fail-loudly; `Account.create` / `.build()` corrected. |
| — | `stack` | `rps-evaluation-prompt`† · `conventions-in-code` | The CLAUDE.md prompt as a scaffold-phase plan, weighted toward pack facts (floor block, REST, DoD, schema namespace, canonical signer, stamp); root-barrel imports with no deprecated names on generated code. |
| L3 | `xyo-knowledge` | `schema-naming` · `root-hash-default`† · `reserved-namespace-refused` · `concept-question-stays-in-knowledge` | `com.<org>.<app>.*` unversioned; `PayloadBuilder.hash` as root hash; `network.xyo.*` reserved; concept questions never wake build or scaffold. |
| L6 | `xl1-dapp-kit` | `distinguishes-vocabulary` · `ports-not-rest`† · `local-conformance-not-hosted` | Vocabulary kept distinct; frames over WebSocket/MessagePort with HTTP for health/static/unary only; local conformance earns a local label. |
| L1–2 | `xy-toolchain` · `xy-development` | `redirects-to-ariestools` ×2 | Both stubs defer to ariestools-skills rather than invent. |

## Writing cases

Give each case one grader on **the result** and one on **how Claude got there**:

| Grader | Type | Costs a judge call |
|---|---|---|
| Right skill fired | `tool_used` on `Skill` | no |
| Right sub-file opened | `tool_used` on `Read` with `input_match` | no |
| No deprecated package names | `regex`, `match: not_contains` | no |
| Answer is actually correct | `llm` with a PASS/FAIL rubric | yes |

Deterministic graders are free, so lean on them and keep `llm` rubrics for short
outputs, written as concrete PASS and FAIL conditions with formatting explicitly
excluded from the verdict.

Two scoring notes from the docs: a `tool_used: Skill` grader is excluded from
scoring in a two-arm run, since it can never pass without the plugin — set
`arm: both` when the check is "this skill must *not* fire". And `--ablation`
defaults to `none` here because the baseline arm doubles the cost to answer a
question — "does the plugin help at all?" — that is stable across edits and
worth measuring once per case rather than every run.

Measured once on `commit-reveal-routing` (Claude Code 2.1.273): **with 1.00,
without 0.75, Δ +0.25**. Baseline Claude explains commit-reveal correctly on its
own — it is generic computer science — and the *only* grader separating the arms
was `opens-commit-reveal-recipe`. Two lessons follow. A small Δ on a generic-CS
prompt does not mean the skill is weak; it means the plugin's contribution is
steering to the canonical recipe rather than supplying the concept. And the
"how Claude got there" grader is often the entire plugin signal, so never write
a case without one.

## Authoring lessons

Every one of these was learned from a run that failed or passed for the wrong
reason. Check a new case against them before spending a judge call.

1. **Descriptions and routers leak answers.** A yes/no prompt ("is
   `headUpdated` right?") was answered correctly with Skill 0x and Read 0x —
   the skill *description* already named `FinalizedBlockStream`. The body only
   loads when the prompt needs depth. Ask for the wiring, not the verdict.
2. **Baseline already knows generic best practice.** "Use the proxy, not CORS"
   scored 1.00 with no plugin content touched. A fidelity case must hinge on a
   fact only this pack has — the port pair, `transport="rest"`, the floor
   block, the `xyoDataLakes_*` ban, the `lastIndexedBlock` watermark — or Δ≈0
   and the case measures nothing.
3. **Distinctive tokens invite a Grep bypass.** Naming `xyoDataLakes` or
   `dapp-kit-vitest-config` sends the agent straight to the sub-file via Grep,
   Skill 0x. For fidelity cases that is legitimate: the `Read` on the sub-file
   is the plugin-content signal, so drop the `Skill` grader there. Routing
   cases stay in user language without doc tokens and keep it.
4. **"Write / scaffold / build me X" reads as file creation.** With no Write or
   Bash granted, the agent hunted for tools via ToolSearch, spawned background
   subagents, and burned every turn — twice. Ask for the artifact *inline*,
   say "don't create files / don't execute", and grade the plan or decision.
5. **Judges are literal.** A correct answer that opened with "your working
   directory is empty" — true in the sandbox — failed a rubric about "the
   existing codebase" three votes to none. Name sandbox conditions in the
   rubric, and always distinguish *recommending* the forbidden thing from
   *mentioning it in order to reject it*: the skill docs carry anti-pattern
   tables, so a `not_contains` regex fails correct answers.
6. **The wizard stops.** `AskUserQuestion` is not granted in a `claude -p` run,
   so a prompt xl1-build finds under-specified ends the run at its questions.
   Pre-answer every wizard question in the prompt. (A recorded first turn via
   `context.history_file` would let a case continue the conversation instead;
   not built yet.)
7. **Two legitimate content paths flip between runs.** When a rule lives in
   both the router and a sub-file, one run takes Skill → router and the next
   takes Grep → sub-file; neither grader is stable alone. Ask for a fact only
   the sub-file has.
8. **OR across skills is `input_match` alternation.** `tool_used: Skill` with
   `input_match: '"skill"\s*:\s*"(?:[\w-]+:)?xl1-(build|scaffold)"'` passes
   if either fired. OR across *different tools* has no clean form; redesign
   the prompt instead (lesson 7).
9. **A judge phrased as a conclusion measures the base model.** Measured with
   `--ablation with-without`: 7 of the original 23 cases had a weight-≥2 judge
   that passed with *no plugin* — "don't add CORS", "round-trip the API", "use
   a testnet", "salt the hash". Every judge that failed at baseline demanded a
   pack-specific fact. Write the fact into the rubric, or the regex is doing
   all the work.
10. **Rules are restated across files, and the router copy wins.** Deleting a
    rule from one file changed nothing — six mutations, one registered. When
    a sub-file and its router summary disagreed, the answer followed the
    router (it loads first). Only inverting every copy registered, and it
    did: the agent recommended forfeit in an atomic swap the moment the whole
    stack said so, overriding a correct prior. Wrong skill text propagates.
11. **Know what the test actually measures.** With the raw-RPC/EVM rule
    scrubbed from all six files, `rejects-*` still passed — the remaining
    SDK API docs carried the behaviour. Those cases prove the pack teaches the
    XL1 SDK, not that it states the rule. The rule's real value is the grep
    self-check gating "done".
12. **Prose rules lose; output slots win.** Rewording the skill-identity rule
    to cover plans changed nothing; naming the stamp as the opening line of
    the plan-only path worked on the next run. And the stamp then read
    `v1.1.19` — the paragraph's *example*, copied verbatim, while the
    frontmatter said 1.1.35. Never put a concrete version in prose.
13. **A regex that encodes the rule beats one that encodes your example.**
    Requiring `com.<org>.rps.*` failed a correct plan that used the pack's
    own `<org>` placeholder, then correctly failed two plans that wrote
    `com.rps-game.*` — a hyphen and no org tier. The grader now requires
    three or more `[a-z0-9]` or placeholder segments: the rule, not the case.

## Skill findings

Failures that pointed at skill text rather than graders. Per CLAUDE.md the fix
belongs in the skill; the eval that exposed each is named so it can be re-run.

**Closed on `feature/eval-efficacy`**

| Finding | Fix | Exposed by |
|---|---|---|
| Scaffold's "do not stop" directive had no guard for a session without tools — 26 turns of tool-hunting | Execution guard at the top of Hand-off behavior | `concrete-spec-skips-wizard` |
| "Concrete spec, plan first" had no owner; scaffold fired 2/3 | Scaffold description and trigger section claim it | `rps-evaluation-prompt` |
| Patterns' description never said *permission*; agent Grep'd past routing | Description lists wallet connection and permission requests | `refuses-datalake-permissions` |
| Skill-identity stamp absent from every plan | Rule covers plans; stamp is a named slot in scaffold's plan path | `rps-evaluation-prompt` |
| Stamp echoed the stale `v1.1.19` example | Example versions removed from every router | `rps-evaluation-prompt` |
| Plans named schemas `com.rps-game.*` — hyphen, no org tier | Shared-package section: package scope ≠ schema segment | `rps-evaluation-prompt` |
| Router summary silently overrides its sub-file | Rule-ownership note in xl1-patterns: the linked file is canonical | mutation M2/M4 |

**Still open**

- **Rule redundancy is undeclared.** The raw-RPC/EVM rule appears in six
  files, the `xyoDataLakes` rule in seven (including paraphrases). The
  ownership note declares precedence; it does not name a canonical copy per
  rule. Until it does, no test can detect single-file drift.
- **Descriptions that state conclusions produce shallow answers.**
  `FinalizedBlockStream` in the L4 description means a yes/no question is
  answered without loading the body — and without the reason.
- **The CLAUDE.md evaluation prompt is a wizard prompt.** Under-specified on
  stakes, deadline, network, and verification by xl1-build's own rules; the
  composite supplies the hand-off block for that reason.

## Debugging a case

- Failing runs keep their sandbox automatically; pass `--keep-temp` to keep
  passing ones too. The trace is `<kept dir>/out/trace.jsonl`. Tool calls:
  `jq -r 'select(.type=="assistant") | .message.content[]? |
  select(.type=="tool_use") | "\(.name)  \(.input|tostring)"' trace.jsonl`
- `aggregate-result.json` under `.eval-results/<stamp>/` carries every
  grader's `explanation` and, for judges, `evidence` — the exact text the
  judge saw. Read that before rewriting a rubric.
- `--case` takes a single glob and the last one wins; `--tag` is repeatable
  and ORs. To run two groups at once, tag them.

## Measuring the suite itself

A green run is a claim; these two checks are how it was tested.

**Would a baseline pass?** `pnpm eval --runs 1 --ablation with-without` runs
every case with and without the plugin. Read the `W/OUT` column: a case near
1.00 without the plugin is measuring the model. Per-grader baseline verdicts
are in the log and in `aggregate-result.json`.

**Would a broken skill pass?** Mutate the *rendered* copy, never the source:

```shell
pnpm sync:claude --out .preview/claude          # clean render
# delete or invert the rule in .preview/claude/skills/<skill>/<file>.md
pnpm eval --no-render --runs 1 --skill <group> --case <case>
pnpm sync:claude --out .preview/claude          # restore
```

Two rounds were run against the original 23 cases. Single-copy deletions
registered once in six (the rule survived elsewhere); an every-copy inversion
of the atomic-exchange rule registered (the case fell to 0.50). Delete *every*
copy — `grep -rli <rule> .preview/claude/skills` — or the result measures the
stack's redundancy, not the test.

## Regression signal

Compare **version over version**, not against the no-plugin baseline: run the
same suite against the last released tag and against `HEAD`, then diff
`aggregates.overallScore` from the two `--json` documents. That is what catches
"this skill edit made routing worse". The baseline delta cannot — it compares
the plugin to nothing, so it moves when the *concept* leaves baseline Claude's
reach, not when a skill edit degrades routing.

## Cost

A case runs three times per arm by default, so the bill scales with
cases x runs x arms. A full single-arm pass of the 31 cases at three runs is
about $13 at list price. `pnpm eval` pins `--max-cost-usd`, runs a single arm,
and pins both models so a model rollout is not mistaken for a skill regression.
On a subscription the figure is plan usage, not a bill — and a plan window
*can* run out mid-suite: runs then error with a spend-limit message and the
case scores 0. Re-run the affected groups with `--tag` after the window
resets rather than reading those zeros as failures.
Exit 2 means the run was partial (cost ceiling or rejected credential) — a
budget signal rather than a quality one; the harness reports it without calling
the suite failed.

Keeping this out of CI is what keeps that cost predictable and deliberate.
