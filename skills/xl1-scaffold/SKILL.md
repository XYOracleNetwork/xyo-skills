---
name: xl1-scaffold
description: Bootstrap a new XL1 application — a single React dApp, a single xl1-service backend, a plain Node.js service/CLI, or a full-stack pnpm monorepo with React + xl1-service + a shared TypeScript library. Activates when the user wants to create, start, bootstrap, initialize, or scaffold a new XL1 project. Do NOT activate for work in an existing project.
metadata:
  version: 1.1.19 # x-release-please-version
---

# XL1 Scaffold

Use this skill **only** when the user is starting a **new** XL1 project. For work in an existing repo — adding features, fixing bugs, or answering questions about XL1 concepts — use the appropriate lower-layer skill instead ([xl1-knowledge](../xl1-knowledge/SKILL.md) for the chain, [xl1-patterns](../xl1-patterns/SKILL.md) for design patterns).

**Skill identity.** This skill's version is exposed in this file's frontmatter under `metadata.version`. When reporting which skills informed your work, format as `<skill-name> v<version>` (e.g. `xl1-scaffold v1.1.19`). When multiple skills from this plugin are active, each may be listed.

## How to recognize the trigger

Activate when the user says anything like:

- "Build me a ___ on XL1"
- "Create a new XL1 dApp"
- "Start a React dApp that uses the wallet"
- "Scaffold an XL1 service that reads from the datalake"
- "Bootstrap a new project using @xyo-network"

Do **not** activate when:

