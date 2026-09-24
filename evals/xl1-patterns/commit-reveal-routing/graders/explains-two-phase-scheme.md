---
type: llm
weight: 2
---

The answer is about hiding simultaneous moves in a two-player on-chain game.

PASS only if all three hold:
  1. the commitment is a hash of the move plus a secret salt, and the salt is
     generated with a cryptographic RNG (e.g. `crypto.getRandomValues`) at 32+
     bytes — not a timestamp, counter, or short value;
  2. reveals are not accepted until the commit phase has closed (a commit
     deadline or "all commits in" gate), so a late committer cannot see an early
     reveal;
  3. each reveal is verified by recomputing the hash and comparing to the
     stored commit.

FAIL if the salt is omitted or predictable, if reveals may open before all
commits are in, if the raw move is recorded at selection time, or if fairness
relies on submission ordering or timestamps. Wording and code presence do not
affect the verdict.
