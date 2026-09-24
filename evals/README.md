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

Twenty-three cases across every layer, in the order they were built — highest
value per dollar first. At three runs per case on Claude Code 2.1.273, every
case scores 1.00 except `rejects-raw-rpc` (0.93 — one run answered from the
router without opening `gateway.md`) and the composite (0.88 — see *Open skill
findings*). A full pass costs about $11 at list price.

| Layer | Group | Cases | What they prove |
|---|---|---|---|
| L4 | `xl1-knowledge` | `rejects-raw-rpc` · `rejects-ethereum-tooling` · `prefers-finalized-block-stream` | The rule the skill calls *Critical*: no JSON-RPC by method name, no EVM tooling; `FinalizedBlockStream` over `headUpdated`. Adversarial prompts ask for the forbidden thing outright. |
| L5 | `xl1-patterns` | `commit-reveal-routing` · `reads-indexing-protocol-first` · `no-cors-same-origin` · `refuses-datalake-permissions` · `missing-reveal-blocks-settlement` | Recipe cascades reach the right file — and in the prescribed order for indexing (`tool_order`). Salted two-phase commit-reveal; proxy not CORS; `xyoDataLakes_*` refused; a missing reveal blocks settlement. |
| L9/L8 | `xl1-build` · `xl1-scaffold` | `vague-request-runs-wizard` · `synthesized-prompt-shape` · `concrete-spec-skips-wizard` · `existing-project-stays-quiet` | The hand-off seam: vague → wizard, concrete → scaffold, existing project → neither. The synthesized block has its fixed shape and `xl1-build vX.Y.Z` stamp. |
| L7 | `xl1-testing` | `defaults-to-testnet` · `routes-browser-code-to-browser-mode` · `service-round-trip-required` | Testnet by default, seed from env; browser code → vitest browser mode; `payloadsByHash` read-back is not verification — round-trip `/api`, two-gate poll. |
| — | `stack` | `rps-evaluation-prompt` | The CLAUDE.md evaluation prompt as a scaffold-phase plan: three pattern reads, floor block, REST transport, DoD, four-part plan rubric, skill-identity stamp. |
| L3 | `xyo-knowledge` | `schema-naming` · `root-hash-default` | `com.<org>.<app>.*`, lowercase, unversioned; root hash is the application default. |
| L6 | `xl1-dapp-kit` | `distinguishes-vocabulary` · `ports-not-rest` · `local-conformance-not-hosted` | Definition / plan / incarnation kept distinct; ports are frames not REST; local conformance earns a local label only. |
| L1–2 | `xy-toolchain` · `xy-development` | `redirects-to-ariestools` ×2 | The stubs defer to ariestools-skills rather than invent — the real situation when only this pack is installed. |

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

## Open skill findings

Failures kept on purpose because they point at the skill text, not the grader.
Per CLAUDE.md, the fix belongs in the skill.

- **Skill-identity stamp is absent from plan-shaped output.** The composite
  case's scaffold-phase plan names no skill and no version at all, so the
  `xl1-scaffold vX.Y.Z` grader fails (case scores 0.91). Every router phrases
  the rule as *"when reporting which skills informed your work"*, which reads
  as completion-time only. Candidate edit: state that plans and
  acknowledgements carry the stamp too, or add it to xl1-scaffold's
  "Interpreting the prompt" acknowledgement step.
- **The CLAUDE.md evaluation prompt is a wizard prompt.** By xl1-build's own
  trigger rules it is under-specified on stakes, reveal deadline, network, and
  headless verification, so it correctly enters the wizard rather than the
  scaffold. Not a defect — but anyone using that prompt to benchmark the
  scaffold should know the first response will be four questions.

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

## Regression signal

Compare **version over version**, not against the no-plugin baseline: run the
same suite against the last released tag and against `HEAD`, then diff
`aggregates.overallScore` from the two `--json` documents. That is what catches
"this skill edit made routing worse". The baseline delta cannot — it compares
the plugin to nothing, so it moves when the *concept* leaves baseline Claude's
reach, not when a skill edit degrades routing.

## Cost

A case runs three times per arm by default, so the bill scales with
cases x runs x arms. `pnpm eval` pins `--max-cost-usd`, runs a single arm, and
pins both models so a model rollout is not mistaken for a skill regression.
Exit 2 means the run was partial (cost ceiling or rejected credential) — a
budget signal rather than a quality one; the harness reports it without calling
the suite failed.

Keeping this out of CI is what keeps that cost predictable and deliberate.
