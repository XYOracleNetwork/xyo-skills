---
description: Work inside an existing project must not trigger the scaffold skill.
tags: [smoke, routing, negative, xl1-scaffold]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Our XL1 dApp has been in production for about a year. I need to add a second
gateway endpoint as a failover for when the primary is unreachable. Where in an
existing codebase would that wiring normally live?
