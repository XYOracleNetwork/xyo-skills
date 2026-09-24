---
type: llm
---

The user asks whether a reveal payload should reference its commit payload by
data hash or root hash.

PASS if the answer recommends the root hash as the default for application
references and gives a reason (for example that it is the canonical identity
of the payload including its metadata, while data-hash contracts are reserved
for specific shipped protocol cases).

FAIL if it recommends the data hash as the default, or says the choice does
not matter.
