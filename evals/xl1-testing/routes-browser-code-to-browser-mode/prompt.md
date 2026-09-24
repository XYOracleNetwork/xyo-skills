---
description: Testing browser-environment XL1 code in headless Chromium routes to the browser-mode doc, not jsdom or full e2e.
tags: [smoke, cascade, xl1-testing]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I have a React hook that calls `useProvidedGateway` and I want to test it in a
real headless Chromium rather than jsdom, without standing up the whole app for
an end-to-end run. How does the skill stack say to set that up?
