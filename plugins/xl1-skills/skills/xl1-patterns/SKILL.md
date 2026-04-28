---
name: xl1-patterns
description: Prescriptive design patterns for XL1 dApps. Covers chain data indexing, commit-reveal schemes, in-page datalakes, prediction markets, atomic exchange (multi-party escrow), inscription substrates, and fungible tokens. Activates when building application-level features on XL1 that require structured data access, multi-party fairness, atomic asset exchange, client-side chain queries, ownable artifacts, or token protocols.
---

# XL1 Design Patterns

This skill provides prescriptive, recipe-style patterns for building common application features on XL1. Where the lower layers document *what XL1 is*, this layer documents *how to build things on it*.

## Lower Layer Skills

These patterns compose primitives from the full skill stack:

- **[XL1 Knowledge](../xl1-knowledge/SKILL.md)** — chain data model, datalakes, gateway (generic, browser, and Node)
- **[XYO Knowledge](../xyo-knowledge/SKILL.md)** — payloads, bound witnesses, modules, identity
- **[XY Toolchain](../xy-toolchain/SKILL.md)** — build tooling, ESLint, TypeScript config, Vitest
- **[Development](../development/SKILL.md)** — coding conventions, Git, testing, workflow

## Table of Contents

### [Gateway Usage](gateway-usage.md)
Read when you need to interact with the XL1 chain from application code — reading chain state, submitting transactions, or accessing the datalake. Cross-environment recipes (browser, Node, tests) covering viewer sub-viewers, transaction submission, standalone datalake clients, capability detection, and network selection. For environment-specific gateway construction, see [Browser Gateway](../xl1-knowledge/gateway-browser.md) or [Node Gateway](../xl1-knowledge/gateway-node.md).

### [Chain Data Indexing](chain-data-indexing.md)
Read when your dApp needs to query, filter, or paginate application-specific data from the XL1 chain. Covers schema-based datalake filtering, RPC viewer queries, polling for new data, and building application read models from raw chain state.

### [Commit-Reveal Primitive](commit-reveal.md)
Read when building any feature where multiple parties make simultaneous decisions and seeing another's choice first would be unfair. Covers the two-phase commit-reveal workflow, schema design for commits and reveals, on-chain recording, hash verification, and timeout handling.

### [In-Page Data Lakes](in-page-datalakes.md)
Read when your React dApp needs read-only access to chain data without requiring a wallet connection. Covers the in-page gateway architecture, querying datalakes from React components, and combining read-only access with wallet-gated writes.

### [Commit-Reveal Prediction Markets](commit-reveal-prediction-markets.md)
Read when building a game, prediction market, or any application with a stake-commit-reveal-settle lifecycle. This is a composite pattern that combines commit-reveal, chain data indexing, and in-page datalakes into a complete recipe. Uses `nbf`/`exp` validity windows, configured `outcomeAuthorities`, lean settlement payloads, and `$sources` linkage between phases.

### [Atomic Exchange](atomic-exchange.md)
Read when two or more parties need to exchange assets atomically — neither side gets what they want unless every side has irrevocably committed. The dApp-shaped projection of the XYO/XNS escrow flow: multi-party paired secrets, multi-signer BoundWitnesses, configurable authority lists for appraisals and receipts, lean outcome payloads, and the strict rule that missing reveals prevent settlement (rather than forfeiting). Composes commit-reveal as a *gating mechanism for asset release* rather than a hidden-choice protocol.

### [Inscription Substrate](inscription-substrate.md)
Read when your application needs persistent, transferable, owned objects on XL1 — the equivalent of Bitcoin's Ordinals. Covers the artifact-vs-event split, content-addressed inscription IDs, single-step signed transfers, finalization-only indexer replay, and ownership ledger derivation. The substrate that higher-layer protocols (fungible tokens, collections, recursive content) compose on top of.

### [Fungible Tokens (XRC-20)](fungible-tokens.md)
Read when building a fungible token on XL1 in the style of Bitcoin's BRC-20 — open ticker registration, capped mints, address-to-address transfers, off-chain ledger from on-chain events. Layered directly on the inscription substrate. Covers deploy/mint/transfer schemas, the dual-pass indexer, canonical ordering rules, and the deliberate divergence from BRC-20's two-step transfer.

### [dApp Definition of Done](dapp-checklist.md)
Read before shipping any XL1 dApp feature. A checklist that validates gateway usage, datalake setup, wallet integration, SDK-first compliance, payload design, provider architecture, display conventions, and commit-reveal correctness against the rules and anti-patterns defined across the skill stack.
