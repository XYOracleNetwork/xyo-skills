# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo is a test bed for a 4-tier Claude Code skill stack targeting XL1 blockchain development. The skills are the primary artifact — there is no application code yet. The goal is to evaluate whether the skills can guide an agent to produce a working XL1-backed Rock Paper Scissors game from a single prompt.

## Skill Architecture

Skills live in `.claude/skills/` and use progressive loading — each `SKILL.md` is a lightweight router that directs you to read sub-files on demand based on context. Layers cascade top-down:

```
Layer 4: xl1-knowledge/    — XL1 chain, datalakes, gateway, wallet, dev patterns
Layer 3: xyo-knowledge/    — XYO payloads, bound witnesses, modules, identity
Layer 2: xy-toolchain/     — @xylabs/toolchain, ESLint, TypeScript config, Vitest
Layer 1: development/      — TypeScript, Git, testing, workflow conventions
```

When working on XL1 blockchain features, start with Layer 4's SKILL.md — it will point you to the right sub-files and reference lower layers as needed.

## Key Conventions (from the skills)

- **ESM only** — no CommonJS
- **Root barrel imports** — `@xyo-network/sdk-js` (XYO), `@xyo-network/xl1-sdk` (XL1 protocol), `@xyo-network/chain-sdk` (XL1 runtime). Tree shaking handles the rest.
- **Zod-first types** (XL1) — Zod schema is the source of truth, derive TS types from it
- **Never rewrite git history** — no amend, no rebase, no force push
- **Conventional commits** — `feat:`, `fix:`, `chore:`, `refactor:`, etc.

## Evaluation Prompt

The prompt used to test these skills (from README):

> Build me a rock paper scissors game where I can compete against other players. Each game's moves and outcomes should be recorded on the XL1 Blockchain. Include a UI for playing games and viewing past results.
