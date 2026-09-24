---
type: llm
weight: 2
---

The user gave a complete spec — monorepo, rock-paper-scissors, commit-reveal
and chain-data-indexing-service patterns, sequence testnet, headless
verification with accounts 0 and 1 — and asked for the scaffold plan only.

PASS if the response lays out the scaffold plan directly: the monorepo shape
and its member templates, the cues it read from the spec (network, funded
accounts, headless verification) and how they change the setup, and what it
would verify. It must not ask the user which archetype or dApp shape they want.

FAIL if it asks the user to choose an archetype or dApp shape, re-asks
decisions the spec already made, or routes the concrete spec through a
planning wizard before answering.
