---
type: llm
weight: 2
---

The user needs a schema name for a player-move payload under org "Acme", app
"rps", and expects to add fields later.

PASS if the proposed schema name is lowercase dot-separated segments under the
org/app namespace with no version suffix baked into the name, and later
additions are handled without renaming — for example additive fields, a
`$version` metadata field, or an explicitly open schema — so existing payloads
keep validating.

FAIL if it puts a version in the schema name (such as `.v1` or `-v2`), uses
uppercase or underscores in segments, or says to rename the schema when fields
are added.
