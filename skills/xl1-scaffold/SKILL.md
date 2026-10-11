---
name: xl1-scaffold
description: Bootstrap a new XL1 application — a single React dApp, a single xl1-service backend, a plain Node.js service/CLI, or a full-stack pnpm monorepo with React + xl1-service + a shared TypeScript library. Activates when the user wants to create, start, bootstrap, initialize, or scaffold a new XL1 project — including when the spec is already concrete (archetype, patterns, network named) and the user wants the scaffold plan laid out before anything runs. Do NOT activate for work in an existing project.
metadata:
  version: 1.1.39 # x-release-please-version
  layer: 8
---

# XL1 Scaffold

Use this skill **only** when the user is starting a **new** XL1 project. For work in an existing repo — adding features, fixing bugs, or answering questions about XL1 concepts — use the appropriate lower-layer skill instead ([xl1-knowledge](../xl1-knowledge/SKILL.md) for the chain, [xl1-patterns](../xl1-patterns/SKILL.md) for design patterns).

**Skill identity.** This skill's version is exposed in this file's frontmatter under `metadata.version`. Whenever you present a plan, an acknowledgement, or a completion summary, state which skills informed it, formatted as `<skill-name> v<version>` — read the version from this file's frontmatter, never from an example. When multiple skills from this plugin are active, each may be listed.

## Skill layers

This is **Layer 8** of the XYO skill stack: `xy-development` (1) → `xy-toolchain` (2) → `xyo-knowledge` (3) → `xl1-knowledge` (4) → `xl1-patterns` (5) → `xl1-dapp-kit` (6) → `xl1-testing` (7) → `xl1-scaffold` (8) → `xl1-build` (9).

