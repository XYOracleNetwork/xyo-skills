---
name: xl1-build
description: Interactive planning wizard for new XL1 dApps. Refines a vague or exploratory build request into a concrete spec (archetype, patterns, network, multi-party roles, headless verification) before any scaffolding runs. Activates when the user wants to build, design, or plan something on XL1 but hasn't fully specified what — phrases like "I want to build something on XL1", "help me design a dApp", "what could I build", or any "build me X on XL1" prompt where X is under-specified. Do NOT activate when the user has already given a concrete, complete spec (e.g., names the archetype, the patterns, the network) — defer directly to [xl1-scaffold](../xl1-scaffold/SKILL.md) in that case.
metadata:
  version: 1.1.26 # x-release-please-version
---

# XL1 Build Wizard

This skill is the **planning front-end** to the scaffold. It runs a short, structured conversation with the user to turn an exploratory build request into a refined prompt that [xl1-scaffold](../xl1-scaffold/SKILL.md) can act on directly.

Run this skill **before** the scaffold, not in parallel with it. The deliverable of this skill is a *refined prompt*, not a scaffolded project.

**Skill identity.** This skill's version is exposed in this file's frontmatter under `metadata.version`. When reporting which skills informed your work, format as `<skill-name> v<version>` (e.g. `xl1-build v1.1.19`). When multiple skills from this plugin are active, each may be listed.

## When this skill activates

Activate when the user's request is **exploratory, vague, or under-specified**:

- "I want to build something on XL1" / "help me design a dApp"
- "What could I build with this?" / "show me what's possible"
- "Build me a game on XL1" (game shape unspecified)
- "I want a token on XL1" (no decisions on mint cap, transfer rules, etc.)
- User explicitly invokes `/xl1-build`

Do **not** activate when:

- The user has named the archetype, the fairness/timing constraints, and the patterns — that's already a concrete spec; hand directly to [xl1-scaffold](../xl1-scaffold/SKILL.md)
- The user is asking a *question* about XL1 (concepts, APIs) — that's [xl1-knowledge](../xl1-knowledge/SKILL.md) or [xyo-knowledge](../xyo-knowledge/SKILL.md)
- The user is working in an existing project — that's [xl1-patterns](../xl1-patterns/SKILL.md) (or a knowledge layer)

If the trigger is ambiguous (concrete enough to scaffold, vague enough to refine), ask **one** question: *"Do you want me to plan the dApp shape with you first, or do you have a concrete spec in mind already?"*

## How to run the wizard

Four phases. Use `AskUserQuestion` for the question rounds. Keep the conversation tight — the user invoked this for guidance, not an interrogation.

### Phase 1 — Identify the archetype

Ask **one** `AskUserQuestion` round with the archetype options below. Pick the 3–4 that fit the prompt best; do **not** show all of them. If the user's wording already names an archetype (e.g., "rock-paper-scissors" → hidden-move game), pick it and skip to Phase 2.

| Archetype | Trigger phrases | Primary patterns |
|---|---|---|
| **Hidden-move multi-party game** | "rock paper scissors", "sealed bid", "simultaneous reveal", any game where seeing the opponent first would be unfair | [commit-reveal](../xl1-patterns/commit-reveal.md), [chain-data-indexing-service](../xl1-patterns/chain-data-indexing-service.md), [in-page-datalakes](../xl1-patterns/in-page-datalakes.md) |
| **Prediction market / betting** | "prediction market", "betting on an outcome", "settle when X happens" | [commit-reveal-prediction-markets](../xl1-patterns/commit-reveal-prediction-markets.md) |
| **Atomic exchange / escrow / swap** | "swap", "trade", "escrow", "neither party gets anything unless both commit" | [atomic-exchange](../xl1-patterns/atomic-exchange.md) |
| **Fungible token (XRC-20-style)** | "token", "ticker", "mint cap", "transferable balances" | [fungible-tokens](../xl1-patterns/fungible-tokens.md), [inscription-substrate](../xl1-patterns/inscription-substrate.md) |
| **Inscription / NFT-like / collectible** | "ordinals", "NFT", "transferable owned objects", "on-chain artifact" | [inscription-substrate](../xl1-patterns/inscription-substrate.md) |
| **Indexer / dashboard / history browser** | "leaderboard", "browse past X", "search across blocks", read-only viewer | [chain-data-indexing-service](../xl1-patterns/chain-data-indexing-service.md), [in-page-datalakes](../xl1-patterns/in-page-datalakes.md) |
| **Wallet utility / one-shot interaction** | "send X to Y", "balance dashboard", "one-click contract call" | None beyond [browser-ux](../xl1-patterns/browser-ux.md) |
| **Custom / not listed** | Anything else | Capture free-form description; reason from primitives |

