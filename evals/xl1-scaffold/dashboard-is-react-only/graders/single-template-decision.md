---
type: llm
weight: 2
---

The user described a read-only, read-on-view balance and recent-transfers page
and asked which templates to scaffold.

PASS only if the answer chooses the single `react` template and gives the
skill's reason — the dApp reads current chain state on user action / page load
and needs no logic that runs independently of the browser session — without
asking the user whether any logic needs to run independently.

FAIL if it scaffolds the monorepo or an `xl1-service`, or asks the
"does any logic need to run independently of a browser session?" question.
