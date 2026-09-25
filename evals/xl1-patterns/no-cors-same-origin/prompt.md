---
description: Same-origin app+service wiring — the dev fix is the Vite proxy, not CORS; the prescribed production topology must come from the wiring doc.
tags: [smoke, fidelity, cascade, adversarial, xl1-patterns]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

My scaffolded XL1 monorepo runs the React app on :3000 and the xl1-service on
:3001. In dev, `fetch('/api/games')` from the app fails, so I'm about to add the
`cors` middleware to the Express service. Is that the right fix? And once this is
deployed, how are the app and service meant to be laid out so the browser still
sees a single origin?
