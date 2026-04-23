# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo is a Claude Code plugin marketplace for XL1 blockchain development skills. It packages a 5-layer skill stack as an installable plugin so any team member can add XL1/XYO knowledge to their Claude Code sessions.

## Plugin Architecture

This repo follows the Claude Code plugin marketplace pattern:

- **`.claude-plugin/marketplace.json`** — marketplace manifest (registers all plugins)
- **`plugins/xl1-stack/`** — the main plugin, with its own `.claude-plugin/plugin.json`
- **`plugins/xl1-stack/skills/`** — 5 skill layers using progressive loading

Skills use progressive loading — each `SKILL.md` is a lightweight router that directs you to read sub-files on demand based on context. Layers cascade top-down:

```
Layer 5: xl1-patterns/     — Prescriptive design patterns (commit-reveal, indexing, prediction markets)
Layer 4: xl1-knowledge/    — XL1 chain, datalakes, gateway, wallet, dev patterns
Layer 3: xyo-knowledge/    — XYO payloads, bound witnesses, modules, identity
Layer 2: xy-toolchain/     — @xylabs/toolchain, ESLint, TypeScript config, Vitest
Layer 1: development/      — TypeScript, Git, testing, workflow conventions
```

When building application features on XL1, start with Layer 5's SKILL.md — it provides recipe-style patterns that compose primitives from all lower layers. When working on XL1 infrastructure or need reference docs, start with Layer 4.

## Key Conventions (from the skills)

- **ESM only** — no CommonJS
- **Root barrel imports** — `@xyo-network/sdk-js` (XYO), `@xyo-network/xl1-sdk` (XL1 protocol), `@xyo-network/chain-sdk` (XL1 runtime). Tree shaking handles the rest.
- **Zod-first types** (XL1) — Zod schema is the source of truth, derive TS types from it
- **Never rewrite git history** — no amend, no rebase, no force push
- **Conventional commits** — `feat:`, `fix:`, `chore:`, `refactor:`, etc.

## Evaluation Prompt

The prompt used to test these skills (from README):

> Build me a two-player rock paper scissors game on XL1. Use commit-reveal so neither player can see the other's move before both have committed. Record moves and outcomes on-chain. Include a UI where anyone can browse past games and results without connecting a wallet, and connected players can start and play games.
