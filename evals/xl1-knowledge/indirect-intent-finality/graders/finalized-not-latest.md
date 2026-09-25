---
type: llm
---

The user wants a Node job to act only on blocks that are truly settled and then
read their payloads.

PASS if the answer distinguishes finalized from latest/head blocks and names the
XL1 SDK's finalized delivery — `FinalizedBlockStream` /
`finalizedBlockStreamFromGateway` or the `viewer.finalization` API — as where
to start, built from a `GatewayBuilder` gateway.

FAIL if it proposes polling the latest head, a generic "wait N confirmations"
heuristic, or any Ethereum-style tooling.
