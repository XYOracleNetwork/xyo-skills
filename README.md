# XL1 Skills

XL1 / XYO development skills for AI coding assistants. The same skill content is published to agent skill marketplaces and to [Skills.sh](https://skills.sh), so you can install it whichever way fits your workflow.

## What's Included

Six skill layers that cascade top-down:

| Layer | Skill | Covers |
|-------|-------|--------|
| 6 | `xl1-scaffold` | Bootstrap new XL1 apps (React dApp, Node service, monorepo) |
| 5 | `xl1-patterns` | Commit-reveal, chain data indexing, in-page datalakes, prediction markets |
| 4 | `xl1-knowledge` | XL1 chain, datalakes, gateway, browser wallet |
| 3 | `xyo-knowledge` | XYO payloads, bound witnesses, modules, identity |
| 2 | `xy-toolchain` | @xylabs/toolchain, ESLint flat config, TypeScript config, Vitest |
| 1 | `xy-development` | TypeScript, Git workflow, testing, dev conventions |

Skills use progressive loading — each `SKILL.md` is a lightweight router that directs the agent to read sub-files on demand based on task context.

## How These Work in Multiple Places

Agent skills are just Markdown files with YAML frontmatter (`name`, `description`). That format is portable across the major coding agents and skill registries, so this repo is a single source of truth that each install method consumes directly — you're getting the *same* skills regardless of how you install them.

## Install

### Marketplaces

Browse and install through your coding agent's built-in skill marketplace.

#### Claude Code

```shell
# Add the marketplace
/plugin marketplace add XYOracleNetwork/xyo-skills

# Install the XL1 skill stack
/plugin install xl1-skills
```

**Team setup:** Add to your project's `.claude/settings.json` so the marketplace is auto-discovered for everyone on the team:

```json
{
  "extraKnownMarketplaces": {
    "xl1-skills": {
      "source": {
        "source": "github",
        "repo": "XYOracleNetwork/xyo-skills"
      }
    }
  }
}
```

Each team member then runs `/plugin install xl1-skills` once.

#### OpenAI Codex

*Coming soon.*

### Skills.sh

[Skills.sh](https://skills.sh) is an open-source CLI from Vercel that installs agent skills into any of 50+ supported coding agents — including Claude Code, Cursor, Codex, OpenCode, Gemini CLI, and more. Use this route if your agent isn't on a marketplace, if you want a single command to install across multiple agents at once, or if you want skills installed globally on your machine.

#### Prerequisites

- **Node.js** (latest LTS recommended — download from [nodejs.org](https://nodejs.org))
- `npx` ships with Node.js, so no separate install is needed.

Platform-specific shortcuts for installing Node:

- **macOS:** `brew install node`
- **Windows:** `winget install OpenJS.NodeJS`
- **Linux:** use your package manager (`apt install nodejs`, `dnf install nodejs`, etc.)

#### Per-project install

Run from the root of your project. Skills are written into your agent's project-local folder (e.g. `.claude/skills/` for Claude Code), which you can commit alongside the project so anyone who clones it gets the same skills.

```shell
npx skills add XYOracleNetwork/xyo-skills --all
```

#### Global install

Installs into your home directory (e.g. `~/.claude/skills/`) so the skills are available across every project on your machine.

```shell
npx skills add XYOracleNetwork/xyo-skills --all -g
```

#### Platform notes

- **Windows:** Skills.sh defaults to symlinking, which on Windows requires either Developer Mode or running your terminal as Administrator. The easier fix is to add `--copy`, which copies files instead:

  ```shell
  npx skills add XYOracleNetwork/xyo-skills --all --copy
  ```

- **macOS / Linux:** Symlinks work out of the box — no extra setup needed.

#### Updating, removing, and listing

```shell
npx skills update              # update all installed skills
npx skills remove              # remove skills (interactive)
npx skills list                # show what's installed
```

Full CLI reference: [vercel-labs/skills](https://github.com/vercel-labs/skills).

## Contributing

For local development, editing skills, building the scaffold package, and the release process, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## License

[LGPL-3.0-only](./LICENSE)
