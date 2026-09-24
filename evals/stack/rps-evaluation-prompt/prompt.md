---
description: The repo's own evaluation prompt carried through the wizard's hand-off block into a scaffold-phase plan — exercises three pattern cascades and the stack's prescriptive conventions in one run.
tags: [composite, stack]
max_turns: 20
timeout_seconds: 480
allowed_tools: [Read, Glob, Grep, Skill]
---

Build me a two-player rock paper scissors game on XL1. Use commit-reveal so
neither player can see the other's move before both have committed. Record
moves and outcomes on-chain. Include a UI where anyone can browse past games
and results without connecting a wallet, and connected players can start and
play games.

I already ran the planning wizard and confirmed the spec below. Go straight to
the build plan — no further questions — and don't execute anything in this
session; lay the whole plan out in your reply.

Build an XL1 dApp.

Shape: two-player rock-paper-scissors with sealed moves
Network: sequence
Patterns: commit-reveal, chain-data-indexing-service, in-page-datalakes
Multi-party: 2 parties; accounts 0 and 1 hold funds
History/browse: public read-only via in-page datalake
Backend: monorepo with xl1-service indexer
Headless verification: yes — .env seed phrase + Node script
Notes: no stakes; a missing reveal forfeits after the reveal deadline
