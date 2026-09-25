---
description: Generated XYO code must use the root barrel import and never a deprecated package name or deep path.
tags: [smoke, fidelity, conventions, stack]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

Show me the smallest complete Node script that builds a `com.acme.rps.move`
payload with `{ move: "rock" }`, computes its hash, and prints the hash — and
tell me what to install.
