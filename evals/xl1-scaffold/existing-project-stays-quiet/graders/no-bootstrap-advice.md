---
type: llm
---

The user has a year-old production XL1 dApp and asked where failover gateway
wiring belongs in an existing codebase. The evaluation workspace is empty, so
the answer may say it cannot see the user's files — that is expected and must
not count against it.

PASS if the answer treats the project as already existing and describes where
gateway construction lives in such an app (for example a Node service's gateway
module or a React app's provider root) and how a fallback endpoint would be
added there. Offering to sketch the wrapper is fine.

FAIL only if the answer proposes creating a new project — scaffolding,
bootstrapping, initializing, or generating a project structure — or walks the
user through setting up a project from scratch.
