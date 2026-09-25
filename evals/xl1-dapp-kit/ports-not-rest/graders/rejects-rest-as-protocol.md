---
type: llm
weight: 2
---

The user proposes making a dapp-kit application port a REST API over HTTP.

PASS only if the answer says an application port is typed frames — commands,
queries, status, admin (and port subscriptions) — carried over WebSocket (Node)
or MessagePort (browser), with HTTP limited to health, static, or unary
convenience calls; and that REST is not the protocol, at most a client surface
fronting the port.

FAIL if it endorses REST over HTTP as what a port is, or says "not REST"
without naming the frame kinds and the WebSocket/MessagePort transports.
