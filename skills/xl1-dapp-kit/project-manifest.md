# Project Manifest (`xl1.dapp.json`)

Read when authoring or validating a dapp-kit project in a consumer repo.

## What the file is

V1 project model: a single `xl1.dapp.json` carries the **Definition** plus named **Deployment Requests** (resources, verification evidence labels, target hints). It is the repo-facing source; plans and locks are derived, not hand-edited as authority.

## CLI (`@xyo-network/dapp-kit-cli`)

Binary: **`xl1-dapp`**

| Command | Purpose |
|---------|---------|
| `xl1-dapp validate` | Schema / capability validation |
| `xl1-dapp inspect --deployment <name>` | Show resolved shape |
| `xl1-dapp plan --deployment <name>` | Deterministic plan (`planId`) — no I/O |
| `xl1-dapp dev --deployment <name>` | Local owned runtime |
| `xl1-dapp test --deployment <name>` | Local verification surface |

Run these inside a consumer project that declares `xl1.dapp.json`. Prefer the CLI over inventing ad-hoc Node scripts that bypass planning.

## Packages (neutral vs hosts)

| Package | Role |
|---------|------|
| `@xyo-network/dapp-kit` | Neutral schemas, planning, lifecycle, effects, events, ports, projections |
| `@xyo-network/dapp-kit-cli` | `xl1-dapp` CLI |
| `@xyo-network/dapp-kit-node` | Node host, FS journals, WebSocket ports, UC references |
| `@xyo-network/dapp-kit-browser` | Read-oriented browser launches; **fail closed** on effectful profiles until browser journal exists |
| `@xyo-network/dapp-kit-local` | Local reconciler (XL1, lakes, secrets, static sites) |
| `@xyo-network/dapp-kit-port` | Port peers + WebSocket wire mapping |
| `@xyo-network/dapp-kit-events` | Event Kit admitted-wake → durable event bridge |
| `@xyo-network/dapp-kit-vercel` / `-cloudflare` / `-s3` / `-cloudflare-r2` | Target / object-store adapters |
| `@xyo-network/dapp-kit-vitest-config` | Public Vitest preset + opt-in `local-xl1` chain ([testing skill](../xl1-testing/local-chain-dapp-kit-vitest.md)) |

These packages are **published on npm** (1.x). Prefer them over copying host/bootstrap code from the dapp-kit monorepo.

## Anti-patterns

- Treating the React app package as “the dApp.”
- Skipping `validate` / `plan` and hard-coding provider env as protocol identity.
- Putting secrets into the Definition or into content-addressed plan material.
- Assuming `xl1-scaffold` output already includes a conformant manifest — wire `xl1.dapp.json` deliberately when adopting dapp-kit.
