# Development

This guide is for contributors to the `xyo-skills` repository — editing skill files locally, building the scaffold package, and shipping releases. If you just want to install and use the skills, see the [README](./README.md).

## Developing Skills Locally

For contributors editing skill files, there are Claude Code and Codex paths for loading the plugin from a local checkout.

### Claude Code Option 1: CLI Flag

Load the plugin for a single session — no installation required:

```shell
claude --plugin-dir ./
```

### Claude Code Option 2: Local Marketplace (interactive)

Register the local checkout as a marketplace so the plugin persists across sessions:

```shell
# Inside a Claude Code session:
/plugin marketplace add ./
/plugin install xyo-skills
```

### Option 3: Local Marketplace (settings.json)

Add a directory-based marketplace to your `.claude/settings.json` (project or user level):

```json
{
  "extraKnownMarketplaces": {
    "xyo-skills": {
      "source": {
        "source": "directory",
        "path": "/absolute/path/to/xyo-skills"
      }
    }
  }
}
```

Then run `/plugin install xyo-skills` in your next session.

### Codex Local Marketplace

Register the local checkout as a Codex marketplace, then install the plugin from that marketplace:

```shell
codex plugin marketplace add /absolute/path/to/xyo-skills
codex plugin add xyo-skills@xyo-skills
```

After editing Codex plugin metadata or skill files, reinstall with `codex plugin add xyo-skills@xyo-skills` and start a new Codex thread so the updated skills are picked up.

The Codex marketplace manifest lives at `.codex-plugin/marketplace.json` and the plugin manifest at `.codex-plugin/plugin.json`. Both reference the repo root, so `skills/` and the manifests are picked up in place — no embedded mirror directory is needed.

### Building the Scaffold Package (required for the `xl1-scaffold` skill)

The `xl1-scaffold` skill invokes a compiled CLI bundled under `skills/xl1-scaffold/scripts/scaffold/`. That directory is **generated** from the TypeScript source at `packages/xl1-scaffold/`; it is not hand-authored. Before testing the scaffold skill locally, build it at least once:

```shell
corepack enable                      # first time only — ensures pnpm 10.x is available
corepack pnpm@10 install
corepack pnpm@10 -w run build
```

The build chain (`clean → tsc → copy-templates → sync-to-plugin`) compiles the TS source, mirrors the raw template files, and writes the resulting runtime into the skill directory.

Rebuild after any change to `packages/xl1-scaffold/src/` or `packages/xl1-scaffold/templates/`. CI fails the PR if committed source drifts from the synced runtime (`git diff --exit-code skills/xl1-scaffold/scripts`).

### Edit-Reload Cycle

Claude Code loads skill content at startup. After editing any skill file, you must reload for changes to take effect:

1. Edit a `SKILL.md` or sub-file in `skills/`
2. Run `/reload-plugins` in your Claude Code session
3. Changes are active for the rest of the session

There is no file watcher — `/reload-plugins` is required after every edit.

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

After starting Claude Code or running `/reload-plugins`:

- Run `/help` — skills appear as `/xyo-skills:<name>` (e.g., `/xyo-skills:xy-development`)
- Check the reload output for the skill count: `Reloaded: 1 plugins · 5 skills · ...`
- Invoke a skill directly: `/xyo-skills:xl1-patterns`

### Validating Plugin Structure

The CI workflow validates marketplace and plugin manifests. Run locally:

```shell
jq empty .claude-plugin/marketplace.json
jq empty .claude-plugin/plugin.json
jq empty .codex-plugin/marketplace.json
jq empty .codex-plugin/plugin.json
```

## Releases

Versioning is automated by [release-please](https://github.com/googleapis/release-please) on top of Gitflow:

1. Use [conventional commit](https://www.conventionalcommits.org/) prefixes (`feat:`, `fix:`, `feat!:` for breaking, etc.) — release-please reads them to generate the `CHANGELOG.md`. Versioning is configured `always-bump-patch`, so any merge to `main` produces a release; the prefix only affects changelog content.
2. PR `develop` → `main` with a `feat:` or `fix:` title (enforced by `lint-pr-title.yml`) and merge when ready to release.
3. Release-please opens a Release PR against `main` with version bumps and a regenerated `CHANGELOG.md`. Review and merge it — the git tag and GitHub Release are created automatically.
4. A `main → develop` sync PR is then opened **and auto-merged** with the merge-commit method, keeping `develop` aligned for the next cycle. No human action required.

`.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` are kept in lockstep automatically. `.claude-plugin/marketplace.json`, skill frontmatter versions, and `version.txt` are also part of the release version flow — don't edit release versions by hand.