### Phase 2 — Refine details for the chosen archetype

Each archetype has a fixed follow-up question set. Combine into a **single `AskUserQuestion` call** (max 4 questions). Skip any answer the prompt already gave you.

**Hidden-move multi-party game**
1. How many players per round? (2 / 3 / N)
2. Are there stakes? (No / Equal stake on both sides / Asymmetric)
3. Should anyone be able to browse past games without a wallet? (Yes — read-only history / No — players only)
4. Reveal deadline behavior? (No-reveal forfeits / No-reveal blocks settlement)

**Prediction market / betting**
1. Who can resolve outcomes? (Configured authority list / DAO-style vote / Oracle)
2. Stake currency? (XL1 native / XRC-20 / no stakes)
3. Browse markets without wallet? (Yes / No)

**Atomic exchange / escrow / swap**
1. How many parties? (2 / 3+)
2. What's being exchanged? (Two fungible tokens / Token ↔ inscription / Custom payloads)
3. Who authorizes appraisals/receipts? (Configured list / Counterparties only)

**Fungible token (XRC-20-style)**
1. Open ticker registration or single canonical ticker?
2. Mint policy? (Capped per-mint / Uncapped / Allowlist)
3. Should there be a dashboard to browse holders/supply?

**Inscription / NFT-like / collectible**
1. What gets inscribed? (Image bytes / JSON metadata / Free-form bytes)
2. Transferable?
3. Should there be a gallery / browser UI?

**Indexer / dashboard / history browser**
1. What's being indexed? (Existing schemas like XL1 transfers, or a specific dApp's payloads)
2. Wallet-gated, or fully public?
3. Real-time (block-driven) or polled?

**Wallet utility / one-shot interaction**
1. What chain action does the user trigger? (Send / Sign / Inscribe / Custom)
2. Anything to display from chain state before/after?

**Custom / not listed**
Ask the user to describe the flow in 2–3 sentences. Then map it manually to primitives in [xl1-patterns](../xl1-patterns/SKILL.md).

### Phase 3 — Capture the environment

One final `AskUserQuestion` round, two questions:

1. **Network target?** (Mainnet / Sequence / Local devnet)
2. **Headless verification?** (Yes — I want a `.env` seed phrase and a Node verification script / No — browser-only)

Headless verification is the cue that makes [xl1-scaffold](../xl1-scaffold/SKILL.md) wire up `GatewayBuilder.build(signer)` and run the script before reporting done — explained in [headless-verification](../xl1-testing/headless-testnet-verification.md). When the user says yes, also ask which accounts hold funds (e.g., "accounts 0 and 1") so multi-party roles can be assigned.

### Phase 4 — Synthesize the refined prompt and hand off

Produce a single prompt block in this shape and show it to the user before scaffolding:

```
Build an XL1 dApp.

Shape: <one-line archetype description, e.g. "two-player rock-paper-scissors with sealed moves">
Network: <mainnet | sequence | local>
Patterns: <comma-separated list of pattern doc names>
Multi-party: <N parties; accounts 0 and 1 hold funds | n/a>
History/browse: <public read-only via in-page datalake | wallet-gated | none>
Backend: <monorepo with xl1-service indexer | react only>
Headless verification: <yes — .env seed phrase + Node script | no>
Skills: <comma-separated xyo-skills plugin skill names that informed this plan or will guide scaffolding (e.g. "xl1-build, xl1-patterns, xl1-scaffold")>
Version: <this plugin's version, formatted "xl1-build v<version>" — read from xl1-build's frontmatter metadata.version; all xyo-skills travel together so one stamp covers every entry in `Skills` above (e.g. "xl1-build v1.1.19")>
Notes: <any free-form constraint from the user that doesn't fit a slot>
```

