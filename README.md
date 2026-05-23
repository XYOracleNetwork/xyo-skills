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
| 1 | `xy-development` | TypeScript, Git workflow, testing, dev conventions |

Skills use progressive loading — each `SKILL.md` is a lightweight router that directs Claude to read sub-files on demand based on task context.

## Installation

Install the skills from GitHub — no need to clone the repo.

### Quick Install

```shell
# Add the marketplace
/plugin marketplace add XYOracleNetwork/xyo-skills

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
        "repo": "XYOracleNetwork/xyo-skills"
      }
    }
  }
}
```

Then each team member runs `/plugin install xl1-skills` once.

## Contributing

For local development, editing skills, building the scaffold package, and the release process, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## License

[LGPL-3.0-only](./LICENSE)
