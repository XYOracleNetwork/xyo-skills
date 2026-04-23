# xl1-stack

Claude Code skills for building dApps on the XL1 blockchain (XYO Layer One).

## What's Included

Five skill layers that cascade top-down:

| Layer | Skill | Covers |
|-------|-------|--------|
| 5 | `xl1-patterns` | Commit-reveal, chain data indexing, in-page datalakes, prediction markets |
| 4 | `xl1-knowledge` | XL1 chain, datalakes, gateway, browser wallet |
| 3 | `xyo-knowledge` | XYO payloads, bound witnesses, modules, identity |
| 2 | `xy-toolchain` | @xylabs/toolchain, ESLint flat config, TypeScript config, Vitest |
| 1 | `development` | TypeScript, Git workflow, testing, dev conventions |

Skills use progressive loading — each `SKILL.md` is a lightweight router that directs Claude to read sub-files on demand based on task context.

## Installation

```shell
# Add the marketplace
/plugin marketplace add XYOracleNetwork/rock-paper-scissors-skill-test

# Install the plugin
/plugin install xl1-stack@xyo-skills
```

## Usage

Once installed, Claude automatically activates the relevant skills based on your task. For example:

- Ask Claude to build a dApp on XL1 and it will use `xl1-patterns` + `xl1-knowledge`
- Ask about XYO payloads or bound witnesses and it will use `xyo-knowledge`
- Start a new project and it will apply `xy-toolchain` + `development` conventions

## Key Conventions

- **ESM only** — no CommonJS
- **Root barrel imports** — `@xyo-network/sdk-js`, `@xyo-network/xl1-sdk`, `@xyo-network/chain-sdk`
- **Zod-first types** — Zod schema is the source of truth for XL1 types
- **Conventional commits** — `feat:`, `fix:`, `chore:`, `refactor:`, etc.

## License

MIT
