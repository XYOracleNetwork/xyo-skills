---
name: xl1-knowledge
description: XL1 blockchain development (XYO Layer One). The top skill layer — covers the XL1 chain, datalakes, gateway (generic, browser, and Node), and building dApps. Activates when building on XL1, working with @xyo-network/xl1-* packages, or developing blockchain-backed applications.
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

### [Identity & Wallets](identity.md)
Read when creating a wallet or signer in XL1 backend code (Node services, indexers, CLIs, tests). Covers the canonical `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')` pattern, the cross-environment compatibility guarantee with MetaMask and the XYO browser extension, and the rule that the result is an `AccountInstance` to be wrapped via `buildSimpleXyoSignerV2` when an `XyoSigner` is needed.

### [Datalakes](datalakes.md)
Read when working with XL1 chain data storage — archiving, querying, or configuring storage backends. Covers the DataLake abstraction and how it builds on XYO Archivists.

### [Gateway](gateway.md)
Read when connecting to the XL1 chain — generic gateway concepts, viewer API, networks, transports, and how to run a gateway node. Environment-specific construction lives in two sibling files.

### [Browser Gateway](gateway-browser.md)
Read when constructing a gateway in a React dApp — the Chrome wallet extension, `WalletGatewayProvider` / `GatewayProvider` / `InPageGatewaysProvider`, and `useProvidedGateway`. UX patterns built on top of the gateway live in [Browser UX](../xl1-patterns/browser-ux.md).

### [Node Gateway](gateway-node.md)
Read when constructing a gateway in any non-browser context — backend services, indexers, CLIs, scheduled jobs, tests, and headless verification of dApps. Covers the canonical `GatewayBuilder` entry point (read-only and write-capable), the seed-phrase signer pattern, the lazy-promise caching pattern, and the `basicRemoteViewerLocator` escape hatch.
