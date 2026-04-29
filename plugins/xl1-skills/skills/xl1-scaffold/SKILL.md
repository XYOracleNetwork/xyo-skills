---
name: xl1-scaffold
description: Bootstrap a new XL1 application — a React + Vite dApp, an xl1-service backend, a plain Node.js service/CLI, or a React + xl1-service full-stack pair. Activates when the user wants to create, start, bootstrap, initialize, or scaffold a new XL1 project. Do NOT activate for work in an existing project.
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

This skill scaffolds either a **single project** or a **full-stack pair**, based on whether the dApp needs ongoing chain tracking.

#### Single template

Use one of these when the dApp's logic only runs while a user has the page open:

| Template | When |
|---|---|
| `react` (default) | User-facing dApp that reads current chain state and submits transactions on user action. Most browser-facing apps. |
| `xl1-service` | Standalone Node + Express HTTP service backed by `@xyo-network/xl1-sdk`. Pick directly only when the user explicitly wants the backend without a UI. |
| `node` | Plain Node CLI/script — rare from this skill; usually a backend that needs HTTP routes prefers `xl1-service`. |

#### Full-stack pair (react + xl1-service)

Scaffold **both** when the dApp needs logic that runs **independently of any user's browser session**. Triggers:

- **Multi-actor coordination across time** — e.g. commit-reveal flows where reveals happen long after commits and the browser may have closed
- **Indexing or aggregating chain data** — leaderboards, history pages, search across past events
- **Time-based deadlines** — auction settlements, period closes, reveal windows that need to be detected when blocks elapse
- **Notifications or scheduled jobs** — anything triggered by block arrival rather than user click

Examples mapped to decisions:

| Prompt fragment | Decision |
|---|---|
| "two-player rock-paper-scissors with commit-reveal", "browse past games" | full-stack — service watches reveals, indexes history |
| "prediction market with settlement deadline" | full-stack — settlement runs independently |
| "wallet balance dashboard" | react only |
| "one-click contract interaction" | react only |
| "show recent transactions for an address" (read-on-view) | react only |
| "real-time leaderboard updated as blocks arrive" | full-stack |

The [xl1-patterns](../xl1-patterns/SKILL.md) skill catalogues patterns that imply a backend — commit-reveal, chain data indexing, prediction markets all do.

#### When ambiguous

Ask exactly one clarifying question before scaffolding:

> Does any logic need to run independently of a user's browser session — e.g. watching the chain for events, indexing past data, or reacting to time-based deadlines? If yes, I'll scaffold both a React dApp and an xl1-service backend; if no, just the React dApp.

Don't ask if the prompt already names a pattern from [xl1-patterns](../xl1-patterns/SKILL.md) (commit-reveal, indexing, prediction markets) — those are full-stack by definition.

### Target directory

- If the user named a directory ("put it in `./rps-game`"), use that as the **root**.
- Otherwise, default to the current working directory **if empty**, or to a subdirectory named after the app being built (e.g. `./rps-game` from "build me a rock-paper-scissors game").
- Confirm the path in a single sentence before running.

For full-stack, scaffold sibling directories under the root:

```
<root>/
├── app/         ← React dApp
└── service/     ← xl1-service backend
```

### Run the scaffold

For a **single template**:

```shell
node "${CLAUDE_SKILL_DIR}/scripts/scaffold/scaffold-xl1-dapp.js" <root> --template=<react|node|xl1-service>
```

For a **full-stack pair**, run twice:

```shell
node "${CLAUDE_SKILL_DIR}/scripts/scaffold/scaffold-xl1-dapp.js" <root>/app --template=react
node "${CLAUDE_SKILL_DIR}/scripts/scaffold/scaffold-xl1-dapp.js" <root>/service --template=xl1-service
```

Each scaffolded project is fully self-contained — its own `package.json`, `node_modules`, `pnpm-lock.yaml`. They communicate at runtime via HTTP (the service exposes routes, the app calls them); see [xl1-patterns](../xl1-patterns/SKILL.md) for the conventions.

The scaffold (per invocation):

1. Resolves the full runtime dependency graph from the npm registry (direct deps + peers).
2. Writes `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vite.config.ts` (React), source files, and `.gitignore`.
3. Runs `pnpm install`, then `pnpm typecheck`, `pnpm lint`, `pnpm build`, and — for the Node and xl1-service templates — a smoke test that executes the compiled output.
4. Prints per-step status; the final line says "Scaffold complete" on success.

If any step fails, the scaffold exits non-zero. Relay the failing output to the user verbatim before attempting a fix. For a full-stack pair, run the second scaffold only after the first succeeds.

## Hand-off behavior

After the scaffold reports success:

1. Briefly summarize what was created (template(s), target dir(s), one-line "ready to develop"). For full-stack pairs, mention both directories.
2. **Proactively continue** implementing whatever the user originally described. Do not stop and wait. For full-stack scaffolds, implement across both `app/` and `service/` — typically the service exposes the chain-watching/indexing routes first, then the app consumes them. Consult [xl1-patterns](../xl1-patterns/SKILL.md) for the canonical recipe (commit-reveal, indexing, etc.).
3. Only pause if you need a clarifying decision that can't be inferred from the original request (e.g. "should players be able to rematch without re-committing stakes?").

## Flags reference

| Flag | Values | Default | Notes |
|---|---|---|---|
| `--template`, `-t` | `react`, `node`, `xl1-service` | `react` | Also accepts `--template react` (space form). `xl1-service` extends `node` with an Express HTTP server bound to `process.env.PORT \|\| 3000` and a `Hello world` route at `/`. |
| `--target` | path | positional[0] or `src` | Can also pass as first positional arg |
| `--force` | — | off | Overwrite files in a non-empty target dir |
| `--no-install` | — | off | Write files only; skip `pnpm install` and verification |

## Troubleshooting

**Fetch errors during version resolution** (ENOTFOUND, ETIMEDOUT) — transient npm registry issues. Retry once. If persistent, check the user's network.

**pnpm `ERR_PNPM_MISSING_TIME`** — the scaffold pins pnpm to the latest 10.x via `packageManager` + corepack specifically to avoid this; it should not appear in normal runs.

**"Target dir is not empty"** — pass `--force` to overwrite in place, or pick a different target.

## When to point users elsewhere

- After the scaffold completes and the user wants to implement a feature → [xl1-patterns](../xl1-patterns/SKILL.md) (commit-reveal, indexing, prediction markets, datalake access).
- For questions about specific XL1 chain concepts (blocks, validators, fees, rewards) → [xl1-knowledge](../xl1-knowledge/SKILL.md).
- For XYO primitives (payloads, bound witnesses, modules) → [xyo-knowledge](../xyo-knowledge/SKILL.md).
- For toolchain-level questions (ESLint rules, TypeScript config, vitest setup) → [xy-toolchain](../xy-toolchain/SKILL.md).
