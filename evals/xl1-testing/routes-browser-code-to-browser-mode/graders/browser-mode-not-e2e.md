---
type: llm
---

The user wants to unit-test a React hook that uses an XL1 gateway in headless
Chromium, without jsdom and without a full end-to-end run.

PASS only if the answer prescribes vitest browser mode with the Playwright
provider (headless Chromium), network calls mocked with MSW (or equivalent),
and distinguishes this from full-app Playwright e2e as a separate route.

FAIL if it recommends jsdom, recommends a full e2e suite as the answer, or omits
network mocking.