- The current directory already has a `package.json` depending on `@xyo-network/*`
- The user is describing a feature, bug, or concept within an existing project
- The user is asking how something works (that's reference, not scaffolding)

If ambiguous, ask one question: *"Are you starting a new project, or adding to an existing one?"*

If the user wants a new project but the request is **vague or exploratory** — they haven't named the archetype, the patterns, or the multi-party shape — defer to [xl1-build](../xl1-build/SKILL.md) **first**. That skill runs a short planning wizard and hands a refined prompt back here. Concrete prompts (the archetype is named, the patterns are implied, the network is specified) skip the wizard and come straight to this skill.

## Interpreting the prompt

Before invoking the scaffold, scan the prompt and the working directory for conventions that change how you build and verify the dApp. These cues are easy to miss because they look like incidental context, but each one prescribes specific behavior.

- **`.env` file with a seed phrase already in the empty repo.** The user expects the dApp to be **headless-verifiable end-to-end** by an agent or CI, using the same identity a browser user would have on that seed. Build the dApp normally — browser wallet wiring intact, React providers, the works — but also write a Node verification script that exercises the happy path through `GatewayBuilder.build(signer)` and run it before reporting completion. The seed phrase is for verification only; it does not change the UX surface of the dApp. **Read [Headless dApp Verification](../xl1-patterns/headless-verification.md) before planning** — it documents the prompt shape, signer derivation, and anti-patterns. The DoD's Headless Verification section becomes mandatory in this case.
- **Prompt names which accounts hold funds** (e.g. "accounts 0 and 1"). Tells you how many signers to derive and how to assign roles in multi-party flows.
- **Prompt names a network** (mainnet / sequence / local). Determines the `DefaultNetworks` entry the scaffold's gateway points at and which `INDEXER_FLOOR_BLOCK` is captured.

Treat any of these cues as load-bearing. Surface them in your acknowledgement before scaffolding so the user can correct any misread.

### PRD.md fallback (read)

If the prompt itself is missing the synthesized spec from [xl1-build](../xl1-build/SKILL.md) — for example, a fresh conversation where the wizard ran in a prior session — **check the cwd for a `PRD.md` file before asking the user to repeat themselves.** The PRD is written by `xl1-build` at the end of its Phase 4 and contains the same fields as the inline synthesized prompt (`Shape`, `Network`, `Patterns`, `Multi-party`, `History/browse`, `Backend`, `Headless verification`, `Notes`) under structured markdown headings, plus an `## Acceptance criteria` section that carries Layer 3 of the completion gate. Read it the same way you would read the inline prompt.

If both the chat prompt and `PRD.md` are absent, fall back to asking the user — or, if the request is exploratory enough, defer to [xl1-build](../xl1-build/SKILL.md) to generate a PRD first.

### Writing PRD.md from an inline prompt (advanced-user path)

When the user gives a concrete spec inline (skipping the wizard) and **no `PRD.md` exists at the cwd**, write one before scaffolding. This closes the gap so every project has a Layer 3 completion gate regardless of how it was kicked off.

The shape mirrors what [xl1-build](../xl1-build/SKILL.md) Phase 4 produces — same sections, same headings. The data sources differ:

- **Build target fields** (Shape, Network, Patterns, Multi-party, History/browse, Backend, Headless verification) are derived from the inline prompt the same way you derive scaffold inputs.
- **Acceptance criteria** are **generated by you** following [xy-development/workflow.md § Writing Project-Specific Acceptance Criteria](../xy-development/workflow.md#writing-project-specific-acceptance-criteria): 5–10 observable bullets, split into positive and negative assertions, drawn from the inline prompt + the loaded domain skills (`xl1-patterns/*` for the matched patterns, `dapp-checklist.md` for anti-patterns to convert into negative criteria).
- **Skills referenced** is the list of xyo-skills plugin skills that informed this plan (typically xl1-scaffold + the relevant pattern docs).
- **Plugin version** uses `xl1-scaffold`'s `metadata.version` from this file's frontmatter (since the wizard didn't run, attribute to the scaffold).
- **Notes** captures any free-form constraint from the prompt that doesn't fit a slot.

Write the file at the cwd as `PRD.md`. If the user's prompt is too vague to derive acceptance criteria — for example, they said "build me something on XL1" — **do not guess**; defer to [xl1-build](../xl1-build/SKILL.md) to run the wizard properly. Generating weak criteria from a vague prompt is worse than no criteria at all because it makes the loop appear to terminate when the spec was never concrete.

Surface the written PRD in your acknowledgement so the user can correct any misread before scaffolding starts:

> Wrote `PRD.md` capturing the spec and acceptance criteria. Review it briefly — anything off, tell me before I scaffold.

## Invocation

The scaffold runtime ships with this plugin under `scripts/scaffold/` (synced from `packages/xl1-scaffold/` at build time). Invoke it directly with Node — `${CLAUDE_SKILL_DIR}` resolves to this skill's directory at runtime.

### Choosing template(s)

This skill scaffolds either a **single project** or a **full-stack monorepo**, based on whether the dApp needs ongoing chain tracking.

#### Available templates

| Template | When | Used standalone? |
|---|---|---|
| `react` (default) | User-facing dApp that reads current chain state and submits transactions on user action. Most browser-facing apps. | ✓ also a monorepo member at `packages/app` |
| `xl1-service` | Node + Express HTTP service backed by `@xyo-network/xl1-sdk`. The backend for any dApp needing chain-watching, indexing, or scheduled jobs. | ✓ also a monorepo member at `packages/service` |
| `node` | Plain Node CLI/script — rare from this skill; usually a backend that needs HTTP routes prefers `xl1-service`. | ✓ standalone only |
| `xl1-monorepo` | pnpm workspace root for a full-stack dApp. No source of its own — just `pnpm-workspace.yaml`, root scripts, and a README. | monorepo flow only (step 1 below) |
| `xl1-shared` | TypeScript library for environment-neutral code (types, Zod schemas, constants) shared between `app` and `service`. Compiles to `dist/` so workspace consumers import compiled JS via `workspace:*`. | monorepo flow only (member at `packages/shared`) |

**Default to the monorepo flow** (`xl1-monorepo` + `xl1-shared` + `react` + `xl1-service`). Drop to a single template only when the prompt is *clearly* read-only / browser-only (e.g. "wallet balance dashboard", "show recent transactions"). When in doubt, scaffold the monorepo — it's strictly a superset; an unused `service` is cheap to delete later, but retrofitting a service into a single-template scaffold is annoying.

#### Full-stack monorepo (xl1-monorepo + react + xl1-service + xl1-shared)

Scaffold a **monorepo** when the dApp needs logic that runs **independently of any user's browser session**. Triggers:

- **Multi-actor coordination across time** — e.g. commit-reveal flows where reveals happen long after commits and the browser may have closed
- **Indexing or aggregating chain data** — leaderboards, history pages, search across past events
- **Time-based deadlines** — auction settlements, period closes, reveal windows that need to be detected when blocks elapse
- **Notifications or scheduled jobs** — anything triggered by block arrival rather than user click

The monorepo gives the React app and the xl1-service a place to share code via the `xl1-shared` library — typically API request/response types, Zod schemas, and constants used on both sides.

Examples mapped to decisions:

| Prompt fragment | Decision |
|---|---|
| "two-player rock-paper-scissors with commit-reveal", "browse past games" | monorepo — service watches reveals, indexes history; shared holds Move/Game types |
| "prediction market with settlement deadline" | monorepo — settlement runs independently; shared holds Market/Outcome types |
| "wallet balance dashboard" | react only |
| "one-click contract interaction" | react only |
| "show recent transactions for an address" (read-on-view) | react only |
| "real-time leaderboard updated as blocks arrive" | monorepo |

The [xl1-patterns](../xl1-patterns/SKILL.md) skill catalogues patterns that imply a backend — commit-reveal, chain data indexing, prediction markets all do.

#### When ambiguous

**Default to the monorepo flow.** Don't ask the user — just scaffold it. The monorepo is a superset of the single-template options; unused parts (e.g. `service` if the app turns out to be read-only) are easy to delete later. Retrofitting a backend into a standalone React scaffold is much harder.

Only drop to a single template (`react`) when the prompt is unambiguously read-only — wallet balance dashboards, one-shot contract interactions, simple display dApps. If you find yourself even slightly unsure, choose the monorepo.

The clarifying question pattern ("does any logic need to run independently of a browser session?") is **discouraged** — it adds round-trip latency and the answer is almost always "yes, eventually." Skip it; default to monorepo and let the user prune if needed.

### Target directory

- If the user named a directory ("put it in `./rps-game`"), use that as the **root**.
- Otherwise, default to the current working directory **if empty**, or to a subdirectory named after the app being built (e.g. `./rps-game` from "build me a rock-paper-scissors game").
- Confirm the path in a single sentence before running.

For a monorepo, scaffold sub-packages under `packages/`:

```
<root>/
├── package.json, pnpm-workspace.yaml, README.md, .gitignore   ← from xl1-monorepo
└── packages/
    ├── app/         ← react template
    ├── service/     ← xl1-service template
    └── shared/      ← xl1-shared template (types/schemas used by app + service)
```

The monorepo templates wire app ↔ service the same way every time: app on `:3000`, service on `:3001`, all service routes under `/api/*`, Vite dev-proxies `/api/*` to the service so the browser stays same-origin, and the workspace root's `pnpm dev` runs both concurrently. **Do not add CORS middleware** to the service — there is nothing to CORS for in this topology, and adding it "just in case" is the anti-pattern that the prescription exists to prevent. The full pattern (including the prod reverse-proxy story and the cross-origin escape hatch) is documented in [Browser ↔ Service Wiring](../xl1-patterns/browser-service-wiring.md). When implementing the dApp, fetch with relative paths (`fetch('/api/foo')`) — no `VITE_API_URL`, no hardcoded host.

### Run the scaffold

For a **single template**:

```shell
node "${CLAUDE_SKILL_DIR}/scripts/scaffold/scaffold-xl1-dapp.js" <root> --template=<react|node|xl1-service>
```

For a **monorepo**, four scaffold invocations + a single root install:

```shell
SKILL="${CLAUDE_SKILL_DIR}/scripts/scaffold/scaffold-xl1-dapp.js"

# 1. Workspace root (no install — verification skipped, root has no installable code yet).
#    The root's package.json `name` field is the dir's basename (e.g. `rps-game`); sub-
#    package scopes auto-derive from this (sub-packages become `@rps-game/<basename>`).
node "$SKILL" <root> --template=xl1-monorepo --no-install

# 2. Sub-packages — each runs in workspace-member mode (skips its own install + verification;
#    drops its own packageManager + .gitignore; package name becomes @<scope>/<basename>).
#    Order matters: scaffold shared FIRST. When app and service are scaffolded after,
#    they auto-detect the sibling shared package and wire a "@<scope>/shared": "workspace:*"
#    dep into their package.json automatically.
node "$SKILL" <root>/packages/shared  --template=xl1-shared   --workspace-member
node "$SKILL" <root>/packages/app     --template=react        --workspace-member
node "$SKILL" <root>/packages/service --template=xl1-service  --workspace-member

# 3. Single install at the workspace root — links all members + installs deps for all.
cd <root> && pnpm install

# 4. Verify across the workspace.
pnpm -r run typecheck && pnpm -r run lint && pnpm -r run build
# For xl1-service specifically, also smoke-test the server boot:
pnpm --filter @<scope>/service run smoke
```

The scaffold (per single-template invocation, when NOT in workspace-member mode):

1. Resolves the full runtime dependency graph from the npm registry (direct deps + peers).
2. Writes `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vite.config.ts` (React), source files, and `.gitignore`.
3. Runs `pnpm install`, then `pnpm typecheck`, `pnpm lint`, `pnpm build`, and — for the Node and xl1-service templates — a smoke test that executes the compiled output.
4. Prints per-step status; the final line says "Scaffold complete" on success.

In `--workspace-member` mode, steps 1–2 still run (with the workspace-aware tweaks); step 3 is skipped (the root install handles all linking + verification).

If any step fails, the scaffold exits non-zero. Relay the failing output to the user verbatim before attempting a fix.

### Working with the shared package

`xl1-shared` is intentionally a thin library — its sample `src/index.ts` is just `export {}` plus a comment block. Fill it in as you discover what app and service need to agree on.

**Belongs in `shared/`:**
- API request/response types between app and service (e.g. `interface SubmitCommitRequest`, `interface GameStateResponse`)
- Zod schemas validated on both sides
- Game/business enums and constants used in both UI and backend (e.g. `enum Move { Rock, Paper, Scissors }`)
- Branded ID types (`type GameId = Brand<string, 'GameId'>`)

**Does NOT belong in `shared/`:**
- React components, hooks, browser globals → `packages/app/src/`
- Express handlers, Node-only globals (`fs`, `child_process`) → `packages/service/src/`
- `@xyo-network/xl1-react-client-sdk` — browser-only, lives in `app`
- `@xyo-network/xl1-sdk` — typically lives in `service` (or both if app needs read-only chain queries; either way, don't re-export it through shared)

**Adding cross-package imports:**

When you scaffold `app` and `service` AFTER `shared` (the recommended order), the scaffold auto-wires `"@<scope>/shared": "workspace:*"` into their `package.json` `dependencies`. No manual edit needed for the initial scaffold.

If you scaffold a workspace member out of order or add one later, edit its `package.json` manually to add:

```json
{
  "dependencies": {
    "@<scope>/shared": "workspace:*"
  }
}
```

Then `pnpm install` at the workspace root re-links. Imports work via the package's `name` field:

```ts
import type { SubmitCommitRequest, GameStateResponse } from '@<scope>/shared'
```

When you add new exports to `shared/`, run `pnpm --filter @<scope>/shared run build` (or `pnpm -r run build` from root) so consumers see the updated `dist/`.

## Hand-off behavior

After the scaffold reports success:

1. Briefly summarize what was created (template(s), target dir(s), one-line "ready to develop"). For monorepos, mention the workspace root + each sub-package and remind the user that `pnpm install` at the root links everything.
2. **Capture the indexer floor block** — see the next section. Part of dApp creation, not deferred to first deploy.
3. **Proactively continue** implementing whatever the user originally described. Do not stop and wait. For monorepos, the natural ordering is:
   1. Define shared types/schemas in `packages/shared/src/` based on what the feature needs and export them for consumers.
   2. Implement service routes/jobs in `packages/service/src/` (chain-watching, indexing, deadline handling).
   3. Implement app UI in `packages/app/src/` consuming the service routes via `fetch`.
   Consult [xl1-patterns](../xl1-patterns/SKILL.md) for the canonical recipe (commit-reveal, indexing, etc.).
4. Only pause if you need a clarifying decision that can't be inferred from the original request (e.g. "should players be able to rematch without re-committing stakes?").
5. **Before reporting the work complete, walk the full three-layer completion gate** (see [xy-development/workflow.md § Applying the Definition of Done](../xy-development/workflow.md#applying-the-definition-of-done)):
   - **Layer 1 — Generic DoD** ([xy-development/workflow.md](../xy-development/workflow.md)): builds, lints, tests, dev server, no placeholders, no regressions
   - **Layer 2 — [dApp Definition of Done](../xl1-patterns/dapp-checklist.md)**: XL1/browser-specific gates
   - **Layer 3 — `PRD.md` acceptance criteria** (in the cwd, if present): project-specific positive and negative assertions

   This is mandatory, not optional, and it is an **agent-facing completion gate** — it gates whether you stop and report done, independent of any later deploy or release. **If any item across any layer fails, keep iterating until it passes** — do not stop and report partial completion. Fix the failing item, re-walk the relevant layer, and only stop when every applicable layer is fully green. The Layer 2 checklist enumerates exactly the rules and anti-patterns the rest of the skill stack documents, and an unwalked DoD is the most common cause of completed dApps that violate them. In your completion summary, call out each relevant section across all three layers with explicit pass/fail and a one-line note on why. Sections marked "(if applicable)" can be skipped only when truly out of scope (e.g. no commit-reveal in a read-only dashboard); state that they were skipped and why. If the prompt included a seed-phrase `.env` (see "Interpreting the prompt"), the **Headless Verification** section is mandatory — you must have run the verification script and report its outcome, not just check the boxes. **The completion summary must distinguish "chain interactions verified" from "service-derived state verified" as separate facts.** If the dApp exposes derived state through a service (indexer REST API, GraphQL, etc.), the verify run must have round-tripped through that service surface — never via direct `viewer.block.payloadsByHash` synthesis — and gated on both `viewer.finalization.headNumber()` and the indexer's `lastIndexedBlock` watermark. Reporting "verified" when only the chain edge was exercised, or rationalizing an empty indexer as "Sequence is slow" without checking the watermark, is the failure mode the [service round-trip](../xl1-patterns/headless-verification.md#verifying-derived-state-through-the-service) exists to prevent.

## Capture the indexer floor block

If the dApp introduces its own payload schemas (the default — any custom dApp under a fresh `com.<your-org>.<app>.*` namespace; see [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming)), capture a **sensible floor block** as part of dApp creation and record it in `.env` as `INDEXER_FLOOR_BLOCK`. The agent does this; the user never sees the step. This is part of the dApp Definition of Done — see [dApp Checklist](../xl1-patterns/dapp-checklist.md).

The reason: the chain accepts arbitrary bytes for any schema, including before the dApp existed. An indexer that walks from block 0 will (a) waste hours on blocks that provably contain none of the dApp's data and (b) honor pre-deployment matches that cannot be the dApp's data. Capturing a floor makes correctness and performance the default. See [Chain Data Indexing — Floor Block](../xl1-patterns/chain-data-indexing-protocol.md#floor-block) for the full framing.

**Anchor the capture to development time, not first publish.** Publish steps are routinely deferred, automated, or skipped, and an "after first publish" rule frequently misses. Capturing during dApp creation is unambiguous and runs every time. Precision isn't the goal — performance optimization is. A few blocks of slack on either side don't matter.

The procedure:

1. Connect to the target chain using the gateway already wired into the scaffold.
2. Read the current finalized head: `Number(await viewer.finalization.headNumber())`.
3. Write to the dApp's `.env` (root for single-template scaffolds; the relevant sub-package's `.env` for monorepos):
   ```
   INDEXER_FLOOR_BLOCK=<n>
   VITE_INDEXER_FLOOR_BLOCK=<n>   # only if there's a Vite-built browser package
   ```
4. Reference `INDEXER_FLOOR_BLOCK` from the indexer (`process.env`) and from the browser dApp (`import.meta.env.VITE_INDEXER_FLOOR_BLOCK`) so all readers share the same floor.

`INDEXER_FLOOR_BLOCK` is **per chain**. A dApp scaffolded for mainnet, sequence, and a local devnet has three different `.env` files with three different captured values. Don't reuse a floor across environments.

For an **unbounded** dApp — one whose purpose is to index pre-existing schemas (an XL1 transfer indexer, an inscription-substrate indexer, an XRC-20 ledger for an existing token) — set `INDEXER_FLOOR_BLOCK=0` explicitly. The env var is required either way; there is no silent default. State the unbounded choice in the hand-off summary so it's auditable.

Mixed dApps (some bounded schemas, some pre-existing) still set `INDEXER_FLOOR_BLOCK` to the captured head; per-schema floors live in the indexer code per [Chain Data Indexing — Mixed indexers](../xl1-patterns/chain-data-indexing-protocol.md#mixed-indexers--the-escape-hatch). Mixing is the last resort — splitting into separate bounded and unbounded indexer processes is strictly faster.

## Flags reference

| Flag | Values | Default | Notes |
|---|---|---|---|
| `--template`, `-t` | `react`, `node`, `xl1-service`, `xl1-monorepo`, `xl1-shared` | `react` | `xl1-service` extends `node` with an Express HTTP server bound to `process.env.PORT \|\| 3000` and a `Hello world` route. `xl1-monorepo` and `xl1-shared` are used together with the other templates in the monorepo flow — see "Choosing template(s)" above. |
| `--target` | path | positional[0] or `src` | Can also pass as first positional arg |
| `--force` | — | off | Overwrite files in a non-empty target dir |
| `--no-install` | — | off | Write files only; skip `pnpm install` and verification |
| `--workspace-member` | — | off | Sub-package mode: rename to `@<scope>/<basename>`, drop `packageManager` + `.gitignore`, skip the install/verification chain. The workspace root's `pnpm install` handles all members. |
| `--workspace-scope` | string | auto-derived | Override the scope used in `--workspace-member` mode. Default: walk up to find `pnpm-workspace.yaml`, read the root `package.json` `name`, use it as the scope (`rps-game` → `@rps-game`; `@org/foo` → `@org`). |

## Troubleshooting

**Fetch errors during version resolution** (ENOTFOUND, ETIMEDOUT) — transient npm registry issues. Retry once. If persistent, check the user's network.

**pnpm `ERR_PNPM_MISSING_TIME`** — the scaffold pins pnpm to the latest 10.x via `packageManager` + corepack specifically to avoid this; it should not appear in normal runs.

**"Target dir is not empty"** — pass `--force` to overwrite in place, or pick a different target.

## When to point users elsewhere

- After the scaffold completes and the user wants to implement a feature → [xl1-patterns](../xl1-patterns/SKILL.md) (commit-reveal, indexing, prediction markets, datalake access).
- For questions about specific XL1 chain concepts (blocks, validators, fees, rewards) → [xl1-knowledge](../xl1-knowledge/SKILL.md).
- For XYO primitives (payloads, bound witnesses, modules) → [xyo-knowledge](../xyo-knowledge/SKILL.md).
- For toolchain-level questions (ESLint rules, TypeScript config, vitest setup) → [xy-toolchain](../xy-toolchain/SKILL.md).
