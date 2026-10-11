---
name: xyo-knowledge
description: XYO Protocol 2.0 domain knowledge. Covers payloads, bound witnesses, schemas, the module system (archivist, diviner, witness, sentinel, node), accounts, wallets, and protocol best practices. Activates when building on XYO or working with @xyo-network packages.
metadata:
  version: 1.1.39 # x-release-please-version
  layer: 3
---

# XYO Protocol Knowledge

This skill covers the XYO Protocol 2.0 — the data model, module system, identity primitives, and conventions for building on XYO. The primary SDK is the `@xyo-network/sdk` root barrel: the module system (archivists, diviners, witnesses, sentinels, nodes) layered over `@xyo-network/sdk-protocol` (payloads, bound witnesses, accounts), which the barrel re-exports. Concrete backends (e.g. `@xyo-network/archivist-indexeddb`, `@xyo-network/archivist-mongodb`) and specialized diviners/witnesses remain individual `@xyo-network/*` packages.

When you need to look up exact type definitions or API details beyond what this skill covers, install the relevant package and read its TypeScript declarations under `dist/neutral/` — `index.d.ts` for a standalone package; `dist/neutral/modules/<name>/` inside `@xyo-network/sdk` (modules) and `@xyo-network/sdk-protocol-core` (protocol primitives).

**Skill identity.** This skill's version is exposed in this file's frontmatter under `metadata.version`. Whenever you present a plan, an acknowledgement, or a completion summary, state which skills informed it, formatted as `<skill-name> v<version>` — read the version from this file's frontmatter, never from an example. When multiple skills from this plugin are active, each may be listed.

## Skill layers

This is **Layer 3** of the XYO skill stack: `xy-development` (1) → `xy-toolchain` (2) → `xyo-knowledge` (3) → `xl1-knowledge` (4) → `xl1-patterns` (5) → `xl1-dapp-kit` (6) → `xl1-testing` (7) → `xl1-scaffold` (8) → `xl1-build` (9).

- **Builds on:** `xy-toolchain` and `xy-development` from [ariestools-skills](https://github.com/ariestools/ariestools-skills) (1–2) — build/lint/test tooling; coding principles, Git, testing, workflow
- **Hands off to:** [xl1-knowledge](../xl1-knowledge/SKILL.md) (4) — when the work runs on the XL1 chain (blocks, transactions, gateway, datalakes); [xl1-patterns](../xl1-patterns/SKILL.md) (5) — when building application features on XL1; [xl1-build](../xl1-build/SKILL.md) (9) — when the user wants to build something on XL1 but has not specified what

## Table of Contents

### [Protocol Primitives](primitives.md)
Read when working with XYO data structures — payloads, schemas, bound witnesses, payload builders, or hashing. Covers the core data model, how to construct and validate protocol objects, and the mandatory Zod authoring pattern for a new payload type.

### [Payload Schema Evolution and Identity](payload-schema-evolution.md)
Read before naming or revising schemas, choosing open/closed fields, using `$version`, selecting root versus data hashes, or validating/caching payloads. New schema names stay unversioned; root hashes are the application default. Preserve explicitly prescribed legacy protocol contracts.

### [Module System](modules.md)
Read when working with XYO modules — archivists, diviners, witnesses, sentinels, or nodes (bridges are deprecated). Covers the module abstraction, composition patterns, resolution, and the manifest system.

### [Identity & Signing](identity.md)
Read when working with accounts, wallets, key management, signing, or HD derivation. Covers Account and Wallet creation (secp256k1 and post-quantum ML-DSA-65), the signing flow, previous-hash persistence, and how identity integrates with bound witnesses.

### [Protocol Best Practices](best-practices.md)
Read when making design decisions — schema naming, payload structure, module composition strategy, bound witness discipline, and error handling. Consult this before starting a new XYO-based feature.
