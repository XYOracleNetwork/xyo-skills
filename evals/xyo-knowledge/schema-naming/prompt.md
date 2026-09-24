---
description: A new payload schema name must be lowercase dot-segmented under the org/app namespace and unversioned, with later changes handled by metadata rather than renaming.
tags: [smoke, fidelity, xyo-knowledge]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

My org is Acme and the app is called rps. I need to name the payload schema
for a player's move, and I already know I'll be adding fields to it later.
What should the schema string be, and how do I handle those later changes
without breaking existing payloads?
