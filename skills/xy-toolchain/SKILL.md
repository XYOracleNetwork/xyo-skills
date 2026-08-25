---
name: xy-toolchain
description: >-
  REDIRECT ONLY. Canonical xy-toolchain lives in ariestools/ariestools-skills.
  Install that pack and read its xy-toolchain skill for @ariestools/toolchain,
  the xy CLI, ESLint flat configs, TypeScript configs, Vitest, deplint, repository
  policy, skills, and work tracking. This xyo-skills copy is a temporary redirect
  stub — do not use it as documentation.
metadata:
  version: 1.1.31 # x-release-please-version
  status: redirect
  canonical: ariestools/ariestools-skills
---

# XY Toolchain — moved

**This file is not the skill.** The canonical `xy-toolchain` skill is maintained only in [`ariestools/ariestools-skills`](https://github.com/ariestools/ariestools-skills).

## Required action

1. Install the Aries Skills pack if it is missing:
   - Preferred in XY/XYO repos: `xy skills defaults`
   - Or: `npx skills add ariestools/ariestools-skills --skill xy-toolchain`
   - Claude: install `ariestools-skills` from `ariestools/ariestools-claude-plugin`
   - Codex: `codex plugin add ariestools-skills@ariestools-skills` after adding `ariestools/ariestools-codex-plugin`
2. **Load / read that installed skill** (`xy-toolchain` from ariestools-skills).
3. Ignore every other `xy-toolchain` file under `XYOracleNetwork/xyo-skills`.

## Why this stub exists

Older xyo-skills installs and in-repo relative links still resolve here. Those links are deprecated. Do not expand this stub with toolchain docs — edit [`ariestools/ariestools-skills`](https://github.com/ariestools/ariestools-skills) instead.

Deep-link shim still present for older links: [testing.md](testing.md).
