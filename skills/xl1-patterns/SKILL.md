---
name: xl1-patterns
description: Prescriptive design patterns for XL1 dApps. Covers multi-party dApp architecture principles, browser UX, wallet connection and permission requests, chain data indexing, commit-reveal schemes, in-page datalakes, prediction markets, atomic exchange (multi-party escrow), inscription substrates, fungible tokens, Statement Graph relationship claims, and Event Kit authenticated wake delivery. Activates when designing or reviewing a multi-party XL1 dApp's architecture, or when building application-level features on XL1 that require structured data access, multi-party fairness, atomic asset exchange, client-side chain queries, wallet permissions, ownable artifacts, token protocols, signed relationship graphs, wallet-JWT wakes, or dApp UI conventions. (Testing, headless verification, and the dApp Definition of Done live in the xl1-testing skill. Headless application contracts live in xl1-dapp-kit.)
metadata:
  version: 1.1.39 # x-release-please-version
  layer: 5
---

# XL1 Design Patterns

This skill provides prescriptive, recipe-style patterns for building common application features on XL1. Where the lower layers document *what XL1 is*, this layer documents *how to build things on it*.

**Rule ownership.** Entries below summarize rules that are stated in full in the linked file. The linked file is canonical: if a summary here and its file ever disagree, follow the file and flag the drift rather than reconciling silently.

**Skill identity.** This skill's version is exposed in this file's frontmatter under `metadata.version`. Whenever you present a plan, an acknowledgement, or a completion summary, state which skills informed it, formatted as `<skill-name> v<version>` — read the version from this file's frontmatter, never from an example. When multiple skills from this plugin are active, each may be listed.

## Skill layers

This is **Layer 5** of the XYO skill stack: `xy-development` (1) → `xy-toolchain` (2) → `xyo-knowledge` (3) → `xl1-knowledge` (4) → `xl1-patterns` (5) → `xl1-dapp-kit` (6) → `xl1-testing` (7) → `xl1-scaffold` (8) → `xl1-build` (9).

