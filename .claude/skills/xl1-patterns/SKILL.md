---
name: xl1-patterns
description: Prescriptive design patterns for XL1 dApps. Covers chain data indexing, commit-reveal schemes, in-page datalakes, and prediction markets. Activates when building application-level features on XL1 that require structured data access, multi-party fairness, or client-side chain queries.
user-invocable: false
---

# XL1 Design Patterns

This skill provides prescriptive, recipe-style patterns for building common application features on XL1. Where the lower layers document *what XL1 is*, this layer documents *how to build things on it*.

## Lower Layer Skills

These patterns compose primitives from the full skill stack:

- **[XL1 Knowledge](../xl1-knowledge/SKILL.md)** — chain data model, datalakes, gateway, browser wallet
- **[XYO Knowledge](../xyo-knowledge/SKILL.md)** — payloads, bound witnesses, modules, identity
- **[XY Toolchain](../xy-toolchain/SKILL.md)** — build tooling, ESLint, TypeScript config, Vitest
- **[Development](../development/SKILL.md)** — coding conventions, Git, testing, workflow

## Table of Contents

### [Chain Data Indexing](chain-data-indexing.md)
Read when your dApp needs to query, filter, or paginate application-specific data from the XL1 chain. Covers schema-based datalake filtering, RPC viewer queries, polling for new data, and building application read models from raw chain state.

### [Commit-Reveal Primitive](commit-reveal.md)
Read when building any feature where multiple parties make simultaneous decisions and seeing another's choice first would be unfair. Covers the two-phase commit-reveal workflow, schema design for commits and reveals, on-chain recording, hash verification, and timeout handling.

### [In-Page Data Lakes](in-page-datalakes.md)
Read when your React dApp needs read-only access to chain data without requiring a wallet connection. Covers the in-page gateway architecture, querying datalakes from React components, and combining read-only access with wallet-gated writes.

### [Commit-Reveal Prediction Markets](commit-reveal-prediction-markets.md)
Read when building a game, prediction market, or any application with a stake-commit-reveal-settle lifecycle. This is a composite pattern that combines commit-reveal, chain data indexing, and in-page datalakes into a complete recipe.
