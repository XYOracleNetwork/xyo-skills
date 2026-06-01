# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo serves three roles:

1. **Claude Code plugin marketplace** — packages a 6-layer XL1/XYO skill stack as an installable plugin (this repo *is* the plugin — `.claude-plugin/` and `skills/` at the root)
2. **Scaffold tool** — `packages/xl1-scaffold/` scaffolds a new XL1 app (React dApp or Node service) with the correct dep graph, tsconfig, ESLint, and smoke test wired up
3. **Evaluation test bed** — `src/` is where a rock-paper-scissors game gets built to test the skill stack's quality

The repo root is dual-purpose: plugin content (`.claude-plugin/`, `skills/`) sits alongside build infra (`packages/`, `pnpm-workspace.yaml`, `package.json`). Claude Code only loads the former at install time; the latter rides along on `git clone` but is otherwise invisible to the plugin runtime. Don't try to "tidy" the build infra into a subdirectory — it stays at the root so the scaffold's pnpm workspace works.

The skills themselves are the primary artifact. When implementation reveals incorrect or misleading guidance in a skill, update the skill file — not just the application code.

## Plugin Architecture

This repo follows the Claude Code plugin marketplace pattern with a **flat layout** — the repo root is the plugin:

- **`.claude-plugin/marketplace.json`** — Claude Code marketplace manifest, `source: "./"`
- **`.claude-plugin/plugin.json`** — Claude Code plugin manifest
- **`.codex-plugin/marketplace.json`** — Codex marketplace manifest, `source.path: "./"`
- **`.codex-plugin/plugin.json`** — Codex plugin manifest
- **`skills/`** — 6 skill layers using progressive loading
- **`version.txt`** — release-please version source of truth; bumps cascade from here into the four manifests above and the per-skill `SKILL.md` frontmatter

Skills use progressive loading — each `SKILL.md` is a lightweight router that directs you to read sub-files on demand based on context. Layers cascade top-down:

```
Layer 6: xl1-scaffold/     — Bootstrap new XL1 apps (React dApp or Node service)
Layer 5: xl1-patterns/     — Prescriptive design patterns (commit-reveal, indexing, prediction markets)
Layer 4: xl1-knowledge/    — XL1 chain, datalakes, gateway, wallet, dev patterns
Layer 3: xyo-knowledge/    — XYO payloads, bound witnesses, modules, identity
Layer 2: xy-toolchain/     — @xylabs/toolchain, ESLint, TypeScript config, Vitest
Layer 1: xy-development/   — TypeScript, Git, testing, workflow conventions
```

When building application features on XL1, start with Layer 5's SKILL.md — it provides recipe-style patterns that compose primitives from all lower layers. When working on XL1 infrastructure or need reference docs, start with Layer 4.

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
- To ship: PR `develop` → `main` with a `feat:` or `fix:` title and merge using the **"Create a merge commit"** option (not squash). Release-please then opens a Release PR against `main` that bumps `version.txt` (the source of truth for `release-type: "simple"`) and cascades that version into `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, both version fields in `.claude-plugin/marketplace.json`, and the per-skill `SKILL.md` frontmatter. Merging that PR tags and publishes the release.
- After release, `sync-main-to-develop.yml` auto-opens **and auto-merges** a `main → develop` PR using the **merge-commit** method. Do not squash this PR if you ever merge it manually — squashing breaks the ancestry link between `main` and `develop` and makes them drift over time.
- Release-please uses a fine-grained PAT (`secrets.RELEASE_PLEASE_TOKEN`) so its release PRs trigger downstream workflows; without it, the PR's checks would never report and branch protection would block the merge. Track PAT expiration.
- Don't bump versions by hand — release-please owns those files. Anchored at `b1bc7eb`; older `feat:`/`fix:` commits are not rolled forward.

**CI:** The `validate-plugins.yml` workflow runs on push/PR to `main` and `develop`. It validates:
- `marketplace.json` structure and required fields
- Each plugin directory exists with a valid `plugin.json`
- No duplicate plugin names

To validate plugin structure locally (both marketplaces):
```shell
jq empty .claude-plugin/marketplace.json
jq empty .claude-plugin/plugin.json
jq empty .codex-plugin/marketplace.json
jq empty .codex-plugin/plugin.json
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

**Editing skills:** To load the plugin from this local checkout, start Claude with `claude --plugin-dir ./` (other loading options in `DEVELOPMENT.md`). After modifying any file under `skills/`, run `/reload-plugins` in your Claude Code session — there is no file watcher.

## Key Conventions (from the skills)

- **ESM only** — no CommonJS
- **Root barrel imports** — `@xyo-network/sdk-js` (XYO), `@xyo-network/xl1-sdk` (XL1 protocol), `@xyo-network/chain-sdk` (XL1 runtime). Tree shaking handles the rest.
- **Zod-first types** (XL1) — Zod schema is the source of truth, derive TS types from it
- **Never rewrite git history** — no amend, no rebase, no force push
- **Conventional commits** — `feat:`, `fix:`, `chore:`, `refactor:`, etc.

## Evaluation Prompt

The prompt used to test the skill stack:

> Build me a two-player rock paper scissors game on XL1. Use commit-reveal so neither player can see the other's move before both have committed. Record moves and outcomes on-chain. Include a UI where anyone can browse past games and results without connecting a wallet, and connected players can start and play games.