- **Builds on:** [xl1-knowledge](../xl1-knowledge/SKILL.md) (4) — chain data model, datalakes, gateway (generic, browser, and Node); [xyo-knowledge](../xyo-knowledge/SKILL.md) (3) — payloads, bound witnesses, modules, identity; `xy-toolchain` and `xy-development` from [ariestools-skills](https://github.com/ariestools/ariestools-skills) (1–2) — build tooling, ESLint, TypeScript config, Vitest; coding conventions, Git, testing, workflow
- **Hands off to:** [xl1-dapp-kit](../xl1-dapp-kit/SKILL.md) (6) — when adopting `@xyo-network/dapp-kit*` (headless runtime, application ports, effect journals and recovery, hosting); [xl1-testing](../xl1-testing/SKILL.md) (7) — to verify the work (headless testnet, local chain, browser mode) and to walk the dApp Definition of Done before reporting it complete; [xl1-scaffold](../xl1-scaffold/SKILL.md) (8) — when starting a new XL1 project; [xl1-build](../xl1-build/SKILL.md) (9) — when the build request is still vague

## Payload schema and hash prerequisites

Before adapting a recipe, read [Payload Schema Evolution and Identity](../xyo-knowledge/payload-schema-evolution.md): stable ASCII schema names, explicit version/shape support, frozen definitions with deliberate closure, and root hashes for new application references/commitments. Existing protocol-specific data-hash algorithms remain contracts; their documented exceptions do not make data hashes the default for new applications.

## Table of Contents

### [Architecture principles](architecture-principles.md)
**Read first when designing or reviewing any XL1 dApp whose state matters to more than one party** (games, markets, auctions, registries, leaderboards), with or without dapp-kit. Seven principles (the dApp is an engine and every interface a client; state is anchored evidence; a written protocol; the house as a bound protocol role; load from indexes, not replay; constant-cost indexes; cheaply verifiable index answers), worker authority and coordination, cross-cutting rules, a trust table and review questions. When assigning worker roles or choosing work discovery, concurrency, recovery or coordination, also consult the cross-cutting [ariestools-architecture](https://github.com/ariestools/ariestools-skills/blob/main/skills/ariestools-architecture/SKILL.md) skill from an adopted revision that contains it; availability and the XL1-specific application are explained in [Worker authority and coordination](architecture-principles.md#worker-authority-and-coordination).

### [Browser UX](browser-ux.md)
**REQUIRED reading for any dApp with a UI** — which is nearly all of them. Covers wallet connection lifecycle (`ConnectAccountsStack` and its slot props), lifting the granted accounts into app state with `onAccountsChanged` (not the compatibility `onAccountConnected`), the `useConnectAccount` singleton pitfall, capability-aware components (a granted account plus a write-capable runner), dApp UI structure, and display conventions (hash/address clamping, copy-to-clipboard). The UX layer that sits on top of [Browser Gateway](../xl1-knowledge/gateway-browser.md) construction. Skip only if the work is genuinely UI-less (a pure indexer service or a CLI).

### [Wallet](wallet.md)
Read when a dApp needs to request permissions from the XL1 browser wallet beyond what `ConnectAccountsStack` handles by default — or when you are tempted to ask for "datalake permissions" and need to know why that is the wrong path. Documents the five registered RPC permissions: the two publicly supported account methods, which share one grant (request `xyoWallet_getAccounts`; it covers `xyoSigner_address`), the experimental auto-sign permission on `xyoSigner_sign`, and the hard rule against `xyoDataLakes_*` (internal-only, including the SDK's `DataLake*` components). Also the SDK hooks (`useGrantedAccounts`, `RequestPermissionsButton`, `usePermissions`) for going below `ConnectAccountsStack`.

### [Browser ↔ Service Wiring](browser-service-wiring.md)
**REQUIRED reading whenever the dApp has both a React app and a companion HTTP service** (the default monorepo flow). Names the prescriptive port pair (`:3000` app, `:3001` service), the `/api/*` base-path convention, the Vite dev proxy that keeps everything same-origin, and the prod single-domain reverse-proxy story. Same-origin by default means **no CORS middleware** on the service. The escape hatch for genuinely cross-origin layouts is documented but treated as an exception. Skip only when there is no service (a pure read-only React app or a service-only project with no UI).

### Chain Data Indexing — by role

The first pattern in the layer to follow the protocol/client/service split. Read the protocol file first; then the role file matching what you're building.

#### [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md)
Conceptual rules for retrieving, filtering, and watching application-specific chain data — schemas, anchoring choices (Path A/B/C), `Destination as Protocol` (sentinel addresses), the four scan strategies, and finalized-vs-latest semantics. Environment-agnostic; both clients and services rely on it.

#### [Chain Data Indexing — Client](chain-data-indexing-client.md)
Browser-side reads — but **only for ephemeral, single-user, trivial cases**. A `useChainData` hook recipe (your own code, not an SDK export) for polled reads, capability detection in components, and a sharp boundary on what does and does not belong in the browser. Anything multi-user, durable, or reorg-sensitive needs the service file instead.

#### [Chain Data Indexing — Service](chain-data-indexing-service.md)
Long-running indexer service. Process model (sync/persist/serve loops), state persistence and atomic checkpoints, restart-resume semantics, exposing results via HTTP API, signer indexers and durable submission, deployment shape (process supervision, single-instance, `/api/healthz`, network from env).

### [Commit-Reveal Primitive](commit-reveal.md)
Read when building any feature where multiple parties make simultaneous decisions and seeing another's choice first would be unfair. Covers the two-phase commit-reveal workflow, schema design for commits and reveals, on-chain recording, hash verification, and timeout handling.

### [In-Page Data Lakes](in-page-datalakes.md)
Read when your React dApp needs read-only access to chain data without requiring a wallet connection. Covers the in-page gateway architecture (public reads through `gateways.inPageGateway`, since `defaultGateway` is the wallet's whenever it is installed), querying datalakes from React components, and combining read-only access with wallet-gated writes.

### [Commit-Reveal Prediction Markets](commit-reveal-prediction-markets.md)
Read when building a game, prediction market, or any application with a stake-commit-reveal-settle lifecycle. This is a composite pattern that combines commit-reveal, chain data indexing, and in-page datalakes into a complete recipe. Uses `nbf`/`exp` validity windows, configured `outcomeAuthorities`, lean settlement payloads, and `$sources` linkage between phases.

### [Atomic Exchange](atomic-exchange.md)
Read when two or more parties need to exchange assets atomically — neither side gets what they want unless every side has irrevocably committed. The dApp-shaped projection of the XYO/XNS escrow flow: multi-party paired secrets, multi-signer BoundWitnesses, configurable authority lists for appraisals and receipts, lean outcome payloads, and the strict rule that missing reveals prevent settlement (rather than forfeiting). Composes commit-reveal as a *gating mechanism for asset release* rather than a hidden-choice protocol.

### [Inscription Substrate](inscription-substrate.md)
Read when your application needs persistent, transferable, owned objects on XL1 — the equivalent of Bitcoin's Ordinals. Covers the artifact-vs-event split, content-addressed inscription IDs, single-step signed transfers, finalization-only indexer replay, and ownership ledger derivation. The substrate that higher-layer protocols (fungible tokens, collections, recursive content) compose on top of.

### [Fungible Tokens (XRC-20)](fungible-tokens.md)
Read when building a fungible token on XL1 in the style of Bitcoin's BRC-20 — open ticker registration, capped mints, address-to-address transfers, off-chain ledger from on-chain events. Layered directly on the inscription substrate. Covers deploy/mint/transfer schemas, the dual-pass indexer, canonical ordering rules, and the deliberate divergence from BRC-20's two-step transfer.

### [Statement Graph](statement-graph.md)
Read when you need a replayable, source-attributed relationship / assertion graph on XL1 (bindings, grants, approvals, membership). Closed lifecycle (one `network.xyo.statement.claim` carrying `{ source, subject, hashes }`) + open product vocabulary; fold 4 has no revoke verb and requires every claimed object in the claim's own transaction. Peer of inscription substrate — not for NFT-like custody.

### [Authenticated Wake Delivery](authenticated-wake-delivery.md)
Read when a sleepable indexer/host must be woken by wallet-JWT publishers authorized by a Statement Graph grant plus an active D-005 handshake subscription — not HMAC webhooks. Event Kit 2.2.x (Node ≥ 26): finalized XL1 / finalized Ethereum / UTC-interval sources, explicit `durable` / `best-effort` delivery, active-source admission, `wakeId` vs `jti`, and WakeQueue leases. Wakes schedule work; they are not chain truth.

### [dApp Definition of Done](../xl1-testing/dapp-checklist.md) (in xl1-testing)
**REQUIRED before reporting any XL1 dApp work as complete** — the completion gate for every pattern above is owned by [xl1-testing](../xl1-testing/SKILL.md) (Layer 7); walk it and report pass/fail per relevant section.
