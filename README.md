# XL1 Skills

Claude Code plugin marketplace for XL1 blockchain and XYO protocol development.

## What's Included

Six skill layers that cascade top-down:

| Layer | Skill | Covers |
|-------|-------|--------|
| 6 | `xl1-scaffold` | Bootstrap new XL1 apps (React dApp, Node service, monorepo) |
| 5 | `xl1-patterns` | Commit-reveal, chain data indexing, in-page datalakes, prediction markets |
| 4 | `xl1-knowledge` | XL1 chain, datalakes, gateway, browser wallet |
| 3 | `xyo-knowledge` | XYO payloads, bound witnesses, modules, identity |
| 2 | `xy-toolchain` | @xylabs/toolchain, ESLint flat config, TypeScript config, Vitest |
| 1 | `development` | TypeScript, Git workflow, testing, dev conventions |

Skills use progressive loading — each `SKILL.md` is a lightweight router that directs Claude to read sub-files on demand based on task context.

## Installation

Install the skills from GitHub — no need to clone the repo.

### Quick Install

```shell
# Add the marketplace
/plugin marketplace add XYOracleNetwork/xl1-skills

# Install the XL1 skill stack
/plugin install xl1-skills
```

### Team Setup

Add to your project's `.claude/settings.json` so the marketplace is available for all team members automatically:

```json
{
  "extraKnownMarketplaces": {
    "xl1-skills": {
      "source": {
        "source": "github",
        "repo": "XYOracleNetwork/xl1-skills"
      }
    }
  }
}
```

Then each team member runs `/plugin install xl1-skills` once.

## Developing Skills Locally

For contributors editing skill files, there are three ways to load the plugin from a local checkout.

### Option 1: CLI Flag

Load the plugin for a single session — no installation required:

```shell
claude --plugin-dir ./plugins/xl1-skills
```

### Option 2: Local Marketplace (interactive)

Register the local checkout as a marketplace so the plugin persists across sessions:

```shell
# Inside a Claude Code session:
/plugin marketplace add ./
/plugin install xl1-skills
```

### Option 3: Local Marketplace (settings.json)

Add a directory-based marketplace to your `.claude/settings.json` (project or user level):

```json
{
  "extraKnownMarketplaces": {
    "xl1-skills": {
      "source": {
        "source": "directory",
        "path": "/absolute/path/to/xl1-skills"
      }
    }
  }
}
```

Then run `/plugin install xl1-skills` in your next session.

### Building the Scaffold Package (required for the `xl1-scaffold` skill)

The `xl1-scaffold` skill invokes a compiled CLI bundled under `plugins/xl1-skills/skills/xl1-scaffold/scripts/scaffold/`. That directory is **generated** from the TypeScript source at `packages/xl1-scaffold/`; it is not hand-authored. Before testing the scaffold skill locally, build it at least once:

```shell
corepack enable                      # first time only — ensures pnpm 10.x is available
corepack pnpm@10 install
corepack pnpm@10 -w run build
```

The build chain (`clean → tsc → copy-templates → sync-to-plugin`) compiles the TS source, mirrors the raw template files, and writes the resulting runtime into the skill directory.

Rebuild after any change to `packages/xl1-scaffold/src/` or `packages/xl1-scaffold/templates/`. CI fails the PR if committed source drifts from the synced runtime (`git diff --exit-code plugins/xl1-skills/skills/xl1-scaffold/scripts`).

### Edit-Reload Cycle

Claude Code loads skill content at startup. After editing any skill file, you must reload for changes to take effect:

1. Edit a `SKILL.md` or sub-file in `plugins/xl1-skills/skills/`
2. Run `/reload-plugins` in your Claude Code session
3. Changes are active for the rest of the session

There is no file watcher — `/reload-plugins` is required after every edit.

### Skill File Structure

Each skill is a directory under `plugins/xl1-skills/skills/` containing a `SKILL.md` router and topic sub-files:

```
plugins/xl1-skills/skills/
├── development/
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

After starting Claude Code or running `/reload-plugins`:

- Run `/help` — skills appear as `/xl1-skills:<name>` (e.g., `/xl1-skills:development`)
- Check the reload output for the skill count: `Reloaded: 1 plugins · 5 skills · ...`
- Invoke a skill directly: `/xl1-skills:xl1-patterns`

### Validating Plugin Structure

The CI workflow validates marketplace and plugin manifests. Run locally:

```shell
jq empty .claude-plugin/marketplace.json
jq empty plugins/xl1-skills/.claude-plugin/plugin.json
```

## Releases

Versioning is automated by [release-please](https://github.com/googleapis/release-please) on top of Gitflow:

1. Use [conventional commit](https://www.conventionalcommits.org/) prefixes (`feat:`, `fix:`, `feat!:` for breaking, etc.) — release-please reads them to generate the `CHANGELOG.md`. Versioning is configured `always-bump-patch`, so any merge to `main` produces a release; the prefix only affects changelog content.
2. PR `develop` → `main` with a `feat:` or `fix:` title (enforced by `lint-pr-title.yml`) and merge when ready to release.
3. Release-please opens a Release PR against `main` with version bumps and a regenerated `CHANGELOG.md`. Review and merge it — the git tag and GitHub Release are created automatically.
4. A `main → develop` sync PR is then opened **and auto-merged** with the merge-commit method, keeping `develop` aligned for the next cycle. No human action required.

`plugins/xl1-skills/.claude-plugin/plugin.json` is the version source of truth. `.claude-plugin/marketplace.json` and `version.txt` are kept in lockstep automatically — don't edit them by hand.

## License

MIT