After the user confirms (or edits) the spec, **generate the project-specific acceptance criteria** following the guidance in [xy-development/workflow.md § Writing Project-Specific Acceptance Criteria](../xy-development/workflow.md#writing-project-specific-acceptance-criteria) — 5–10 observable bullets, split into positive and negative assertions, drawn from the user's answers + the loaded domain skills (patterns, knowledge layers). **No new user questions** — you have all the context you need from Phases 1–3 and the skill stack already in scope.

Then **write the PRD to `PRD.md` at the cwd**. The PRD is the durable, agent-readable record of the plan — it survives the chat, primes future sessions, lets [xl1-scaffold](../xl1-scaffold/SKILL.md) recover the spec if chat context is lost, and **carries Layer 3 of the completion gate** so the agent has a deterministic exit condition.

If `PRD.md` already exists at the cwd, ask the user with a single `AskUserQuestion`:

> A `PRD.md` already exists. Overwrite it with this new plan, or save the new plan to `PRD-<YYYY-MM-DD-HHMM>.md` and leave the existing one in place?

Use the user's answer. Do not silently overwrite.

The PRD file shape:

```markdown
# <one-line goal derived from Shape — e.g. "Two-player rock-paper-scissors with sealed moves">

*Generated by xl1-build v<version> on <YYYY-MM-DD>.*

## Build target

- **Shape:** <archetype>
- **Network:** <mainnet | sequence | local>
- **Patterns:** <comma-separated pattern doc names>
- **Multi-party:** <N parties; accounts 0 and 1 hold funds | n/a>
- **History/browse:** <public read-only via in-page datalake | wallet-gated | none>
- **Backend:** <monorepo with xl1-service indexer | react only>
- **Headless verification:** <yes — .env seed phrase + Node script | no>

## Acceptance criteria

This project is complete when ALL of the following pass. If any item fails, fix it and re-walk; do not stop on partial pass. See [xy-development/workflow.md § Applying the Definition of Done](../xy-development/workflow.md#applying-the-definition-of-done) for the layering rules.

### Layer 1 — Generic DoD
See [xy-development/workflow.md § Definition of Done](../xy-development/workflow.md#definition-of-done). Always applies.

### Layer 2 — Domain DoD
See [xl1-patterns/dapp-checklist.md](../xl1-patterns/dapp-checklist.md). Applies when the project is a browser-facing dApp on XL1 (omit this layer for service-only / CLI-only projects).

### Layer 3 — Project-specific criteria

Positive:
- [ ] <observable behavior 1 derived from the spec, e.g. "Two players can each submit a sealed move (hash only) on-chain">
- [ ] <observable behavior 2>
- [ ] <... 2–5 more positive criteria>

Negative:
- [ ] <prevented behavior 1, e.g. "No player can see the opponent's plaintext before both have committed">
- [ ] <prevented behavior 2, drawn from applicable anti-patterns in loaded domain skills>
- [ ] <... 1–3 more negative criteria>

## Skills referenced

<comma-separated skill names, same value as the `Skills:` slot in the synthesized prompt>

## Plugin version

xl1-build v<version>

## Notes

<free-form notes from the user, or omit this section entirely if none>
```

The Build target / Skills referenced / Plugin version / Notes sections are **reshapings of the synthesized prompt** — no new questions. The Acceptance criteria section is **generated by the agent** at PRD-write time, following the criteria-writing guidance referenced above. Each criterion must be observable (UI flow, command exit code, file inspection, network response) so the loop can deterministically check it.

After the PRD is written, hand off explicitly:

> Plan saved to `PRD.md`. I'll now invoke **xl1-scaffold** to bootstrap the project from this spec.

Then follow [xl1-scaffold](../xl1-scaffold/SKILL.md) as if the user had originally pasted the synthesized prompt. The scaffold's "Interpreting the prompt" section will read the network, accounts, and headless cues directly out of the synthesized prompt — that's why the prompt shape mirrors what the scaffold expects. If the scaffold runs without the synthesized prompt in context (e.g. a fresh conversation), it will read `PRD.md` instead.

## What the wizard does **not** do

- It does **not** scaffold. That's the scaffold's job; this skill stops at the synthesized prompt + hand-off line.
- It does **not** implement features. After scaffold, the work follows [xl1-patterns](../xl1-patterns/SKILL.md).
- It does **not** answer concept questions ("how does a bound witness work?"). Those go to [xyo-knowledge](../xyo-knowledge/SKILL.md) / [xl1-knowledge](../xl1-knowledge/SKILL.md) without running the wizard at all.
- It does **not** re-run on an existing project. If the user wants to *add* something to a scaffolded dApp, the entry point is [xl1-patterns](../xl1-patterns/SKILL.md).

## Anti-patterns

- **Don't run the wizard when the user already gave a complete spec.** Round-tripping a concrete prompt through clarifying questions wastes the user's time and signals that the agent didn't read carefully. The trigger conditions exist to prevent this.
- **Don't ask more than the table prescribes.** Each archetype's question set is sized for the smallest spec that unblocks scaffolding. Resist adding "while we're here" questions — anything not on the list can be decided during implementation.
- **Don't free-form the synthesized prompt.** The hand-off block has a fixed shape so the scaffold can read it the same way every time. Drift in shape produces drift in scaffold behavior.
- **Don't skip the user-confirmation step.** Show the synthesized prompt and let the user correct it before scaffolding. The whole point of the wizard is to make the spec inspectable.