- **Builds on:** [xl1-testing](../xl1-testing/SKILL.md) (7) for headless verification and the dApp Definition of Done; [xl1-dapp-kit](../xl1-dapp-kit/SKILL.md) (6) for `Runtime: dapp-kit` projects; [xl1-patterns](../xl1-patterns/SKILL.md) (5) for the feature recipes that follow the scaffold; [xl1-knowledge](../xl1-knowledge/SKILL.md) (4) for gateway and chain wiring; [xyo-knowledge](../xyo-knowledge/SKILL.md) (3) for schema naming and payloads; `xy-toolchain` and `xy-development` from [ariestools-skills](https://github.com/ariestools/ariestools-skills) (1–2)
- **Hands off to:** [xl1-build](../xl1-build/SKILL.md) (9) for vague or exploratory requests

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

A request to *plan* or *lay out* the scaffold for a new project whose spec is already concrete is scaffolding work, not reference — this skill owns it. Do not hand a concrete spec to [xl1-build](../xl1-build/SKILL.md) because the user said "plan"; the wizard is for under-specified requests.

If the user wants a new project but the request is **vague or exploratory** — they haven't named the archetype, the patterns, or the multi-party shape — defer to [xl1-build](../xl1-build/SKILL.md) **first**. That skill runs a short planning wizard and hands a refined prompt back here. Concrete prompts (the archetype is named, the patterns are implied, the network is specified) skip the wizard and come straight to this skill.

## Interpreting the prompt

Before invoking the scaffold, scan the prompt and the working directory for conventions that change how you build and verify the dApp. These cues are easy to miss because they look like incidental context, but each one prescribes specific behavior.

- **`.env` file with a seed phrase already in the empty repo.** The user expects the dApp to be **headless-verifiable end-to-end** by an agent or CI, using the same identity a browser user would have on that seed. Build the dApp normally — browser wallet wiring intact, React providers, the works — but also write a Node verification script that exercises the happy path through `GatewayBuilder.buildRunner()` and run it before reporting completion. The seed phrase is for verification only; it does not change the UX surface of the dApp. **Read [Headless dApp Verification](../xl1-testing/headless-testnet-verification.md) before planning** — it documents the prompt shape, signer derivation, and anti-patterns. The DoD's Headless Verification section becomes mandatory in this case.
- **Prompt names which accounts hold funds** (e.g. "accounts 0 and 1"). Tells you how many signers to derive and how to assign roles in multi-party flows.
- **Prompt names a network** (mainnet / sequence / local). Pass it as `--network=<mainnet|sequence|local>`: it picks the `DefaultNetworks` entry (`MainNetwork` / `SequenceNetwork` / `LocalNetwork` from `@xyo-network/xl1-sdk`) the scaffold's gateway points at, and so the chain the `INDEXER_FLOOR_BLOCK` is captured on. No network named → the default, `sequence` (testnet), consistent with [xl1-testing](../xl1-testing/SKILL.md); never scaffold for mainnet unless the prompt asks for it.
- **Prompt says `Runtime: dapp-kit`** (or asks for the `@xyo-network/dapp-kit*` headless runtime or an `xl1.dapp.json` project). Use the [dapp-kit runtime](#dapp-kit-runtime) flow instead of the classic monorepo. `Runtime: classic`, or no `Runtime:` at all, keeps the classic default.

Treat any of these cues as load-bearing. Surface them in your acknowledgement before scaffolding so the user can correct any misread, and open that acknowledgement with the skill identity line (`xl1-scaffold v<version>`, plus the skills it draws on).

### PRD.md fallback (read)

If the prompt itself is missing the synthesized spec from [xl1-build](../xl1-build/SKILL.md) — for example, a fresh conversation where the wizard ran in a prior session — **check the cwd for a `PRD.md` file before asking the user to repeat themselves.** The PRD is written by `xl1-build` at the end of its Phase 4 and contains the same fields as the inline synthesized prompt (`Shape`, `Network`, `Patterns`, `Multi-party`, `History/browse`, `Runtime`, `Backend`, `Headless verification`, `Notes`) under structured markdown headings, plus an `## Acceptance criteria` section that carries Gate 3 of the completion gate. Read it the same way you would read the inline prompt; an older PRD without a `Runtime` field is classic.

If both the chat prompt and `PRD.md` are absent, fall back to asking the user — or, if the request is exploratory enough, defer to [xl1-build](../xl1-build/SKILL.md) to generate a PRD first.

### Writing PRD.md from an inline prompt (advanced-user path)

When the user gives a concrete spec inline (skipping the wizard) and **no `PRD.md` exists at the cwd**, write one before scaffolding. This closes the gap so every project has a Gate 3 completion gate regardless of how it was kicked off.

The shape mirrors what [xl1-build](../xl1-build/SKILL.md) Phase 4 produces — same sections, same headings, same absolute links. The data sources differ:

- **Build target fields** (Shape, Network, Patterns, Multi-party, History/browse, Runtime, Backend, Headless verification) are derived from the inline prompt the same way you derive scaffold inputs.
- **Acceptance criteria** are **generated by you** following [xy-development/workflow.md § Writing Project-Specific Acceptance Criteria](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-development/workflow.md#writing-project-specific-acceptance-criteria): 5–10 observable bullets, split into positive and negative assertions, drawn from the inline prompt + the loaded domain skills (`xl1-patterns/*` for the matched patterns, `xl1-testing/dapp-checklist.md` for anti-patterns to convert into negative criteria).
- **Architecture review** (multi-party dApps) answers the [review questions](../xl1-patterns/architecture-principles.md#review-questions), as in the wizard's PRD.
- **Skills referenced** is the list of xyo-skills plugin skills that informed this plan (typically xl1-scaffold + the relevant pattern docs).
- **Plugin version** uses `xl1-scaffold`'s `metadata.version` from this file's frontmatter (since the wizard didn't run, attribute to the scaffold).
- **Notes** captures any free-form constraint from the prompt that doesn't fit a slot.

Write the file at the cwd as `PRD.md`. If the user's prompt is too vague to derive acceptance criteria — for example, they said "build me something on XL1" — **do not guess**; defer to [xl1-build](../xl1-build/SKILL.md) to run the wizard properly. Generating weak criteria from a vague prompt is worse than no criteria at all because it makes the loop appear to terminate when the spec was never concrete.

Surface the written PRD in your acknowledgement so the user can correct any misread before scaffolding starts:

> Wrote `PRD.md` capturing the spec and acceptance criteria. Review it briefly — anything off, tell me before I scaffold.

## Invocation

The scaffold runtime ships with this plugin under `scripts/scaffold/` (synced from `packages/xl1-scaffold/` at build time). Invoke it directly with Node — `${CLAUDE_SKILL_DIR}` resolves to this skill's directory at runtime.

### Prerequisites

- **Node.js 26+.** `@xyo-network/sdk` declares `engines.node: ^26` (`@xyo-network/xl1-sdk` `>=26`), and every generated `package.json` declares `engines.node: ">=26"`. Check `node --version` first; on an older Node, stop and tell the user to upgrade rather than scaffolding.
- **pnpm 12.** Generated projects pin `packageManager: pnpm@<newest 12.x at least a day old>`. Node 25+ no longer bundles corepack, so a stock Node 26 has only `node`, `npm` and `npx`. The scaffold runs `pnpm` from `PATH` (pnpm switches itself to the pinned version), falling back to `corepack pnpm@<pinned>`, and probes each with `--version` first. If neither can run pnpm 12 it writes the files, then exits 1 with install guidance (`npm i -g pnpm@12`, or `npm i -g corepack && corepack enable pnpm`) and the commands to finish. An older pnpm on `PATH` may fail to switch (pnpm 10 on macOS cannot start the pnpm 12 it downloads) — upgrading it to 12 fixes that.

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

**Default to the monorepo flow** (`xl1-monorepo` + `xl1-shared` + `react` + `xl1-service`), unless the prompt says `Runtime: dapp-kit` ([dapp-kit runtime](#dapp-kit-runtime)). Drop to a single template only when the prompt is *clearly* read-only / browser-only (e.g. "wallet balance dashboard", "show recent transactions"). When in doubt, scaffold the monorepo — it's strictly a superset; an unused `service` is cheap to delete later, but retrofitting a service into a single-template scaffold is annoying.

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

#### dapp-kit runtime

Use this flow only when the prompt or `PRD.md` says `Runtime: dapp-kit`. **There is no dapp-kit template** (and no public one to copy): scaffold the shell, then wire dapp-kit by hand following [xl1-dapp-kit](../xl1-dapp-kit/SKILL.md).

1. Run the monorepo flow below for the root, `xl1-shared` and `react` — **skip `xl1-service`** and its smoke test. The headless runtime is the backend; the React app is one of its clients and talks to it through [application ports](../xl1-dapp-kit/application-ports.md), not an `/api/*` REST layer.
2. Hand-create a workspace package for the engine (e.g. `packages/runtime`). Install `@xyo-network/dapp-kit` and the host packages it needs there, and `@xyo-network/dapp-kit-cli` at the root (`pnpm add -Dw`) — one 3.x family version for all ([packages](../xl1-dapp-kit/project-manifest.md#packages-neutral-vs-hosts)).
3. Write `xl1.dapp.json` at the root by hand per [Project manifest](../xl1-dapp-kit/project-manifest.md), with at least one `verification` entry per deployment. Add `xl1.deploy.json` only when deployable things are placed on targets ([Hosting](../xl1-dapp-kit/hosting.md)).
4. From the root: `pnpm exec xl1-dapp init` (adds the `.xl1/` rule to `.gitignore` — it creates no manifest), `pnpm exec xl1-dapp validate`, `pnpm exec xl1-dapp plan --deployment <name>`.
5. Verify with `pnpm exec xl1-dapp test --deployment <name>` and the `@xyo-network/dapp-kit-vitest-config` preset — see [dApp Kit Vitest](../xl1-testing/local-chain-dapp-kit-vitest.md) and [local dapp-kit stack](../xl1-testing/local-dapp-stack.md#dapp-kit).

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
node "${CLAUDE_SKILL_DIR}/scripts/scaffold/scaffold-xl1-dapp.js" <root> --template=<react|node|xl1-service> --network=<mainnet|sequence|local>
```

For a **monorepo**, four scaffold invocations + a single root install:

```shell
SKILL="${CLAUDE_SKILL_DIR}/scripts/scaffold/scaffold-xl1-dapp.js"

# 1. Workspace root (no install — verification skipped, root has no installable code yet).
#    The root's package.json `name` field is the dir's basename (e.g. `rps-game`); sub-
#    package scopes auto-derive from this (sub-packages become `@rps-game/<basename>`).
#    --network is recorded in the root package.json as `xl1.network`.
node "$SKILL" <root> --template=xl1-monorepo --network=<mainnet|sequence|local> --no-install

# 2. Sub-packages — each runs in workspace-member mode (skips its own install + verification;
#    drops its own packageManager + .gitignore; package name becomes @<scope>/<basename>).
#    Members inherit the root's `xl1.network`, so app and service talk to the same chain;
#    passing the same --network to a member is harmless (a different one prints a warning).
#    Order matters: scaffold shared FIRST. When app and service are scaffolded after,
#    they auto-detect the sibling shared package and wire a "@<scope>/shared": "workspace:*"
#    dep into their package.json automatically.
node "$SKILL" <root>/packages/shared  --template=xl1-shared   --workspace-member
node "$SKILL" <root>/packages/app     --template=react        --workspace-member
node "$SKILL" <root>/packages/service --template=xl1-service  --workspace-member

# 3. Single install at the workspace root — links all members + installs deps for all.
cd <root> && pnpm install

# 4. Verify across the workspace. Build shared FIRST: app and service resolve
#    `@<scope>/shared` through its package.json `exports` to the emitted dist/*.d.ts
#    + dist/*.js, so their typecheck and lint fail until shared has been built.
#    (The root's `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm dev` scripts
#    run `pnpm build:shared` first for you.)
pnpm --filter @<scope>/shared run build && pnpm -r run typecheck && pnpm -r run lint && pnpm -r run build && pnpm -r run test
# For xl1-service specifically, also smoke-test the server boot:
pnpm --filter @<scope>/service run smoke
```

The scaffold (per single-template invocation, when NOT in workspace-member mode):

1. Resolves the full runtime dependency graph from the npm registry (direct deps + peers). Each dependency gets the newest release that pnpm's one-day `minimumReleaseAge` will accept — so a dependency published in the last 24 hours is held back to its previous release — except `@xyo-network/*` and `@ariestools/*`, which get `latest`.
2. Writes `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vite.config.ts` (React), source files, `.gitignore`, and `pnpm-workspace.yaml` — the file pnpm 12 reads its settings from: `allowBuilds` for the dependency build scripts pnpm must run, and `minimumReleaseAge: 1440` with our scopes in `minimumReleaseAgeExclude`. A standalone project gets one too (no `packages:` key), which also makes it its own workspace root. Workspace members get none.
3. Runs `pnpm install`, then `pnpm typecheck`, `pnpm lint`, `pnpm build`, and — for the Node and xl1-service templates — a smoke test that executes the compiled output.
4. Prints per-step status; the final line says "Scaffold complete" on success.

In `--workspace-member` mode, steps 1–2 still run (with the workspace-aware tweaks); step 3 is skipped (the root install handles all linking + verification).

Generated `test` scripts run `vitest run --passWithNoTests`, so `pnpm test` passes on a project with no specs yet; it is not a substitute for writing them. The monorepo root has no `test:watch` — watch one package with `pnpm --filter ./packages/<pkg> run test:watch`.

The `react` template's `App.tsx` ships the XL1 provider stack already wired: `InPageGatewaysProvider transport="rest"` wrapping `GatewayProvider`, so the app reads chain data for anonymous visitors and gates only writes on the wallet. **Keep `transport="rest"`** — the prop defaults to `'rpc'`, and REST reads come from the network's cacheable static bucket layout rather than one live gateway call per read. See [Browser Gateway — REST over RPC](../xl1-knowledge/gateway-browser.md#rest-over-rpc). Non-React browser targets (workers, service workers, extensions) integrate through `@xyo-network/xl1-browser-system` instead.

If any step fails, the scaffold exits non-zero. Relay the failing output to the user verbatim before attempting a fix.

### Working with the shared package

`xl1-shared` is intentionally a thin library — its sample `src/index.ts` is just `export {}` plus a comment block. Fill it in as you discover what app and service need to agree on.

**Belongs in `shared/`:**
- API request/response types between app and service (e.g. `interface SubmitCommitRequest`, `interface GameStateResponse`)
- Zod schemas validated on both sides — named under `com.<your-org>.<app>.*` with **lowercase `[a-z0-9]` dot-segments only**. The workspace scope (`@rps-game/...`) and the directory name (`rps-game`) are package identifiers, not schema segments: a hyphen is legal in a package name and illegal in a schema name, so `@rps-game/shared` holds `com.acme.rpsgame.move`, never `com.rps-game.move`. When the user has not named an org, write the placeholder `com.<org>.<app>.*` rather than inventing a segment. See [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming)
- Game/business constants used in both UI and backend, as an `as const` object plus a derived union type — **never a TS `enum`**: `@ariestools/tsconfig` sets `erasableSyntaxOnly` (an enum fails typecheck with TS1294) and the ESLint config flags enums via `no-restricted-syntax`:
  ```ts
  export const Move = {
    Rock: 'rock',
    Paper: 'paper',
    Scissors: 'scissors',
  } as const
  export type Move = typeof Move[keyof typeof Move] // 'rock' | 'paper' | 'scissors'
  ```
- Branded ID types (`type GameId = Brand<string, { __gameId: true }>` with `Brand` from `@ariestools/sdk` — add it to shared's dependencies; `Brand<string, 'GameId'>` adds no brand, because `Brand` maps the keys of its second argument)

**Does NOT belong in `shared/`:**
- React components, hooks, browser globals → `packages/app/src/`
- Express handlers, Node-only globals (`fs`, `child_process`) → `packages/service/src/`
- `@xyo-network/xl1-react-client-sdk` — browser-only, lives in `app`
- `@xyo-network/xl1-browser-system` — browser-only; only needed when a non-React realm (worker, service worker, extension) integrates XL1 directly. The React app reaches it through `xl1-react-client-sdk`
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

The import resolves through shared's `package.json` `exports` map (`types` → `./dist/index.d.ts`, `default` → `./dist/index.js`), i.e. the **compiled** output — not `src/`. So shared must be built before app/service typecheck, lint, test or run, and rebuilt whenever you add or change its exports: run `pnpm build:shared` (or `pnpm --filter @<scope>/shared run build`, or `pnpm -r run build`, which builds shared first) from the root so consumers see the updated `dist/`.

## Hand-off behavior

**Execution guard.** Everything below assumes you can run commands and write files. If the session lacks a shell or file-write tool, do not search for one, delegate the work to subagents, or loop — lay out the exact scaffold commands, the implementation plan, and the completion gate you would walk, then stop and hand back to the user. Open that plan with its skill identity line — `xl1-scaffold v<version>` plus the other skills it draws on (e.g. `xl1-patterns`, `xl1-testing`) — exactly as a completion summary would. A plan delivered is complete for that session; a tool hunt is not progress.

After the scaffold reports success:

1. Briefly summarize what was created (template(s), target dir(s), one-line "ready to develop"). For monorepos, mention the workspace root + each sub-package and remind the user that `pnpm install` at the root links everything.
2. **Capture the indexer floor block** — see the next section. Part of dApp creation, not deferred to first deploy.
3. **Proactively continue** implementing whatever the user originally described. Do not stop and wait. For monorepos, the natural ordering is:
   1. Define shared types/schemas in `packages/shared/src/` based on what the feature needs and export them for consumers.
   2. Implement service routes/jobs in `packages/service/src/` (chain-watching, indexing, deadline handling).
   3. Implement app UI in `packages/app/src/` consuming the service routes via `fetch`.
   With `Runtime: dapp-kit`, step 2 is the engine in the runtime package (effects, ports — per [xl1-dapp-kit](../xl1-dapp-kit/SKILL.md)) and step 3 consumes its application ports. Consult [xl1-patterns](../xl1-patterns/SKILL.md) for the canonical recipe (commit-reveal, indexing, etc.); for a multi-party dApp, also answer any `TBD` in the PRD's Architecture review ([review questions](../xl1-patterns/architecture-principles.md#review-questions)).
4. Only pause if you need a clarifying decision that can't be inferred from the original request (e.g. "should players be able to rematch without re-committing stakes?").
5. **Before reporting the work complete, walk all three completion gates** (see [xy-development/workflow.md § Applying the Definition of Done](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-development/workflow.md#applying-the-definition-of-done), which numbers them Layer 1–3):
   - **Gate 1 — Generic DoD** ([xy-development/workflow.md § Definition of Done](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-development/workflow.md#definition-of-done)): builds, lints, tests, dependencies correct (`pnpm xy deplint`), dev server runs with a clean console, no placeholders, no regressions
   - **Gate 2 — [dApp Definition of Done](../xl1-testing/dapp-checklist.md)**: XL1/browser-specific checks; with `Runtime: dapp-kit`, also [dapp-kit conformance](../xl1-dapp-kit/conformance.md#minimum-agent-completion-expectations), including the evidence label you actually produced
   - **Gate 3 — `PRD.md` acceptance criteria** (in the cwd, if present): project-specific positive and negative assertions

   This is mandatory, not optional, and it is an **agent-facing completion gate** — it gates whether you stop and report done, independent of any later deploy or release. **If any item across any gate fails, keep iterating until it passes** — do not stop and report partial completion. Fix the failing item, re-walk the relevant gate, and only stop when every applicable gate is fully green. The Gate 2 checklist enumerates exactly the rules and anti-patterns the rest of the skill stack documents, and an unwalked DoD is the most common cause of completed dApps that violate them. In your completion summary, call out each relevant section across all three gates with explicit pass/fail and a one-line note on why. Sections marked "(if applicable)" can be skipped only when truly out of scope (e.g. no commit-reveal in a read-only dashboard); state that they were skipped and why. If the prompt included a seed-phrase `.env` (see "Interpreting the prompt"), the **Headless Verification** section is mandatory — you must have run the verification script and report its outcome, not just check the boxes. **The completion summary must distinguish "chain interactions verified" from "service-derived state verified" as separate facts.** If the dApp exposes derived state through a service (indexer REST API, GraphQL, etc.), the verify run must have round-tripped through that service surface — never via direct hash-lookup synthesis (datalake `get(hashes)`, `viewer.block.payloadsByHash`) — and gated on both `viewer.finalization.headNumber()` and the indexer's `lastIndexedBlock` watermark. Reporting "verified" when only the chain edge was exercised, or rationalizing an empty indexer as "Sequence is slow" without checking the watermark, is the failure mode the [service round-trip](../xl1-testing/headless-testnet-verification.md#verifying-derived-state-through-the-service) exists to prevent.

## Capture the indexer floor block

If the dApp introduces its own payload schemas (the default — any custom dApp under a fresh `com.<your-org>.<app>.*` namespace; see [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming)), capture a **sensible floor block** as part of dApp creation and record it in `.env` as `INDEXER_FLOOR_BLOCK`. The agent does this; the user never sees the step. This is part of the dApp Definition of Done — see [dApp Checklist](../xl1-testing/dapp-checklist.md).

The reason: the chain accepts arbitrary bytes for any schema, including before the dApp existed. An indexer that walks from block 0 will (a) waste hours on blocks that provably contain none of the dApp's data and (b) honor pre-deployment matches that cannot be the dApp's data. Capturing a floor makes correctness and performance the default. See [Chain Data Indexing — Floor Block](../xl1-patterns/chain-data-indexing-protocol.md#floor-block) for the full framing.

**Anchor the capture to development time, not first publish.** Publish steps are routinely deferred, automated, or skipped, and an "after first publish" rule frequently misses. Capturing during dApp creation is unambiguous and runs every time. Precision isn't the goal — performance optimization is. A few blocks of slack on either side don't matter.

The procedure:

1. Connect to the chain the scaffold was generated for — the `--network` value, recorded as `xl1.network` in the (root) `package.json` and wired as the `NETWORK` constant in `src/App.tsx` / `src/index.ts`. Use that same network's gateway; a floor read from another chain is meaningless here.
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
| `--template`, `-t` | `react`, `node`, `xl1-service`, `xl1-monorepo`, `xl1-shared` | `react` | `xl1-service` extends `node` with an Express HTTP server bound to `process.env.PORT \|\| 3001` (matching the app-on-3000 / service-on-3001 wiring convention) and a `Hello world` route. `xl1-monorepo` and `xl1-shared` are used together with the other templates in the monorepo flow — see "Choosing template(s)" above. |
| `--target` | path | positional[0] or `src` | Can also pass as first positional arg |
| `--network` | `mainnet`, `sequence`, `local` | `sequence` (a workspace member: the root's `xl1.network`) | XL1 network the generated gateway points at: `MainNetwork` / `SequenceNetwork` / `LocalNetwork` from `@xyo-network/xl1-sdk`, substituted into `App.tsx`, the node/xl1-service entry and each `.env.example`. Recorded as `xl1.network` in a standalone or root `package.json`. Set it from the prompt's named network; testnet by default. |
| `--force` | — | off | Overwrite files in a non-empty target dir |
| `--no-install` | — | off | Write files only; skip `pnpm install` and verification |
| `--workspace-member` | — | off | Sub-package mode: rename to `@<scope>/<basename>`, drop `packageManager` + `.gitignore`, write no `pnpm-workspace.yaml`, inherit the root's `xl1.network`, skip the install/verification chain. The workspace root's `pnpm install` handles all members. |
| `--workspace-scope` | string | auto-derived | Override the scope used in `--workspace-member` mode. Default: walk up to find `pnpm-workspace.yaml`, read the root `package.json` `name`, use it as the scope (`rps-game` → `@rps-game`; `@org/foo` → `@org`). |

## Troubleshooting

**Fetch errors during version resolution** (ENOTFOUND, ETIMEDOUT) — transient npm registry issues. Retry once. If persistent, check the user's network.

**"no usable pnpm was found"** — neither `pnpm` nor `corepack` on `PATH` could run pnpm 12 (stock Node 25+ ships neither). Install pnpm as the message says (`npm i -g pnpm@12`), then run the printed "Next:" commands; the project files are already written.

**`ERR_PNPM_NO_MATURE_MATCHING_VERSION`** — a dependency added after scaffolding resolves only to a release under a day old, and the generated `pnpm-workspace.yaml` sets `minimumReleaseAge` explicitly (strict). Wait a day, pin an older version, or add `name@version` to `minimumReleaseAgeExclude`. The scaffold's own picks never trigger it.

**`ERR_PNPM_IGNORED_BUILDS`** — a dependency added later has a build script pnpm 12 has not been told about. Add it under `allowBuilds` in `pnpm-workspace.yaml` (`true` to run it, `false` to skip it).

**"Target dir is not empty"** — pass `--force` to overwrite in place, or pick a different target.

## When to point users elsewhere

- After the scaffold completes and the user wants to implement a feature → [xl1-patterns](../xl1-patterns/SKILL.md) (commit-reveal, indexing, prediction markets, datalake access).
- For questions about specific XL1 chain concepts (blocks, validators, fees, rewards) → [xl1-knowledge](../xl1-knowledge/SKILL.md).
- For XYO primitives (payloads, bound witnesses, modules) → [xyo-knowledge](../xyo-knowledge/SKILL.md).
- Adopting or migrating to the dapp-kit headless runtime (`xl1.dapp.json`, ports, effect journals, hosts) → [xl1-dapp-kit](../xl1-dapp-kit/SKILL.md).
- For toolchain-level questions (ESLint rules, TypeScript config, vitest setup) → [xy-toolchain](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-toolchain/SKILL.md).
