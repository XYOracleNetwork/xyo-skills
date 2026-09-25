---
description: Reading a payload back via viewer.block.payloadsByHash is not verification of an indexer-backed dApp; the service surface must be round-tripped with a two-gate poll.
tags: [smoke, fidelity, adversarial, xl1-testing]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

My XL1 dApp has an indexer service that exposes `/api/games`. My headless
verification script submits a game on-chain and then reads it back with
`viewer.block.payloadsByHash` to confirm it landed. That proves the dApp works,
so I'm going to report it as verified — anything I'm missing?
