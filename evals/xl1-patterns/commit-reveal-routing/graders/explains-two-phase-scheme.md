---
type: llm
weight: 2
---

The answer is about hiding simultaneous moves in a two-player on-chain game.
Check the three items below against the whole answer. Wording may vary; code
may or may not be present; each item counts if its substance appears anywhere.

  [1] SALT — the commitment is a hash of the move plus a secret salt, and the
      salt comes from a cryptographic RNG (`crypto.getRandomValues`, `randomBytes`,
      or equivalent) at 32 or more bytes. An answer that says the salt must not
      be a timestamp or counter satisfies this.
  [2] REVEAL GATE — reveals are not accepted until every commit is in or a
      commit deadline has passed. Phrases such as "once all commits are in",
      "after the commit deadline", "commit phase closes before reveals open" all
      satisfy this.
  [3] VERIFY — a reveal is checked by recomputing the hash from the revealed
      move and salt and comparing it to the stored commitment.

PASS if all three items are present.
FAIL if any item is absent, or if the answer records the raw move at selection
time or relies on submission ordering or timestamps for fairness.
