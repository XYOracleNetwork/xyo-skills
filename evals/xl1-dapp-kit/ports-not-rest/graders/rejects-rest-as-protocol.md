---
type: llm
weight: 2
---

The user proposes making a dapp-kit application port a REST API over HTTP.

PASS if the answer says an application port is typed command/query/status/admin
frames over WebSocket or MessagePort, and that REST is not the protocol — at
most a client-facing surface layered on top.

FAIL if it endorses REST over HTTP as what an application port is.
