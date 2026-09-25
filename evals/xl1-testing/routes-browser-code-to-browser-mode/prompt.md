---
description: Testing browser-environment XL1 code in headless Chromium routes to the browser-mode doc, not jsdom or full e2e.
tags: [smoke, cascade, xl1-testing]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I have a React hook that calls `useProvidedGateway` and I want its unit tests to
run in a real headless Chromium rather than jsdom — without spinning up the whole
app for an end-to-end run. What's the right setup?
