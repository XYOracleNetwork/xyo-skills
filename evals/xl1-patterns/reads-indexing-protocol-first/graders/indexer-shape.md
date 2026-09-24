---
type: llm
weight: 2
---

The user wants a long-running XL1 indexer service for a leaderboard.

PASS only if the answer covers all of:
  - a floor block: scanning starts from a captured block recorded as
    `INDEXER_FLOOR_BLOCK` (per chain), not from genesis;
  - a persisted checkpoint holding the last processed block (hash and/or
    number), written atomically, with restart resuming from the checkpoint
    rather than from the floor;
  - finalized delivery — consuming finalized blocks (e.g. `FinalizedBlockStream`
    / `finalizedBlockStreamFromGateway`) rather than the latest head.

FAIL if it scans from block 0, has no durable checkpoint / resume story, or
processes the latest head without distinguishing finality. Generic "use a
database and poll for new blocks" advice without these specifics FAILS.
