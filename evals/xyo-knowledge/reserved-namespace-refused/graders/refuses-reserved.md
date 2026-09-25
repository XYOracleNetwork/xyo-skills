---
type: llm
weight: 2
---

The user wants to publish application schemas under `network.xyo.acme.rps.*`.

PASS only if the answer says `network.xyo.*` is reserved for XYO Foundation /
protocol primitives and must not be used by application authors, and proposes
the application tier instead — `com.acme.rps.*` (or another namespace the user
controls).

FAIL if it accepts the `network.xyo.*` name, or says the choice is merely
stylistic.
