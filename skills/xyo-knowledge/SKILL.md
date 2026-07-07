---
name: xyo-knowledge
description: XYO Protocol 2.0 domain knowledge. Covers payloads, bound witnesses, schemas, the module system (archivist, diviner, witness, sentinel, node), accounts, wallets, and protocol best practices. Activates when building on XYO or working with @xyo-network packages.
metadata:
  version: 1.1.24 # x-release-please-version
---

# XYO Protocol Knowledge

This skill covers the XYO Protocol 2.0 — the data model, module system, identity primitives, and conventions for building on XYO. The primary SDK is published as individual `@xyo-network/*` packages on npm.

When you need to look up exact type definitions or API details beyond what this skill covers, install the relevant `@xyo-network/*` package and read the TypeScript declarations at `dist/neutral/index.d.ts`.

This builds on the [Development Skill](../xy-development/SKILL.md) for coding principles and the [XY Toolchain Skill](../xy-toolchain/SKILL.md) for build/lint/test tooling.

**Skill identity.** This skill's version is exposed in this file's frontmatter under `metadata.version`. When reporting which skills informed your work, format as `<skill-name> v<version>` (e.g. `xyo-knowledge v1.1.19`). When multiple skills from this plugin are active, each may be listed.

## Table of Contents

### [Protocol Primitives](primitives.md)
Read when working with XYO data structures — payloads, schemas, bound witnesses, payload builders, or hashing. Covers the core data model and how to construct and validate protocol objects.

### [Module System](modules.md)
Read when working with XYO modules — archivists, diviners, witnesses, sentinels, nodes, or bridges. Covers the module abstraction, composition patterns, resolution, and the manifest system.

### [Identity & Signing](identity.md)
Read when working with accounts, wallets, key management, signing, or HD derivation. Covers Account and Wallet creation, the signing flow, and how identity integrates with bound witnesses.

### [Protocol Best Practices](best-practices.md)
Read when making design decisions — schema naming, payload structure, module composition strategy, bound witness discipline, and error handling. Consult this before starting a new XYO-based feature.
