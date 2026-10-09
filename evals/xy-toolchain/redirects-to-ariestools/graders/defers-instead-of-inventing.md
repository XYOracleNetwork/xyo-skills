---
type: llm
weight: 2
---

Only the xyo-skills pack is loaded. It does not ship xy-toolchain — that skill is
canonical in the separate ariestools/ariestools-skills pack, which the xyo
skills reference by URL. The pack holds no toolchain documentation of its own. The user asked about `xy deplint` role rules.

PASS if the answer says the toolchain documentation is not available here and
points the user at the ariestools-skills pack (by repo name, or by an install
command such as `xy skills defaults` or `npx skills add`).

FAIL if it answers the deplint question with specific configuration detail as
though the documentation were present, since the pack contains none and any
such detail would be invented.
