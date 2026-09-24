---
type: llm
weight: 2
---

The answer is about hiding simultaneous moves in a two-player on-chain game.

PASS if it describes a two-phase commit-reveal scheme in which:
  - phase one publishes a hash of the choice combined with a secret salt, and
  - phase two publishes the choice and salt, which are checked against the hash.
A correct answer may use different wording ("commitment", "nonce", "blinding
factor") and may or may not include code.

FAIL if it proposes recording the raw move on-chain at selection time, relies on
submission ordering or timestamps for fairness, suggests encrypting to the other
player without a reveal step, or omits the salt so the hash can be brute-forced
over the three possible moves.

Judge only the scheme. Formatting, length, and whether code is included do not
affect the verdict.
