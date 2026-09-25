---
description: An indexer request must open the protocol file before the role file, and land on floor block, checkpoints, and finalized semantics.
tags: [smoke, cascade, xl1-patterns]
max_turns: 15
allowed_tools: [Read, Glob, Grep, Skill]
---

I need a leaderboard for my XL1 game dApp: a long-running service that indexes
every game-outcome payload my dApp has ever written and serves rankings over
HTTP. Walk me through how to structure the indexer — in particular how it
decides which blocks to scan, and how it picks up where it left off after a
restart.
