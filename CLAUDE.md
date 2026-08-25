# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo serves three roles:

1. **Skill source of truth for XYO/XL1 domain layers** — `xyo-knowledge` and `xl1-*` under `skills/`. Installed directly by [Skills.sh](https://skills.sh) and mirrored to marketplace repos for Claude Code and Codex. Layers 1–2 (`xy-development`, `xy-toolchain`) are owned by [`ariestools/ariestools-skills`](https://github.com/ariestools/ariestools-skills); this repo keeps temporary redirect stubs only.
2. **Scaffold tool** — `packages/xl1-scaffold/` scaffolds a new XL1 app (React dApp, `xl1-service` backend, plain Node service/CLI, or a full-stack pnpm monorepo) with the correct dep graph, tsconfig, ESLint, and smoke test wired up.
3. **Evaluation test bed** — `src/` is where a rock-paper-scissors game gets built to test the skill stack's quality.

The skills themselves are the primary artifact. When implementation reveals incorrect or misleading guidance in a skill, update the skill file — not just the application code.

## Distribution Model

The Claude Code and Codex marketplaces want incompatible repository layouts, so this repo ships *just the source* and renders marketplace-shaped trees into two mirror repos on each release:

- **`XYOracleNetwork/xyo-skills`** (this repo) — source of truth for XYO/XL1 domain skills. Skills.sh installs from here directly.
- **`XYOracleNetwork/xyo-claude-plugin`** — Claude Code marketplace target. Written by release automation; do not edit by hand.
- **`XYOracleNetwork/xyo-codex-plugin`** — Codex marketplace target. Written by release automation; do not edit by hand.

The render pipeline lives at `scripts/marketplace-sync/`:

- **`metadata.json`** — single canonical, marketplace-agnostic plugin metadata. Contains version, description, keywords, author, category, brand assets, capabilities. Edit this when changing what's advertised in any marketplace.
- **`build-claude.mjs`** — reads `metadata.json` and emits the Claude marketplace tree (`.claude-plugin/{marketplace,plugin}.json` + `skills/` + `assets/` + `LICENSE`).
- **`build-codex.mjs`** — same, for Codex. Codex nests the plugin payload under `plugins/xyo-skills/`, so the tree is `.agents/plugins/marketplace.json` + `plugins/xyo-skills/.codex-plugin/plugin.json` + `plugins/xyo-skills/{skills,assets}/` + `LICENSE`.
- **`lib.mjs`** — shared CLI / output / copy plumbing.

When a marketplace changes its required schema, edit the corresponding renderer — `metadata.json` stays marketplace-neutral. Render locally before pushing:

```shell
pnpm sync:claude --out .preview/claude   # inspect the would-be Claude tree
pnpm sync:codex  --out .preview/codex    # inspect the would-be Codex tree
```

`.preview/` is gitignored. Release-please bumps the `version` field inside `metadata.json` (its sole `extra-files` entry) plus each `SKILL.md` frontmatter; that version is then baked into every rendered manifest via the renderer's `--version` flag.

Skills use progressive loading — each `SKILL.md` is a lightweight router that directs you to read sub-files on demand based on context. Layers cascade top-down:

```
Layer 9: xl1-build/        — Planning wizard: vague build request → concrete dApp spec
Layer 8: xl1-scaffold/     — Bootstrap new XL1 apps (React dApp, xl1-service, Node service, monorepo)
Layer 7: xl1-testing/      — Local dev-chain, headless testnet verification, browser-mode tests
Layer 6: xl1-dapp-kit/     — Headless application contracts (manifest, ports, recovery, hosting)
Layer 5: xl1-patterns/     — Prescriptive patterns (indexing, Statement Graph, wakes, tokens, …)
Layer 4: xl1-knowledge/    — XL1 chain, datalakes, gateway, wallet, FinalizedBlockStream
Layer 3: xyo-knowledge/    — XYO payloads, bound witnesses, modules, identity
Layer 2: xy-toolchain/     — REDIRECT → ariestools/ariestools-skills (do not edit body docs here)
Layer 1: xy-development/   — REDIRECT → ariestools/ariestools-skills (do not edit body docs here)
```

When building application features on XL1, start with Layer 5's SKILL.md — it provides recipe-style patterns that compose primitives from all lower layers. When adopting `@xyo-network/dapp-kit*`, also load Layer 6. When working on XL1 infrastructure or need reference docs, start with Layer 4.

**Do not expand `skills/xy-development` or `skills/xy-toolchain` in this repo.** They are redirect stubs; edit and release those skills in ariestools-skills. `scripts/validate-skills.mjs` enforces the stub allowlist.

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
- `validate-plugins.yml` (push/PR to `main`/`develop`) — runs both renderers into tmp dirs and validates the generated manifests pass marketplace structural assertions. Also verifies the scaffold runtime in `skills/xl1-scaffold/` is in sync with its TS source.
- `release-please.yml` (push to `main`) — opens/merges release PRs. When release-please tags a release, the follow-up `sync-marketplaces` job renders and pushes to `xyo-claude-plugin` and `xyo-codex-plugin` (matrix; `fail-fast: false`).
- `validate-skills.yml`, `lint-pr-title.yml`, `sync-main-to-develop.yml` — unchanged.

To validate manifest generation locally:
```shell
pnpm sync:claude --out .preview/claude && jq empty .preview/claude/.claude-plugin/*.json
pnpm sync:codex  --out .preview/codex  && jq empty .preview/codex/.agents/plugins/marketplace.json .preview/codex/plugins/xyo-skills/.codex-plugin/plugin.json
```

**Workspace layout** (pnpm workspaces):
- `/` — workspace root (`package.json`, `pnpm-workspace.yaml`, `.npmrc`)
- `/packages/xl1-scaffold/` — the scaffold CLI (TS source under `src/`, raw template files under `templates/`, compiled output in `dist/`)
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
```

**Scaffold package** (run from `packages/xl1-scaffold/`):
```shell
pnpm test                                   # run tests (vitest)
pnpm test:watch                             # watch mode
pnpm vitest run path/to/file.test.ts        # run a single test file
pnpm vitest run -t "test name pattern"      # run tests matching a name
pnpm lint:fix                               # auto-fix lint issues
```

**Scaffold build chain:** `clean → tsc → copy-templates → sync-to-plugin` compiles TS, copies template files, and writes the runtime into `skills/xl1-scaffold/scripts/scaffold/`. CI fails if committed source drifts from the synced runtime.

**Editing skills:** This repo no longer carries marketplace manifests at its root, so `claude --plugin-dir ./` won't find a plugin to load. Instead, render a local preview tree and point Claude at that:

```shell
pnpm sync:claude --out .preview/claude
claude --plugin-dir .preview/claude
```

Re-run `pnpm sync:claude` (or `/reload-plugins` if you're only editing files inside `.preview/claude/skills/` directly) after each skill change. See `DEVELOPMENT.md` for the Codex-side and persistent local-marketplace options.

## Key Conventions (from the skills)

- **ESM only** — no CommonJS
- **Root barrel imports** — `@xyo-network/sdk` (XYO), `@xyo-network/xl1-sdk` (XL1 protocol), `@xyo-network/chain-sdk` (XL1 runtime). Tree shaking handles the rest. The pre-July-2026 `@xyo-network/sdk-js` and `@xylabs/sdk-js` names are deprecated compatibility shims (`@xylabs/sdk-js` → `@ariestools/sdk`) — never add them to new work.
- **Zod-first types** (XL1) — Zod schema is the source of truth, derive TS types from it
- **Never rewrite git history** — no amend, no rebase, no force push
- **Conventional commits** — `feat:`, `fix:`, `chore:`, `refactor:`, etc.

## Evaluation Prompt

The prompt used to test the skill stack:

> Build me a two-player rock paper scissors game on XL1. Use commit-reveal so neither player can see the other's move before both have committed. Record moves and outcomes on-chain. Include a UI where anyone can browse past games and results without connecting a wallet, and connected players can start and play games.
