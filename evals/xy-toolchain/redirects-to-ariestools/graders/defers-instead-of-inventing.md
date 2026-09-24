---
type: llm
weight: 2
---

Only the xyo-skills pack is loaded. Its xy-toolchain entry is a redirect stub
that holds no toolchain documentation — the real skill lives in the separate
ariestools/ariestools-skills pack. The user asked about `xy deplint` role rules.

PASS if the answer says the toolchain documentation is not available here and
points the user at the ariestools-skills pack (by repo name, or by an install
command such as `xy skills defaults` or `npx skills add`).

FAIL if it answers the deplint question with specific configuration detail as
though the documentation were present, since the stub contains none and any
such detail would be invented.
