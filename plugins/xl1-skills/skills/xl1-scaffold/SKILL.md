---
name: xl1-scaffold
description: Bootstrap a new XL1 application — either a React + Vite dApp (default) or a Node.js service/CLI. Activates when the user wants to create, start, bootstrap, initialize, or scaffold a new XL1 project. Do NOT activate for work in an existing project.
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

### Template

Default to **react** unless the user explicitly wants a Node-only service (no browser UI, no wallet connection). If unclear, prefer `react` — React dApps are the majority use case on XL1.

### Target directory

- If the user named a directory ("put it in `./rps-game`"), use that.
- Otherwise, default to the current working directory **if empty**, or to a subdirectory named after the app being built (e.g. `./rps-game` from "build me a rock-paper-scissors game").
- Confirm the path in a single sentence before running.

### Run the scaffold

```shell
node "${CLAUDE_SKILL_DIR}/scripts/scaffold/scaffold-xl1-dapp.js" <target> --template=<react|node>
```

The scaffold:

1. Resolves the full runtime dependency graph from the npm registry (direct deps + peers).
2. Writes `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vite.config.ts` (React), source files, and `.gitignore`.
3. Runs `pnpm install`, then `pnpm typecheck`, `pnpm lint`, `pnpm build`, and — for the Node template — a smoke test that executes the compiled output.
4. Prints per-step status; the final line says "Scaffold complete" on success.

If any step fails, the scaffold exits non-zero. Relay the failing output to the user verbatim before attempting a fix.

## Hand-off behavior

After the scaffold reports success:

1. Briefly summarize what was created (template, target dir, one-line "ready to develop").
2. **Proactively continue** implementing whatever the user originally described. Do not stop and wait. Example: if the original request was "build a rock-paper-scissors game with commit-reveal", start implementing the commit-reveal flow immediately, consulting [xl1-patterns](../xl1-patterns/SKILL.md) for the canonical pattern.
3. Only pause if you need a clarifying decision that can't be inferred from the original request (e.g. "should players be able to rematch without re-committing stakes?").

## Flags reference

| Flag | Values | Default | Notes |
|---|---|---|---|
| `--template`, `-t` | `react`, `node`, `express` | `react` | Also accepts `--template react` (space form). `express` extends `node` with an Express HTTP server bound to `process.env.PORT \|\| 3000` and a `Hello world` route at `/`. |
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
