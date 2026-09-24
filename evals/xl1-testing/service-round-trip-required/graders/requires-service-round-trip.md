---
type: llm
weight: 2
---

The user verifies an indexer-backed XL1 dApp by submitting a game and reading
it back with `viewer.block.payloadsByHash`, and wants to report it verified.

PASS if the answer says that is not sufficient: the verification must also
round-trip through the service's own surface (`/api/games`), gate on both the
chain's finalized head and the indexer's last-indexed-block watermark before
reading, and report "chain interactions verified" and "service-derived state
verified" as separate facts.

FAIL if it accepts the payloadsByHash read-back as sufficient, or suggests only
waiting longer for the indexer without checking its watermark.
