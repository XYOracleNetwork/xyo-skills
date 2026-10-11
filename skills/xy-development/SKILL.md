---
name: xy-development
description: >-
  REDIRECT ONLY. Canonical xy-development lives in ariestools/ariestools-skills.
  Install that pack and read its xy-development skill for TypeScript conventions,
  Git workflow, testing principles, and the definition of done. This xyo-skills
  copy is a temporary redirect stub — do not use it as documentation.
metadata:
  version: 1.1.39 # x-release-please-version
  layer: 1
  status: redirect
  canonical: ariestools/ariestools-skills
  internal: true
---

# Development Standards — moved

**This file is not the skill.** The canonical `xy-development` skill is maintained only in [`ariestools/ariestools-skills`](https://github.com/ariestools/ariestools-skills).

## Required action

1. Install the Aries Skills pack if it is missing:
   - Preferred in XY/XYO repos: `pnpm xy skills defaults`
   - If an earlier whole-pack install replaced the canonical skill with this stub, repair it with `pnpm xy skills lint --fix` (toolchain ≥ 10.1.2); `npx skills update` re-fetches the stub
   - Or: `npx skills add ariestools/ariestools-skills --skill xy-development`
   - Claude: install `ariestools-skills` from `ariestools/ariestools-claude-plugin`
   - Codex: `codex plugin add ariestools-skills@ariestools-skills` after adding `ariestools/ariestools-codex-plugin`
2. **Load / read that installed skill** (`xy-development` from ariestools-skills).
3. Ignore every other `xy-development` file under `XYOracleNetwork/xyo-skills`.

## Why this stub exists

It ships only to Skills.sh, for older installs that still resolve this name; the Claude and Codex plugins no longer include it, and the xyo skills link to ariestools-skills by URL. Do not expand this stub with development-standards docs — edit [`ariestools/ariestools-skills`](https://github.com/ariestools/ariestools-skills) instead.

Deep-link shim still present for older links: [workflow.md](workflow.md).
