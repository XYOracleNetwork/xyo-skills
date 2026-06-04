# Development

This guide is for contributors to the `xyo-skills` repository — editing skill files locally, building the scaffold package, and shipping releases. If you just want to install and use the skills, see the [README](./README.md).

## Distribution Model (Quick Recap)

This repo is the **source of truth** for the skills (`skills/`) and the marketplace metadata (`scripts/marketplace-sync/metadata.json`). It is *not* itself a Claude Code or Codex marketplace. On release, automation renders marketplace-shaped trees into two dedicated mirror repos:

| Audience | Install target |
| --- | --- |
| [Skills.sh](https://skills.sh) | `XYOracleNetwork/xyo-skills` (this repo) |
| Claude Code marketplace | `XYOracleNetwork/xyo-claude-plugin` |
| Codex marketplace | `XYOracleNetwork/xyo-codex-plugin` |

The render scripts live under `scripts/marketplace-sync/`. See [CLAUDE.md](./CLAUDE.md#distribution-model) for the full picture.

## Developing Skills Locally

Because the marketplace manifests are *rendered*, not committed at the root, contributors load the plugin out of a local render directory:

```shell
pnpm sync:claude --out .preview/claude     # render the Claude tree
pnpm sync:codex  --out .preview/codex      # render the Codex tree
```

`.preview/` is gitignored. Both commands are idempotent — re-running overwrites the rendered tree without touching anything else.

### Claude Code

#### Option 1: CLI Flag

```shell
pnpm sync:claude --out .preview/claude
claude --plugin-dir .preview/claude
```

#### Option 2: Local Marketplace (interactive)

```shell
pnpm sync:claude --out .preview/claude
# Inside a Claude Code session:
/plugin marketplace add ./.preview/claude
/plugin install xyo-skills
```

#### Option 3: Local Marketplace (settings.json)

```json
{
  "extraKnownMarketplaces": {
    "xyo-skills": {
      "source": {
        "source": "directory",
        "path": "/absolute/path/to/xyo-skills/.preview/claude"
      }
    }
  }
}
```

Then run `/plugin install xyo-skills` in your next session.

### Codex

```shell
pnpm sync:codex --out .preview/codex
codex plugin marketplace add /absolute/path/to/xyo-skills/.preview/codex
codex plugin add xyo-skills@xyo-skills
```

After editing skills or metadata, re-run `pnpm sync:codex --out .preview/codex` and then `codex plugin add xyo-skills@xyo-skills` to reinstall. Start a new Codex thread so the updated skills are picked up.

### Building the Scaffold Package (required for the `xl1-scaffold` skill)

The compiled scaffold ships inside the `skills/` tree and is consumed by every distribution channel, so this step is required for any local-install path above.

The `xl1-scaffold` skill invokes a compiled CLI bundled under `skills/xl1-scaffold/scripts/scaffold/`. That directory is **generated** from the TypeScript source at `packages/xl1-scaffold/`; it is not hand-authored. Before testing the scaffold skill locally, build it at least once:

```shell
corepack enable                      # first time only — ensures pnpm 10.x is available
corepack pnpm@10 install
corepack pnpm@10 -w run build
```

The build chain (`clean → tsc → copy-templates → sync-to-plugin`) compiles the TS source, mirrors the raw template files, and writes the resulting runtime into the skill directory.

Rebuild after any change to `packages/xl1-scaffold/src/` or `packages/xl1-scaffold/templates/`. CI fails the PR if committed source drifts from the synced runtime (`git diff --exit-code skills/xl1-scaffold/scripts`).

### Edit-Reload Cycle

Both Claude Code and Codex load skill content at startup. Because skills are loaded from the rendered `.preview/<flavor>/` tree, you also need to re-render after edits.

#### Claude Code

1. Edit a `SKILL.md` or sub-file in `skills/`
2. Re-render: `pnpm sync:claude --out .preview/claude`
3. Run `/reload-plugins` in your Claude Code session
4. Changes are active for the rest of the session

#### Codex

1. Edit a `SKILL.md` or sub-file in `skills/`
2. Re-render: `pnpm sync:codex --out .preview/codex`
3. Reinstall: `codex plugin add xyo-skills@xyo-skills`
4. Start a new Codex thread so the updated skills are picked up

### Skill File Structure

Each skill is a directory under `skills/` containing a `SKILL.md` router and topic sub-files:

```
skills/
├── xy-development/
│   ├── SKILL.md          ← router (frontmatter + table of contents)
│   ├── typescript.md
│   ├── git.md
│   ├── testing.md
│   └── workflow.md
├── xy-toolchain/
│   ├── SKILL.md
│   └── ...
└── ...
```

`SKILL.md` files require YAML frontmatter with a `description` field. Claude uses this to decide when to activate the skill:

```yaml
---
description: When and why Claude should activate this skill.
---
```

The body is a table of contents linking to sub-files with guidance on when to read each one. Claude loads sub-files on demand, not all at once.

### Verifying Skills Load

#### Claude Code

After starting Claude Code or running `/reload-plugins`:

- Run `/help` — skills appear as `/xyo-skills:<name>` (e.g., `/xyo-skills:xy-development`)
- Check the reload output for the skill count: `Reloaded: 1 plugins · 5 skills · ...`
- Invoke a skill directly: `/xyo-skills:xl1-patterns`

#### Codex

After installing the plugin and starting a new Codex thread:

- Open the plugin browser with `/plugins` — `xyo-skills` should appear as installed and enabled
- Invoke a skill directly: `/xyo-skills:xl1-patterns`

### Editing Marketplace Metadata

Marketplace-visible fields (name, description, keywords, brand color, category, author, default prompts, etc.) live in `scripts/marketplace-sync/metadata.json`. The file is intentionally **marketplace-agnostic** — no Claude- or Codex-specific strings. When a marketplace changes its required schema, edit the corresponding renderer (`build-claude.mjs` or `build-codex.mjs`) — never bake marketplace-specific copy into `metadata.json`.

After editing, re-render and diff to confirm the change shows up where you expect:

```shell
pnpm sync:claude --out .preview/claude
pnpm sync:codex  --out .preview/codex
jq . .preview/claude/.claude-plugin/marketplace.json
jq . .preview/codex/.codex-plugin/plugin.json
```

### Validating Manifest Generation

`validate-plugins.yml` runs the renderers in CI and validates the output. Run the same checks locally:

```shell
pnpm sync:claude --out .preview/claude && jq empty .preview/claude/.claude-plugin/*.json
pnpm sync:codex  --out .preview/codex  && jq empty .preview/codex/.agents/plugins/marketplace.json .preview/codex/.codex-plugin/plugin.json
```

## Releases

Versioning is automated by [release-please](https://github.com/googleapis/release-please) on top of Gitflow:

1. Use [conventional commit](https://www.conventionalcommits.org/) prefixes (`feat:`, `fix:`, `feat!:` for breaking, etc.) — release-please reads them to generate the `CHANGELOG.md`. Versioning is configured `always-bump-patch`, so any merge to `main` produces a release; the prefix only affects changelog content.
2. PR `develop` → `main` with a `feat:` or `fix:` title (enforced by `lint-pr-title.yml`) and merge when ready to release.
3. Release-please opens a Release PR against `main` with version bumps (in `version.txt`, `metadata.json`, and each `SKILL.md` frontmatter) and a regenerated `CHANGELOG.md`. Review and merge it — the git tag and GitHub Release are created automatically.
4. The `sync-marketplaces` job in `release-please.yml` then runs the renderers and pushes the new version into `xyo-claude-plugin` and `xyo-codex-plugin` (matrix, `fail-fast: false`). Each mirror gets one commit per release plus a matching tag.
5. A `main → develop` sync PR is opened **and auto-merged** with the merge-commit method, keeping `develop` aligned for the next cycle. No human action required.

Release versions are owned end-to-end by release-please plus the renderers — don't edit them by hand. The marketplace-mirror repos are write-only; never commit directly to them.
