---
name: xl1-dapp-kit
description: >-
  Portable headless XL1 dApp architecture via @xyo-network/dapp-kit*. Covers
  definition/config/plan/incarnation, xl1.dapp.json vs xl1.deploy.json,
  application ports, effect journals and crash recovery, durable events vs
  Event Kit wakes, Node/browser hosts, sign-only wallet capability,
  Vercel/Cloudflare target composition (Kubernetes/Proxmox target plans are
  schema-only), and conformance evidence. Applies the multi-party dApp
  architecture principles owned by xl1-patterns (engine vs clients,
  evidence-derived state, constant-cost verifiable indexes) as a headless
  runtime. Activates when designing or reviewing a dapp-kit app's
  architecture, building or migrating toward dapp-kit, writing xl1.dapp.json,
  hosting a headless runtime, or distinguishing UI clients from the protocol
  application. Builds on xl1-patterns domain recipes and complements
  xl1-scaffold React+service apps — does not replace gateway/chain knowledge.
metadata:
  version: 1.1.39 # x-release-please-version
  layer: 6
---

# XL1 dApp Kit

An XL1 dApp is a **portable, headless protocol runtime**. UI, CLI, and HTTP surfaces are **clients**. Indexes and projections are **rebuildable**. Finalized XL1 is the canonical ordering substrate; side channels may accelerate liveness but must not secretly govern recovery.

This skill teaches the `@xyo-network/dapp-kit*` application-contract layer. It sits directly **above** [xl1-patterns](../xl1-patterns/SKILL.md), whose domain recipes and [architecture principles](../xl1-patterns/architecture-principles.md) still apply, and builds on [xl1-knowledge](../xl1-knowledge/SKILL.md) for the chain itself. Classic [xl1-scaffold](../xl1-scaffold/SKILL.md) React+Express apps remain valid; migrate to dapp-kit when you need definition/plan/ports/recovery/conformance — not merely a Vite UI.

**Maturity:** `@xyo-network/dapp-kit*` is **published on npm** (3.x line, public access, `LGPL-3.0-only`; versions before 2.1.1 were published `UNLICENSED`). Local UC-01..03 and adapters exist; **credentialed hosted / Sequence / production evidence gates can still be open** per consumer — check the deployment's evidence labels. Prefer local conformance via [`@xyo-network/dapp-kit-vitest-config`](../xl1-testing/local-chain-dapp-kit-vitest.md) and the [local dapp-kit stack](../xl1-testing/local-dapp-stack.md#dapp-kit); do not claim hosted qualification from local tests.

**Private upstream.** The dapp-kit source repo is private. Its status file (`docs/STATE.md`), `DAPP_KIT_CONTRACT.md`, `PROGRAM_RULES.md`, the White and Yellow Papers, the `conformance/` vectors, and the private workspace packages are **XYO-internal**. Outside XYO, the reference is each published package's README on npm.

**Skill identity.** Report as `xl1-dapp-kit v<version>` (from this file's `metadata.version`) in every plan, acknowledgement, and completion summary.

## Skill layers

This is **Layer 6** of the XYO skill stack: `xy-development` (1) → `xy-toolchain` (2) → `xyo-knowledge` (3) → `xl1-knowledge` (4) → `xl1-patterns` (5) → `xl1-dapp-kit` (6) → `xl1-testing` (7) → `xl1-scaffold` (8) → `xl1-build` (9).

- **Builds on:** [xl1-patterns](../xl1-patterns/SKILL.md) (5) — architecture principles, indexing, statement graph, wakes; [xl1-knowledge](../xl1-knowledge/SKILL.md) (4) — chain, gateway, datalakes, identity; [xyo-knowledge](../xyo-knowledge/SKILL.md) (3) — payloads, bound witnesses, schemas; `xy-toolchain` and `xy-development` from [ariestools-skills](https://github.com/ariestools/ariestools-skills) (1–2) — build tooling and coding conventions
- **Hands off to:** [xl1-testing](../xl1-testing/SKILL.md) (7) — to verify a dapp-kit app (dapp-kit vitest `local-xl1`, the local dapp-kit stack, Sequence) and to walk the dApp Definition of Done before reporting it complete; [xl1-scaffold](../xl1-scaffold/SKILL.md) (8) — when starting a new project as a classic React+service app instead

## Table of Contents

### [Architecture principles](../xl1-patterns/architecture-principles.md) (in xl1-patterns — lower layer, read first)
**Read first when designing or reviewing a dapp-kit app whose state matters to more than one party.** The principles live in xl1-patterns because they hold with or without dapp-kit; this skill is the supported way to build the engine they describe as a headless runtime. When assigning worker roles or designing wake handling, effect admission, recovery or coordination, also consult the cross-cutting [ariestools-architecture](https://github.com/ariestools/ariestools-skills/blob/main/skills/ariestools-architecture/SKILL.md) skill from an adopted revision that contains it, then apply [Worker authority and coordination](../xl1-patterns/architecture-principles.md#worker-authority-and-coordination). Local host lifecycle supervision remains compatible; the skill does not expand a journal's supported ownership model or grant additional signing authority.

### [Vocabulary](vocabulary.md)
Definition, configuration, plan, incarnation, host, engine and systems, the two manifests, lock versions, status dimensions, durability classes — the words agents must not collapse.

### [Project manifest](project-manifest.md)
`xl1.dapp.json` (and how it differs from `xl1.deploy.json`), deployment requests, locks, the package map, and the `xl1-dapp` CLI (`init` / `validate` / `inspect` / `build` / `plan` / `dev` / `test`).

### [Effects and recovery](effects-and-recovery.md)
Staged XL1 effects and their exact stage names, effect journals, prepared sidecars, the neutral plan/reconcile/recover helpers, and SIGKILL-safe recovery.

### [Application ports](application-ports.md)
Typed command/query/status/admin frames over WebSocket / MessagePort, the frame kinds, consistency evidence, and the fixed `/_xl1/*` paths — not “REST as the protocol.”

### [Events and wakes](events-and-wakes.md)
Event Kit wakes vs dapp-kit durable events vs subscription cursors. Detail for JWT/grants: [Authenticated Wake Delivery](../xl1-patterns/authenticated-wake-delivery.md).

### [Hosting and targets](hosting.md)
Node vs browser hosts, deployable things, Vercel/Cloudflare composition and the `xl1-dapp-vercel` CLI, schema-only Kubernetes/Proxmox target plans, fail-closed policies.

### [Conformance](conformance.md)
The L1–L9 evidence ladder and the runner's `evidence` labels, what “done” means for a dapp-kit app, and what local tests do **not** prove.
