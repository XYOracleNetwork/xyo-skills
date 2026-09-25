---
description: In an atomic exchange a missing reveal must block settlement, never forfeit to the counterparty.
tags: [smoke, fidelity, xl1-patterns]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm building a two-party token swap on XL1 where each side commits and then
reveals. If one party commits but never reveals, I was going to let the other
party claim both sides' assets after a deadline as a penalty. Is that how the
settlement should work?
