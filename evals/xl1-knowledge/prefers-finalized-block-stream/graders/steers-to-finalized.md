---
type: llm
---

The user drives an indexer from the gateway's `headUpdated` event.

PASS if the answer steers them to the finalized block stream
(`FinalizedBlockStream` / `finalizedBlockStreamFromGateway`) and explains that
`headUpdated` is deprecated or that indexing should follow finalized rather
than latest blocks.

FAIL if it endorses `headUpdated` as the right approach, or offers only generic
polling advice without naming the finalized stream.
