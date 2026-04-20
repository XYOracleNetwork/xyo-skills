---
name: xl1-knowledge
description: XL1 blockchain development (XYO Layer One). The top skill layer — covers the XL1 chain, datalakes, gateway, browser wallet, and building dApps. Activates when building on XL1, working with @xyo-network/xl1-* packages, or developing blockchain-backed applications.
user-invocable: false
---

# XL1 Blockchain Knowledge

This skill covers the XL1 blockchain (XYO Layer One) — a data-focused Layer 1 designed for high-throughput data applications. XL1 extends the XYO protocol with blockchain primitives: blocks, transactions, fees, staking, and consensus.

## Lower Layer Skills

XL1 builds on the full skill stack. When working on XL1 projects, also consult:

- **[XYO Knowledge](../xyo-knowledge/SKILL.md)** — for protocol primitives (payloads, bound witnesses, modules, accounts, wallets)
- **[XY Toolchain](../xy-toolchain/SKILL.md)** — for build tooling (@xylabs/toolchain, ESLint, TypeScript config, Vitest)
- **[Development](../development/SKILL.md)** — for coding conventions (TypeScript, Git, testing, workflow)

When you need to look up exact type definitions, install the relevant `@xyo-network/xl1-*` package and read the TypeScript declarations at `dist/neutral/index.d.ts`. The [XL1 Protocol Yellow Paper](https://docs.xyo.network) provides the full protocol specification.

## Table of Contents

### [XL1 Chain](chain.md)
Read when working with XL1 blockchain concepts — blocks, transactions, fees, rewards, node types, or consensus. Covers the chain data model and how XL1 extends XYO's BoundWitness/Payload primitives.

### [Development on XL1](development.md)
Read when building applications or services on XL1. Covers the Zod-first type pattern, Viewer/Runner architecture, providers, validation, and the SDK package structure.

### [Datalakes](datalakes.md)
Read when working with XL1 chain data storage — archiving, querying, or configuring storage backends. Covers the DataLake abstraction and how it builds on XYO Archivists.

### [Gateway](gateway.md)
Read when connecting to the XL1 chain — JSON-RPC API, RPC method namespaces, transports, and providers. Covers how to query blocks, submit transactions, and run a gateway node.

### [Browser Wallet](wallet.md)
Read when integrating with the XL1 browser wallet — transaction signing, React components, and the dApp ↔ wallet communication flow.
