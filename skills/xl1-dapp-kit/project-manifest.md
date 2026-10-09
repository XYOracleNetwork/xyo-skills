# Project Manifest (`xl1.dapp.json`)

Read when authoring or validating a dapp-kit project in a consumer repo.

## What the file is

Project Manifest V1 (`network.xyo.dapp.project`; still current, and no Project Manifest V2 exists). A single `xl1.dapp.json` has exactly these top-level fields: `$schema`, `schema`, `schemaVersion`, `projectId`, `definition` (the embedded **Definition**), `artifacts` (build artifacts), and `deployments` (named **Deployment Requests**). Each request declares network, actors, supervision, port / identity / store bindings, policies, resources, and **at least one** `verification` entry carrying an `evidence` label. It carries **no target hints**. It is the repo-facing source; plans and locks are derived, not hand-edited as authority.

**Target placement lives in a different file.** Deployable things and their target bindings belong in the **Deployment Manifest**, `xl1.deploy.json` (`network.xyo.dapp.deployment`, optional, V2 current). The loader reads both files side by side; do not merge them or copy target fields into `xl1.dapp.json`. See [Vocabulary](vocabulary.md) and [Hosting](hosting.md).

## CLI (`@xyo-network/dapp-kit-cli`)

Binary: **`xl1-dapp`**

| Command | Purpose |
|---------|---------|
| `xl1-dapp init` | Add (or verify) the exact `.xl1/` rule in `.gitignore`; idempotent, creates no manifest |
| `xl1-dapp validate` | Schema / capability validation of `xl1.dapp.json` and repository identity — no build, provider acquisition or network I/O |
| `xl1-dapp inspect [--deployment <name>]` | Show resolved shape: actors, hosts, bindings, resources, verification classes, absence guarantees, unresolved inputs |
| `xl1-dapp build` | Build declared static sites through their exact package script (no shell) and admit them plus already-built host artifacts; hashes cached under `.xl1/cache/` |
| `xl1-dapp plan --deployment <name>` | Build/admit artifacts, resolve against the environment catalog, compile the neutral plan (`planId`), and write the deterministic **Lock V1** (with `lockId`) to `.xl1/locks/<name>.json`. Provisions nothing and constructs no actor — but it is **not** I/O-free |
| `xl1-dapp dev --deployment <name>` | Local owned runtime in the foreground; SIGINT/SIGTERM runs reverse teardown |
| `xl1-dapp test --deployment <name>` | Launch an isolated system, run every manifest-declared verification with its `evidence` label, always stop |

Options: `--manifest <path>` (default `xl1.dapp.json`), `--repository <path>`, `--catalog <path>` (environment-catalog override; default is the built-in local catalog), `--json` (canonical JSON output), `--retain-on-failure` (keep isolated `test` state). `plan`, `dev` and `test` require `--deployment`.

Run these inside a consumer project that declares `xl1.dapp.json`. Prefer the CLI over inventing ad-hoc Node scripts that bypass planning. Run your package manager's install first — the CLI never installs dependencies.

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
| `@xyo-network/dapp-kit-vercel` / `-cloudflare` / `-s3` / `-cloudflare-r2` | Target / object-store adapters; `-vercel` also ships the `xl1-dapp-vercel` CLI ([Hosting](hosting.md)) |
| `@xyo-network/dapp-kit-kubernetes` / `-proxmox` | **Schema-only** target-plan contracts over a Lock V3 — pure analysis, no provider I/O |
| `@xyo-network/dapp-kit-wallet` | Account-bound, **sign-only** XL1 wallet capability — no key derivation, body publishing or broadcast |
| `@xyo-network/dapp-kit-vitest-config` | Public Vitest preset + opt-in `local-xl1` chain ([testing skill](../xl1-testing/local-chain-dapp-kit-vitest.md)) |

These packages are **published on npm** (3.x line, `LGPL-3.0-only`). All public packages share one family version — install them at the same version. Prefer them over copying host/bootstrap code from the dapp-kit monorepo.

**Not on npm** (private workspace packages in the private dapp-kit repo — XYO-internal; never add them as dependencies): `@xyo-network/dapp-kit-host`, `@xyo-network/dapp-kit-conformance`, `@xyo-network/dapp-kit-test-fixtures`, `@xyo-network/dapp-kit-cloudflare-workerd`.

## Anti-patterns

- Treating the React app package as “the dApp.”
- Skipping `validate` / `plan` and hard-coding provider env as protocol identity.
- Adding target placement to `xl1.dapp.json`, or merging it with `xl1.deploy.json`.
- Treating `xl1-dapp plan` as a dry run — it builds artifacts and writes `.xl1/locks/`.
- Putting secrets into the Definition or into content-addressed plan material.
- Assuming `xl1-scaffold` output already includes a conformant manifest — wire `xl1.dapp.json` deliberately when adopting dapp-kit.
