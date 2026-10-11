---
name: xl1-knowledge
description: XL1 blockchain development (XYO Layer One). Covers the XL1 chain, datalakes, gateway (generic, browser, and Node — including FinalizedBlockStream), website integration via @xyo-network/xl1-browser-system and the REST-over-RPC transport rule, identity, and pointers to application substrates (Statement Graph, dapp-kit). Activates when building on XL1, integrating XL1 into a website, working with @xyo-network/xl1-* packages, or developing blockchain-backed applications.
metadata:
  version: 1.1.39 # x-release-please-version
  layer: 4
---

# XL1 Blockchain Knowledge

This skill covers the XL1 blockchain (XYO Layer One) — a data-focused Layer 1 designed for high-throughput data applications. XL1 extends the XYO protocol with blockchain primitives: blocks, transactions, fees, staking, and consensus.

When you need to look up exact type definitions, install the relevant `@xyo-network/xl1-*` package and read the TypeScript declarations at `dist/neutral/index.d.ts`. The [XL1 Protocol Yellow Paper](https://docs.xyo.network) provides the full protocol specification.

**Skill identity.** This skill's version is exposed in this file's frontmatter under `metadata.version`. Whenever you present a plan, an acknowledgement, or a completion summary, state which skills informed it, formatted as `<skill-name> v<version>` — read the version from this file's frontmatter, never from an example. When multiple skills from this plugin are active, each may be listed.

## Skill layers

This is **Layer 4** of the XYO skill stack: `xy-development` (1) → `xy-toolchain` (2) → `xyo-knowledge` (3) → `xl1-knowledge` (4) → `xl1-patterns` (5) → `xl1-dapp-kit` (6) → `xl1-testing` (7) → `xl1-scaffold` (8) → `xl1-build` (9).

- **Builds on:** [xyo-knowledge](../xyo-knowledge/SKILL.md) (3) — protocol primitives (payloads, bound witnesses, modules, accounts, wallets); `xy-toolchain` and `xy-development` from [ariestools-skills](https://github.com/ariestools/ariestools-skills) (1–2) — build tooling (`@ariestools/toolchain`, ESLint, TypeScript config, Vitest) and coding conventions (TypeScript, Git, testing, workflow)
- **Hands off to:** [xl1-patterns](../xl1-patterns/SKILL.md) (5) — when building application features, including the Statement Graph (append-only signed relationship claims, `@xyo-network/xl1-statement-graph-*`) and other application substrates that are not core chain; [xl1-dapp-kit](../xl1-dapp-kit/SKILL.md) (6) — when adopting the portable headless application contracts (`@xyo-network/dapp-kit*`); [xl1-testing](../xl1-testing/SKILL.md) (7) — when verifying chain interactions against a local chain or Sequence; [xl1-scaffold](../xl1-scaffold/SKILL.md) (8) — when starting a new XL1 project

## Payload schema and identity rules

Before defining payloads or choosing identity/commitment hashes, read [Payload Schema Evolution and Identity](../xyo-knowledge/payload-schema-evolution.md). New schema names use strict ASCII segments without structural version suffixes; `$version` is validated metadata; root hashes are the application default. Preserve shipped protocol hash contracts and do not let an unauthenticated BoundWitness version select consensus or signature rules.

## Critical: Never Issue Raw RPC Calls

The XL1 gateway is reached exclusively through the SDK. Two rules apply to every piece of code that touches chain access — dApp, service, indexer, test, verification script:

1. **Never call XL1 JSON-RPC methods by name** (`blockViewer_blocksByNumber`, `transactionViewer_byHash`, and any other `<viewer>_<method>` pair — whether via raw `fetch` to `/rpc` or a hand-rolled JSON-RPC client). Go through `gateway.connection.viewer.*` for reads and gateway methods for writes.
2. **Never use Ethereum RPC methods** (`eth_getBalance`, `eth_blockNumber`, `eth_call`, `eth_sendTransaction`, `personal_sign`, etc.) or Ethereum SDKs (`ethers`, `viem`, `web3.js`) against XL1. XL1 is not an EVM chain. Address compatibility via shared BIP44 derivation is the *only* thing XL1 shares with Ethereum.

See [Gateway — Never Issue Raw RPC Calls](gateway.md#never-issue-raw-rpc-calls) for the rationale, the XL1 equivalents for each Ethereum method, and the structural grep self-check that gates "done." For dApps, the completion gate in xl1-testing walks the same check: [dApp Definition of Done — Gateway & Chain Access](../xl1-testing/dapp-checklist.md#gateway--chain-access).

## Table of Contents

### [XL1 Chain](chain.md)
Read when working with XL1 blockchain concepts — blocks, transactions, fees, rewards, node types, or consensus. Covers the chain data model and how XL1 extends XYO's BoundWitness/Payload primitives.

### [Development on XL1](development.md)
Read when building applications or services on XL1. Covers the Zod-first type pattern, Viewer/Runner architecture, providers (including `providerId` identity, `MissingProviderIdError`, and `UnknownProviderError` pins), validation, and the SDK package structure.

### [Identity & Wallets](identity.md)
Read when creating a wallet or signer in XL1 backend code (Node services, indexers, CLIs, tests). Covers the canonical `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')` pattern, the cross-environment compatibility guarantee with MetaMask and the XYO browser extension, and the rule that the result is an `AccountInstance`, which goes directly to `GatewayBuilder.account(...)` when a write-capable runner is needed.

### [Datalakes](datalakes.md)
Read when working with XL1 chain data storage — archiving, querying, or configuring storage backends. Covers the DataLake abstraction and how it builds on XYO Archivists, and indexes the operator-side driver and S3 provider packages.

### [Gateway](gateway.md)
Read when connecting to the XL1 chain — generic gateway concepts, viewer API, networks (including REST roots), transaction submission (options, confirmation, and crash-safe **durable submission** with the phased `buildXl1Transaction` … `observeXl1TransactionFinality` functions), transports, and how to run a gateway node. Environment-specific construction lives in two sibling files.

### [Browser Gateway](gateway-browser.md)
Read when integrating XL1 into any website — React dApps, plain pages, workers, service workers, and browser extensions. `@xyo-network/xl1-browser-system` is the preferred integration substrate and **REST is the preferred transport**; React dApps reach it through `InPageGatewaysProvider` with `transport="rest"` rather than launching a browser system directly. Also covers the Chrome wallet extension, `WalletGatewayProvider` / `GatewayProvider`, and `useProvidedGateway`. UX patterns built on top of the gateway live in [Browser UX](../xl1-patterns/browser-ux.md).

### [Node Gateway](gateway-node.md)
Read when constructing a gateway in any non-browser context — backend services, indexers, CLIs, scheduled jobs, tests, and headless verification of dApps. Covers the canonical `GatewayBuilder` entry point (read-only and write-capable), owned gateway sessions (`buildSession()` / `buildRunnerSession()` and `stop()` for clean shutdown), the seed-phrase signer pattern, the lazy-promise caching pattern, and the `basicRemoteViewerLocator` escape hatch.

### [Finalized block stream](gateway.md#finalized-block-stream)
Read when an indexer or service needs ordered finalized delivery (`FinalizedBlockStream` / `finalizedBlockStreamFromGateway`); prefer it over the deprecated `headUpdated`. A section of [Gateway](gateway.md).
