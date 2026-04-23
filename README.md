# XL1 Skills

Claude Code plugin marketplace for XL1 blockchain and XYO protocol development.

## Quick Install

```shell
# Add the marketplace
/plugin marketplace add XYOracleNetwork/xl1-skills

# Install the XL1 skill stack
/plugin install xl1-skills
```

## Plugins

### [xl1-skills](plugins/xl1-skills/)

Full-stack skills for building dApps on XL1. Five cascading layers covering design patterns, chain operations, XYO primitives, build tooling, and development conventions.

## Team Setup

Add to your project's `.claude/settings.json` for automatic marketplace availability:

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

## Evaluation Prompt

This repo also serves as a test bed for evaluating the skill stack. The target prompt:

> Build me a two-player rock paper scissors game on XL1. Use commit-reveal so neither player can see the other's move before both have committed. Record moves and outcomes on-chain. Include a UI where anyone can browse past games and results without connecting a wallet, and connected players can start and play games.

## License

MIT
