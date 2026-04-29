---
name: xl1-scaffold
description: Bootstrap a new XL1 application — a single React dApp, a single xl1-service backend, a plain Node.js service/CLI, or a full-stack pnpm monorepo with React + xl1-service + a shared TypeScript library. Activates when the user wants to create, start, bootstrap, initialize, or scaffold a new XL1 project. Do NOT activate for work in an existing project.
---

# XL1 Scaffold

Use this skill **only** when the user is starting a **new** XL1 project. For work in an existing repo — adding features, fixing bugs, or answering questions about XL1 concepts — use the appropriate lower-layer skill instead ([xl1-knowledge](../xl1-knowledge/SKILL.md) for the chain, [xl1-patterns](../xl1-patterns/SKILL.md) for design patterns).

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

## Invocation

The scaffold runtime ships with this plugin under `scripts/scaffold/` (synced from `packages/xl1-scaffold/` at build time). Invoke it directly with Node — `${CLAUDE_SKILL_DIR}` resolves to this skill's directory at runtime.

### Choosing template(s)

This skill scaffolds either a **single project** or a **full-stack monorepo**, based on whether the dApp needs ongoing chain tracking.

#### Single template

Use one of these when the dApp's logic only runs while a user has the page open:

| Template | When |
|---|---|
| `react` (default) | User-facing dApp that reads current chain state and submits transactions on user action. Most browser-facing apps. |
| `xl1-service` | Standalone Node + Express HTTP service backed by `@xyo-network/xl1-sdk`. Pick directly only when the user explicitly wants the backend without a UI. |
| `node` | Plain Node CLI/script — rare from this skill; usually a backend that needs HTTP routes prefers `xl1-service`. |

Two more templates (`xl1-monorepo`, `xl1-shared`) only show up in the monorepo flow below — don't pick them as standalone single-templates.

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

Ask exactly one clarifying question before scaffolding:

> Does any logic need to run independently of a user's browser session — e.g. watching the chain for events, indexing past data, or reacting to time-based deadlines? If yes, I'll scaffold a monorepo with a React dApp, an xl1-service backend, and a shared TypeScript library; if no, just the React dApp.

Don't ask if the prompt already names a pattern from [xl1-patterns](../xl1-patterns/SKILL.md) (commit-reveal, indexing, prediction markets) — those are monorepo by definition.

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
- `@xyo-network/react-chain-client` — browser-only, lives in `app`
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
2. **Proactively continue** implementing whatever the user originally described. Do not stop and wait. For monorepos, the natural ordering is:
   1. Define shared types/schemas in `packages/shared/src/` based on what the feature needs and export them for consumers.
   2. Implement service routes/jobs in `packages/service/src/` (chain-watching, indexing, deadline handling).
   3. Implement app UI in `packages/app/src/` consuming the service routes via `fetch`.
   Consult [xl1-patterns](../xl1-patterns/SKILL.md) for the canonical recipe (commit-reveal, indexing, etc.).
3. Only pause if you need a clarifying decision that can't be inferred from the original request (e.g. "should players be able to rematch without re-committing stakes?").

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
