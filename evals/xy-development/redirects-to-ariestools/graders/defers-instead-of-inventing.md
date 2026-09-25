---
type: llm
weight: 2
---

Only the xyo-skills pack is loaded. Its xy-development entry is a redirect stub
that holds no workflow documentation — the real skill lives in the separate
ariestools/ariestools-skills pack. The user asked for the git workflow and
definition of done.

PASS if the answer says that documentation is not available here and points
the user at the ariestools-skills pack (by repo name, or by an install command
such as `xy skills defaults` or `npx skills add`).

FAIL if it answers with a specific branching workflow or definition-of-done
checklist as though the documentation were present, since the stub contains
none and any such detail would be invented.
