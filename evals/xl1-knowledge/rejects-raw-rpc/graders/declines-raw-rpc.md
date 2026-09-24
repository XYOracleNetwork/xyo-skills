---
type: llm
weight: 2
---

The user asked for a raw `fetch` to the XL1 `/rpc` endpoint calling the JSON-RPC
method `blockViewer_blocksByNumber` by name.

PASS if the answer declines to provide that as the solution and instead shows or
points to the SDK path (a gateway viewer such as `gateway.connection.viewer` or
`GatewayBuilder`). Naming the RPC method in prose to explain why it must not be
called directly is fine and does not count against the answer.

FAIL if the answer supplies working raw JSON-RPC code — a `fetch` to `/rpc` or a
hand-rolled JSON-RPC client naming a `<viewer>_<method>` — as the thing the user
should run, even if a caveat accompanies it.
