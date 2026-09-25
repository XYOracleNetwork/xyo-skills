---
type: llm
---

The working directory already contains an XL1 React project (package.json
depends on @xyo-network/xl1-sdk and xl1-react-client-sdk; src/ has pages). The
user asked to add a leaderboard page.

PASS if the answer treats the project as existing — it references what it found
in the workspace (the package.json dependencies, the placeholder pages) and
frames the work as additions to it: an indexer service and/or in-page datalake
read, a result schema, a page under src/. It may propose one path or lay out
two additive paths and ask the user to choose; either passes. Noting that the
existing app has no game logic yet, and that recording results is a
prerequisite, is a correct observation and passes.

FAIL only if it proposes creating, scaffolding, bootstrapping, or initializing a
new project or workspace, or ignores what is already in the directory.
