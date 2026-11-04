---
type: llm
weight: 2
---

Acme owns `acme.com` and wants to publish RPS application schemas under
`network.xyo.acme.rps.*`.

PASS only if the answer says `network.xyo.*` is reserved for XYO Foundation /
protocol primitives and must not be used by application authors, and proposes
the application tier instead — `com.acme.rps.move` and `com.acme.rps.result`.
Namespace ownership is not authentication: the answer must not claim
that a prefix alone proves provenance or makes arbitrary payloads trusted.

FAIL if it accepts the `network.xyo.*` name, or says the choice is merely
stylistic. Also FAIL if it claims registry/validators, diviners, or archivists
automatically trust or accept a payload merely because its schema starts with
`network.xyo.*`, even when the namespace recommendation is otherwise correct.
Explaining collision, misleading naming, or protocol-canonical ownership is
fine; treating the name itself as proof of origin or validity is not.
