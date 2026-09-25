---
description: Any dApp with a UI must reach browser-ux.md and follow its connection-lifecycle and capability-gating prescriptions.
tags: [smoke, cascade, fidelity, xl1-patterns]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

My React dApp on XL1 has a Connect button. Once the user connects I need their
address available on every page, and the "Submit move" button should only be
enabled when the connected wallet can actually write to the chain. How should I
structure the connection and that button?
