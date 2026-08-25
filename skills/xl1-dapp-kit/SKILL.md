---
name: xl1-dapp-kit
description: >-
  Portable headless XL1 dApp architecture via @xyo-network/dapp-kit*. Covers
  definition/config/plan/incarnation, xl1.dapp.json, application ports, effect
  journals and crash recovery, durable events vs Event Kit wakes, Node/browser
  hosts, Vercel/Cloudflare target composition, and conformance evidence.
  Activates when building or migrating an XL1 dApp toward dapp-kit, writing
  xl1.dapp.json, hosting a headless runtime, or distinguishing UI clients from
  the protocol application. Complements xl1-patterns domain recipes and
  xl1-scaffold React+service apps — does not replace gateway/chain knowledge.
metadata:
  version: 1.1.31 # x-release-please-version
---

# XL1 dApp Kit

An XL1 dApp is a **portable, headless protocol runtime**. UI, CLI, and HTTP surfaces are **clients**. Indexes and projections are **rebuildable**. Finalized XL1 is the canonical ordering substrate; side channels may accelerate liveness but must not secretly govern recovery.

This skill teaches the `@xyo-network/dapp-kit*` application-contract layer. It sits **above** [xl1-knowledge](../xl1-knowledge/SKILL.md) and **alongside** [xl1-patterns](../xl1-patterns/SKILL.md) (domain recipes still apply). Classic [xl1-scaffold](../xl1-scaffold/SKILL.md) React+Express apps remain valid; migrate to dapp-kit when you need definition/plan/ports/recovery/conformance — not merely a Vite UI.

**Skill identity.** Report as `xl1-dapp-kit v<version>` from this file's `metadata.version`.

**Maturity:** `@xyo-network/dapp-kit*` is **published on npm** (1.x line, public access; license may still be `UNLICENSED`). Local UC-01..03 and adapters exist; **credentialed hosted / Sequence / production evidence gates can still be open** per consumer — check the deployment's evidence labels. Prefer local conformance via [`@xyo-network/dapp-kit-vitest-config`](../xl1-testing/local-chain-dapp-kit-vitest.md); do not claim hosted qualification from local tests.

## Lower layers

- **[XL1 Knowledge](../xl1-knowledge/SKILL.md)** — chain, gateway, datalakes, identity
- **[XL1 Patterns](../xl1-patterns/SKILL.md)** — indexing, statement graph, wakes, DoD checklist
- **[XL1 Testing](../xl1-testing/SKILL.md)** — headless verification, including [dapp-kit vitest `local-xl1`](../xl1-testing/local-chain-dapp-kit-vitest.md) and [local dapp-kit stack](../xl1-testing/local-dapp-stack.md#dapp-kit)
- **[xy-toolchain](../xy-toolchain/SKILL.md)** / **[xy-development](../xy-development/SKILL.md)** — from **ariestools-skills** (redirect stubs may appear in this pack)

## Table of Contents

### [Vocabulary](vocabulary.md)
Definition, configuration, plan, incarnation, host, status dimensions, durability classes — the words agents must not collapse.

### [Project manifest](project-manifest.md)
`xl1.dapp.json`, deployment requests, locks, and the `xl1-dapp` CLI (`validate` / `inspect` / `plan` / `dev` / `test`).

### [Effects and recovery](effects-and-recovery.md)
Staged XL1 effects, effect journals, prepared sidecars, and SIGKILL-safe recovery.

### [Application ports](application-ports.md)
Typed command/query/status/admin frames over WebSocket / MessagePort — not “REST as the protocol.”

### [Events and wakes](events-and-wakes.md)
Event Kit wakes vs dapp-kit durable events vs subscription cursors. Detail for JWT/grants: [Authenticated Wake Delivery](../xl1-patterns/authenticated-wake-delivery.md).

### [Hosting and targets](hosting.md)
Node vs browser hosts, deployable things, Vercel/Cloudflare composition, fail-closed policies.

### [Conformance](conformance.md)
Evidence labels, what “done” means for a dapp-kit app, and what local tests do **not** prove.
