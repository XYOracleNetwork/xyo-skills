# Eval suite

Behavioral tests for the skill stack, run with [`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals).

```shell
pnpm eval                          # whole suite
pnpm eval --skill xl1-patterns     # one skill's cases
pnpm eval:smoke                    # tagged smoke cases, one run each
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
