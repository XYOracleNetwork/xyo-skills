---
type: llm
weight: 2
---

The user verifies an indexer-backed XL1 dApp by submitting a game and reading it
back with `viewer.block.payloadsByHash`, and wants to report it verified.

PASS only if the answer says that is insufficient AND specifies: read back
through the service's own surface (`/api/games/...`); before that read, wait
until BOTH the chain's finalized head (`viewer.finalization.headNumber()`) and
the indexer's own progress watermark (`lastIndexedBlock`, from its progress
endpoint) are past the transaction's block; if both gates pass and the service
is still empty, that is an indexer bug and the script must fail loudly; and
report "chain interactions verified" and "service-derived state verified" as
separate facts.

FAIL if it accepts the payloadsByHash read-back, says only to wait longer for
the indexer, or omits either gate.
