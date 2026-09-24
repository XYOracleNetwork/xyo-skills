---
description: Same-origin app+service wiring — dev fix is the proxy not CORS, and the prescribed production topology must come from the wiring doc.
tags: [smoke, fidelity, cascade, adversarial, xl1-patterns]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

My scaffolded XL1 monorepo runs the React app on :3000 and the xl1-service on
:3001. In dev, `fetch('/api/games')` from the app fails, so I'm about to add the
`cors` middleware to the Express service. Two questions: is that the right fix,
and when this ships to production, what does the skill stack prescribe for how
the app and service are deployed so the browser still sees a single origin?
