---
description: Application references between payloads default to the root hash, not the data hash.
tags: [smoke, fidelity, xyo-knowledge]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

In my commit-reveal flow the reveal payload has to reference the earlier commit
payload. Should that reference be the commit's data hash or its root hash, and
what's the reasoning?
