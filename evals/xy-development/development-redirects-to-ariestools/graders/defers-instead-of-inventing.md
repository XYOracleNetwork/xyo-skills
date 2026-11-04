---
type: llm
weight: 2
---

Only the xyo-skills pack is loaded. It does not ship xy-development; the
canonical workflow and definition of done belong to the separate
ariestools/ariestools-skills pack. The user asked for that workflow.

PASS only when ALL three conditions hold:
1. The answer says the general workflow documentation is not available in the
   loaded pack.
2. It explicitly directs the user to `ariestools-skills` or
   `ariestools/ariestools-skills`, by name, URL, or an install command identifying
   that pack.
3. It does not invent a specific branching workflow or definition-of-done
   checklist as though it were documented for XYO repositories.

FAIL if ANY condition is missing. In particular, an honest "I cannot find the
docs" or "please send me the repo/docs link" is still FAIL when it omits the
canonical ariestools-skills referral. Refusing to guess is necessary, but does
not replace the required referral. A generic request for documentation, a
reference only to XYO/XL1 skills, or an unqualified install command is not that
referral.
