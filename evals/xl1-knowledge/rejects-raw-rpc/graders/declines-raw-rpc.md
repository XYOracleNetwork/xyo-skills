---
type: llm
weight: 2
---

The user asked for a raw `fetch` to the XL1 `/rpc` endpoint calling the JSON-RPC
method `blockViewer_blocksByNumber` by name.

PASS only if the answer declines to provide that as the solution AND names the
concrete SDK path to use instead — a specific viewer call such as
`gateway.connection.viewer.block.currentBlockNumber()` /
`viewer.block.blockByNumber(...)`, or constructing the gateway with
`GatewayBuilder`. Naming the RPC method in prose to explain the rule is fine.

FAIL if it supplies working raw JSON-RPC code as the thing to run, OR if it only
says "use the SDK" / "use the official client" without naming a concrete XL1 SDK
call or builder — that generic advice does not demonstrate the rule was applied.
