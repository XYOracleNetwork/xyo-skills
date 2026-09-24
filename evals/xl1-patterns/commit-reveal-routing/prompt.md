---
description: A simultaneous-move fairness request should route to xl1-patterns and open the commit-reveal recipe.
tags: [smoke, routing, xl1-patterns]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm building a two-player game on XL1 where both players pick a move at the same
time. Neither player should be able to see what the other picked before both are
locked in. How should I structure that so the second player can't just read the
first player's move off-chain and win every time?
