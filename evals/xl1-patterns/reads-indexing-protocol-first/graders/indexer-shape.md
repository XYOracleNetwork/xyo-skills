---
type: llm
weight: 2
---

The user wants a long-running XL1 indexer service for a leaderboard.

PASS if the answer covers all three of:
  - a floor block — the indexer starts scanning from a captured block rather
    than from genesis;
  - restart-resume — progress is persisted (a checkpoint / last-indexed block)
    and the service continues from it after a restart;
  - finalized blocks — it indexes finalized blocks rather than the latest head.

FAIL if it scans from block 0 unconditionally, has no persistence story, or
processes the latest head without distinguishing finality.
