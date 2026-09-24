---
type: llm
---

The user wants to test a React hook that uses an XL1 gateway in headless
Chromium, without jsdom and without a full end-to-end run.

PASS if the answer prescribes vitest browser mode with the Playwright provider
(headless Chromium), with network calls mocked (MSW or equivalent), as the
approach for browser-environment unit tests.

FAIL if it recommends jsdom, or a full Playwright end-to-end suite against the
rendered app, as the answer to this question.
