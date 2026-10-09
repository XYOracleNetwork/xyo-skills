# AGENTS.md

This file provides guidance to Codex and any other agent that reads `AGENTS.md` when working with code in this repository. Claude Code reads the same guidance from `CLAUDE.md`; the two files are kept identical apart from this header and the local skill-preview commands below.

## Purpose

This repo serves three roles:

1. **Skill source of truth for XYO/XL1 domain layers** — `xyo-knowledge` and `xl1-*` under `skills/`. Installed directly by [Skills.sh](https://skills.sh) and mirrored to marketplace repos for Claude Code and Codex. Layers 1–2 (`xy-development`, `xy-toolchain`) are owned by [`ariestools/ariestools-skills`](https://github.com/ariestools/ariestools-skills); this repo keeps temporary redirect stubs only, and they ship to Skills.sh only — the Claude and Codex renderers drop them.
2. **Scaffold tool** — `packages/xl1-scaffold/` scaffolds a new XL1 app (React dApp, `xl1-service` backend, plain Node service/CLI, or a full-stack pnpm monorepo) with the correct dep graph, tsconfig, ESLint, and smoke test wired up.
3. **Evaluation test bed** — `src/` is where a rock-paper-scissors game gets built to test the skill stack's quality.

The skills themselves are the primary artifact. When implementation reveals incorrect or misleading guidance in a skill, update the skill file — not just the application code.

## Distribution Model

The Claude Code and Codex marketplaces want incompatible repository layouts, so this repo ships *just the source* and renders marketplace-shaped trees into two mirror repos on each release:

- **`XYOracleNetwork/xyo-skills`** (this repo) — source of truth for XYO/XL1 domain skills. Skills.sh installs from here directly, so it is the only channel that still carries the two redirect stubs.
- **`XYOracleNetwork/xyo-claude-plugin`** — Claude Code marketplace target. Written by release automation; do not edit by hand.
- **`XYOracleNetwork/xyo-codex-plugin`** — Codex marketplace target. Written by release automation; do not edit by hand.

The render pipeline lives at `scripts/marketplace-sync/`:

- **`metadata.json`** — single canonical, marketplace-agnostic plugin metadata. Contains version, description, keywords, author, category, brand assets, capabilities. Edit this when changing what's advertised in any marketplace.
- **`build-claude.mjs`** — reads `metadata.json` and emits the Claude marketplace tree (`.claude-plugin/{marketplace,plugin}.json` + `skills/` + `assets/` + `LICENSE`). `skills/` is the seven real skills: redirect stubs are excluded.
- **`build-codex.mjs`** — same, for Codex. Codex nests the plugin payload under `plugins/xyo-skills/`, so the tree is `.agents/plugins/marketplace.json` + `plugins/xyo-skills/.codex-plugin/plugin.json` + `plugins/xyo-skills/{skills,assets}/` + `LICENSE`.
- **`lib.mjs`** — shared CLI / output / copy plumbing, including the redirect-stub filter: any skill whose `SKILL.md` frontmatter has `metadata.status: redirect` or `metadata.internal: true` is left out of both trees (stub detection is shared with the validator via `scripts/skill-layers.mjs`).

When a marketplace changes its required schema, edit the corresponding renderer — `metadata.json` stays marketplace-neutral. Render locally before pushing:

```shell
pnpm sync:claude --out .preview/claude   # inspect the would-be Claude tree
pnpm sync:codex  --out .preview/codex    # inspect the would-be Codex tree
```

`.preview/` is gitignored. Release-please owns the version: `version.txt` is the source of truth (`release-type: "simple"`), and the `extra-files` in `release-please-config.json` cascade it into `metadata.json` (`$.version`) and into `metadata.version` of every `SKILL.md` (the `# x-release-please-version` marker; the stubs included). The release workflow then bakes the release tag into every rendered manifest via the renderer's `--version` flag.

Skills use progressive loading — each `SKILL.md` is a lightweight router that directs you to read sub-files on demand based on context. Layers cascade top-down:

```
Layer 9: xl1-build/        — Planning wizard: vague build request → concrete dApp spec
Layer 8: xl1-scaffold/     — Bootstrap new XL1 apps (React dApp, xl1-service, Node service, monorepo)
Layer 7: xl1-testing/      — Local dev-chain, headless testnet verification, browser-mode tests, dApp Definition of Done (dapp-checklist.md)
Layer 6: xl1-dapp-kit/     — Headless application contracts (manifest, ports, recovery, hosting)
Layer 5: xl1-patterns/     — Architecture principles + prescriptive patterns (indexing, Statement Graph, wakes, tokens, …)
Layer 4: xl1-knowledge/    — XL1 chain, datalakes, gateway, wallet, FinalizedBlockStream
Layer 3: xyo-knowledge/    — XYO payloads, bound witnesses, modules, identity
Layer 2: xy-toolchain/     — REDIRECT → ariestools/ariestools-skills (do not edit body docs here)
Layer 1: xy-development/   — REDIRECT → ariestools/ariestools-skills (do not edit body docs here)
```

When building application features on XL1, start with Layer 5's SKILL.md — it provides recipe-style patterns that compose primitives from all lower layers, plus the architecture principles for multi-party dApps. When adopting `@xyo-network/dapp-kit*`, also load Layer 6. Before calling a dApp done, walk Layer 7's dApp Definition of Done (`skills/xl1-testing/dapp-checklist.md`). When working on XL1 infrastructure or need reference docs, start with Layer 4.

**Layering is enforced, not just documented.** Each `SKILL.md` declares its layer as `metadata.layer` (the line after `version:`), and every non-stub router has a `## Skill layers` section with a `- **Builds on:**` bullet (relative links to lower-layer routers only, `../<skill>/SKILL.md`; layers 1–2 via the https://github.com/ariestools/ariestools-skills URL) and a `- **Hands off to:**` bullet (higher-layer routers only; `none` for xl1-build). Lower layers hand off upward; they do not depend on higher layers.

**Do not expand `skills/xy-development` or `skills/xy-toolchain` in this repo.** They are redirect stubs (`metadata.status: redirect`, `metadata.internal: true`); edit and release those skills in ariestools-skills. They ship to Skills.sh only, and no relative link may point into them — link the ariestools-skills URL instead. `scripts/validate-skills.mjs` enforces the stub allowlist and the no-stub-links rule.

**Skill validation** — `pnpm validate:skills` (`node scripts/validate-skills.mjs skills`) fails on:
- invalid frontmatter (`name`, `description`), non-ASCII or hyphenated schema literals, and stub allowlist / size-cap violations;
- **links and anchors** — every relative link in `skills/**/*.md` (except generated `skills/*/scripts/**`) must resolve inside `skills/`, and every `#anchor` must match a GitHub heading slug in the target (duplicates take `-1`, `-2`); links inside code spans and fenced blocks are ignored;
- **layer direction** — missing, non-integer, or duplicate `metadata.layer`; a router without the `## Skill layers` bullets; a "Builds on" link that is not to a strictly lower-layer router, or a "Hands off to" link that is not to a strictly higher one;
- **stub links** — any relative link from a non-stub file into a redirect-stub directory.

Upward links in body text (a lower layer linking a higher one, outside `## Skill layers`) are a **non-fatal warning**, printed as a per-edge table so drift stays visible. Unit tests for the validator helpers run with `pnpm test:scripts` (`node --test scripts/*.test.mjs`).

## Development

**Package manager:** pnpm (enforced — never use npm or yarn in this repo)

**Node version:** >=24 required. Volta pins Node 24.15.0 and pnpm 10.33.2. Use `corepack enable` if Volta isn't available.

**Branching:** Gitflow with `develop` as the integration branch. Feature branches use `feature/<description>` off `develop`. Never rewrite git history (no amend, rebase, or force push).

**Merge method by PR type:** the strategy matters for keeping `main` and `develop` in sync. `required_linear_history` is intentionally **off** on `main` so the integration PR can be merge-committed.

| PR type | Head | Base | Merge method |
|---|---|---|---|
| Feature/fix PR | `feature/*` | `develop` | Squash |
| Integration PR | `develop` | `main` | **Merge commit** (preserves ancestry; never squash — squashing creates phantom commits in `git log main..develop` that grow over time) |
| Release-please PR | `release-please--*` | `main` | Squash (release-please's recommended flow — keeps each release as one tidy commit on `main`) |
| Sync PR | `main` | `develop` | Merge commit (already auto-applied by `sync-main-to-develop.yml`) |

**Principle:** squash is fine when the source branch is throwaway (feature branches and release-please's auto-generated branch are deleted after merge — there's nowhere for phantom commits to accumulate). Squash is harmful when both source and target are long-lived branches (`develop` and `main`), because the originals stay on the source forever without ancestry to the new squash commit on the target. So `feature → develop` and `release-please → main` squash; `develop ↔ main` always merge-commit.

**Releases:** Automated by [release-please](https://github.com/googleapis/release-please).
- Use conventional commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`, `feat!:` for breaking) — release-please reads them for `CHANGELOG.md` content. Versioning is configured `always-bump-patch`, so any merge to `main` produces a release; the prefix only affects the changelog text.
- `lint-pr-title.yml` enforces conventional titles on PRs into both `main` (only `feat:` / `fix:` accepted) and `develop` (any conventional type — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, etc.). The develop-side lint matters because feature-PR squash commits travel to `main` via the integration PR's merge commit, and release-please scans those individual subjects when building the changelog.
- To ship: PR `develop` → `main` with a `feat:` or `fix:` title and merge using the **"Create a merge commit"** option (not squash). Release-please then opens a Release PR against `main` that bumps `version.txt` (the source of truth for `release-type: "simple"`) and cascades that version into `scripts/marketplace-sync/metadata.json` and the per-skill `SKILL.md` frontmatter. Merging that PR tags the release; the `sync-marketplaces` job then renders and pushes the new version into the Claude and Codex mirror repos.
- After release, `sync-main-to-develop.yml` auto-opens **and auto-merges** a `main → develop` PR using the **merge-commit** method. Do not squash this PR if you ever merge it manually — squashing breaks the ancestry link between `main` and `develop` and makes them drift over time.
- Release-please uses a fine-grained PAT (`secrets.RELEASE_PLEASE_TOKEN`) so its release PRs trigger downstream workflows; without it, the PR's checks would never report and branch protection would block the merge. Track PAT expiration.
- The marketplace sync uses `secrets.MARKETPLACE_SYNC_TOKEN` (a PAT or GitHub App token with `contents: write` on `xyo-claude-plugin` and `xyo-codex-plugin`). Track its expiration alongside `RELEASE_PLEASE_TOKEN`.
- Don't bump versions by hand — release-please owns those files. Anchored at `b1bc7eb`; older `feat:`/`fix:` commits are not rolled forward.

**CI:**
- `validate-plugins.yml` (push/PR to `main`/`develop`) — runs both renderers into tmp dirs and validates the generated manifests pass marketplace structural assertions; asserts neither tree contains `evals/` or a redirect stub (`skills/xy-development`, `skills/xy-toolchain`) and both contain the seven real skills; re-runs the skill validator on each rendered `skills/` tree so no link dangles into an excluded stub. Also verifies the scaffold runtime in `skills/xl1-scaffold/` is in sync with its TS source.
- `validate-skills.yml` (PRs touching `skills/**` or `scripts/*.mjs`) — runs the script unit tests (`node --test scripts/*.test.mjs`) and `node scripts/validate-skills.mjs skills`.
- `release-please.yml` (push to `main`) — opens/merges release PRs. When release-please tags a release, the follow-up `sync-marketplaces` job renders and pushes to `xyo-claude-plugin` and `xyo-codex-plugin` (matrix; `fail-fast: false`).
- `lint-pr-title.yml`, `sync-main-to-develop.yml` — see **Releases** above.

To validate manifest generation locally:
```shell
pnpm sync:claude --out .preview/claude && jq empty .preview/claude/.claude-plugin/*.json
pnpm sync:codex  --out .preview/codex  && jq empty .preview/codex/.agents/plugins/marketplace.json .preview/codex/plugins/xyo-skills/.codex-plugin/plugin.json
```

**Workspace layout** (pnpm workspaces):
- `/` — workspace root (`package.json`, `pnpm-workspace.yaml`, `.npmrc`)
- `/packages/xl1-scaffold/` — the scaffold CLI (TS source under `src/`, raw template files under `templates/`, compiled output in `dist/`)
- `/evals/` — behavioral eval suite (`evals/<skill>/<case>/`), run with `claude plugin eval` via `scripts/eval/run.mjs`. A sibling of `skills/` so no renderer ever ships it; see `evals/README.md`.
- `/src/` — target for the scaffolded app. **Not** a workspace member (`pnpm-workspace.yaml` only lists `packages/*`), so `pnpm -w` commands do not recurse into it. The scaffold generates `src/` as a standalone pnpm project; run its scripts from inside `src/`.

**Scaffold usage** (run from repo root):
```shell
pnpm install                                # install workspace deps
pnpm -w run build                           # build the scaffold
pnpm -w run scaffold src                    # scaffold React dApp into ./src (default)
pnpm -w run scaffold src --template=node    # scaffold Node service instead
pnpm -w run scaffold:dev src --template=node # skip build, run straight from TS via tsx
```

Once `src/` has a `package.json`, use its scripts (e.g. `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm dev`) from inside `src/` — never raw tool commands.

**Common commands** (run from repo root):
```shell
pnpm -w run build             # build all packages (scaffold → plugin sync)
pnpm -w run lint              # lint all packages
pnpm -w run typecheck         # type-check all packages
pnpm validate:skills          # validate skills/ (frontmatter, links/anchors, layers, stub links)
pnpm test:scripts             # unit tests for scripts/ (validator helpers)
pnpm eval:smoke               # smoke-tagged eval cases, one run each
pnpm eval                     # full eval suite, three runs per case
```

The evals spend real model budget and are deliberately **not** wired into CI — run `pnpm eval:smoke` (or `pnpm eval`) by hand before a `develop` → `main` integration PR. `pnpm validate:skills` is free and safe to run anywhere.

**Scaffold package** (run from `packages/xl1-scaffold/`):
```shell
pnpm test                                   # run tests (vitest)
pnpm test:watch                             # watch mode
pnpm vitest run path/to/file.test.ts        # run a single test file
pnpm vitest run -t "test name pattern"      # run tests matching a name
pnpm lint:fix                               # auto-fix lint issues
```

**Scaffold build chain:** `clean → tsc → copy-templates → sync-to-plugin` compiles TS, copies template files, and writes the runtime into `skills/xl1-scaffold/scripts/scaffold/`. CI fails if committed source drifts from the synced runtime.

**Editing skills:** This repo no longer carries marketplace manifests at its root, so there is no plugin for Codex to load from the repo root. Instead, render a local preview tree and register it as a local marketplace:

```shell
pnpm sync:codex --out .preview/codex
codex plugin marketplace add /absolute/path/to/xyo-skills/.preview/codex
codex plugin add xyo-skills@xyo-skills
```

After each skill or metadata change, re-run `pnpm sync:codex --out .preview/codex` and then `codex plugin add xyo-skills@xyo-skills` to reinstall, and start a new Codex thread so the updated skills are picked up. See `DEVELOPMENT.md` for the Claude-side and persistent local-marketplace options.

## Key Conventions (from the skills)

- **ESM only** — no CommonJS
- **Root barrel imports** — `@xyo-network/sdk` (XYO), `@xyo-network/xl1-sdk` (XL1 protocol), `@xyo-network/chain-sdk` (XL1 runtime). Tree shaking handles the rest. The pre-July-2026 `@xyo-network/sdk-js` and `@xylabs/sdk-js` names are deprecated compatibility shims (`@xylabs/sdk-js` → `@ariestools/sdk`) — never add them to new work.
- **Zod-first types** (XL1) — Zod schema is the source of truth, derive TS types from it
- **Never rewrite git history** — no amend, no rebase, no force push
- **Conventional commits** — `feat:`, `fix:`, `chore:`, `refactor:`, etc.

## Evaluation Prompt

The prompt used to test the skill stack:

> Build me a two-player rock paper scissors game on XL1. Use commit-reveal so neither player can see the other's move before both have committed. Record moves and outcomes on-chain. Include a UI where anyone can browse past games and results without connecting a wallet, and connected players can start and play games.
