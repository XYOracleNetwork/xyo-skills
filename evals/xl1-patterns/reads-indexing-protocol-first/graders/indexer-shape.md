---
type: llm
weight: 2
---

The user wants a long-running XL1 indexer service for a leaderboard. The exact
API and variable names are checked by other graders; judge the structure only.

  [1] FLOOR — scanning starts from a captured floor block (an application-
      specific start height recorded in configuration), not from genesis.
  [2] CHECKPOINT-RESUME — progress (the last processed block) is persisted
      durably and written atomically, and after a restart the indexer resumes
      from that checkpoint rather than from the floor.
  [3] FINALIZED — the indexer consumes finalized blocks rather than the latest
      head.

PASS if all three are present in substance, in any wording.
FAIL if it scans from block 0, has no durable progress record or resumes from
the floor on every restart, or processes the latest head without regard to
finality.
