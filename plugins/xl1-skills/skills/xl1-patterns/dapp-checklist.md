# dApp Definition of Done

Use this checklist before shipping any XL1 dApp feature. Each item corresponds to a rule or anti-pattern documented in the skill stack. The general [Definition of Done](../development/workflow.md) (builds, lints, tests, dev server, no placeholders, no regressions) still applies — this checklist adds XL1-specific concerns.

---

## Gateway & Chain Access

- [ ] A gateway provider wraps the app — either `WalletGatewayProvider` (wallet-required) or `GatewayProvider` + `InPageGatewaysProvider` (read-only fallback)
- [ ] `gatewayName` is set on the provider (e.g., `MainNetwork.id`) — without it, `defaultGateway` is always `undefined`
- [ ] Chain state is read through `connection.viewer` sub-viewers — no raw HTTP calls to the gateway endpoint
- [ ] `connection.viewer` is guarded before use (`?.` or null check) — it is `XyoViewer | undefined`
- [ ] Transactions are submitted through gateway methods (`addPayloadsToChain`, `send`, `sendMany`) — no manual `TransactionBoundWitness` construction
- [ ] Write capability is checked before submitting (`'addPayloadsToChain' in defaultGateway`)

**Source:** [Gateway Usage](gateway-usage.md), [Browser Wallet](../xl1-knowledge/wallet.md)

---

## Datalake

- [ ] Datalake clients are standalone `RestDataLakeRunner` / `RestDataLakeViewer` — not accessed via `gateway.datalake` (doesn't exist) or `gateway.connection.storage` (read-only, may point elsewhere)
- [ ] Datalake clients are instantiated with `getTestProviderContext()` from `@xyo-network/xl1-protocol-sdk/test`
- [ ] Off-chain payloads are inserted into the dApp's datalake **before** submitting the transaction — the wallet does not do this automatically
- [ ] The dApp does not assume the wallet's datalake covers its persistence needs — wallet and dApp are independent datalake clients

**Source:** [Gateway Usage — Accessing the Datalake](gateway-usage.md), [Datalakes](../xl1-knowledge/datalakes.md)

---

## Wallet & Identity

- [ ] `Account.random()` is not used for user-facing wallet connections — it is for tests and non-interactive scripts only
- [ ] `ConnectAccountsStack` handles the wallet connection UI — no custom connection/disconnection UI that duplicates its functionality
- [ ] `ConnectAccountsStack` is rendered unconditionally — it manages both unconnected and connected states
- [ ] The connected address is lifted into app-level state via `onAccountConnected` and passed as props — `useConnectAccount()` is not called in multiple components
- [ ] When the wallet extension is missing, the UI prompts the user to install it — no silent fallback to a random account

**Source:** [Browser Wallet — Wallet Connection](../xl1-knowledge/wallet.md)

---

## SDK-First

- [ ] Payloads are built with `PayloadBuilder` — not raw object literals (`{ schema: '...', field: val }`)
- [ ] Hashing uses `PayloadBuilder.dataHash()` — not `crypto.subtle.digest` on `JSON.stringify` (produces non-canonical hashes)
- [ ] BoundWitnesses are built with `BoundWitnessBuilder` — field arrays are never constructed manually
- [ ] Datalake access uses `RestDataLakeRunner` / `RestDataLakeViewer` — not raw `fetch()` to the endpoint
- [ ] New types follow the Zod-first pattern: Zod schema is source of truth, TS type derived via `z.infer`, guards via `zodIsFactory` / `zodAsFactory` / `zodToFactory`
- [ ] Schemas are created with `asSchema('network.xyo.app.entity', true)` — not bare string literals

**Source:** [Protocol Best Practices](../xyo-knowledge/best-practices.md), [Development on XL1](../xl1-knowledge/development.md)

---

## Payload & Schema Design

- [ ] Application fields do not use `_*` or `$*` prefixes — these are reserved for storage infrastructure and client metadata
- [ ] Schema names use reverse domain, dot-separated, lowercase: `network.xyo.<app>.<entity>`
- [ ] Each payload type represents one concept — game state, move, and result are separate schemas, not one combined payload
- [ ] Related payloads are referenced by hash (`$sources`), not embedded inside other payloads

**Source:** [Protocol Best Practices — Payload Design](../xyo-knowledge/best-practices.md), [Protocol Primitives](../xyo-knowledge/primitives.md)

---

## Provider Architecture

- [ ] App needs read-only access without wallet? Uses `GatewayProvider` + `InPageGatewaysProvider` — not `WalletGatewayProvider`
- [ ] App strictly requires wallet? Uses `WalletGatewayProvider`
- [ ] Read-only components (history, leaderboards, explorers) are placed outside the wallet connection gate — they work with just the in-page gateway
- [ ] Wallet-gated components (submit move, create game) check write capability before rendering action controls

**Source:** [In-Page Data Lakes](in-page-datalakes.md), [Gateway Usage — Setup](gateway-usage.md)

---

## Display

- [ ] Hashes (64 chars) and addresses (40 chars) are clamped to a readable prefix + suffix (e.g., `a1b2c3d4...ef567890`)
- [ ] Every clamped value provides a copy-to-clipboard action

**Source:** [In-Page Data Lakes — Displaying Hashes and Addresses](in-page-datalakes.md)

---

## Commit-Reveal (if applicable)

- [ ] Salts are never stored on-chain during the commit phase
- [ ] Salts use `crypto.getRandomValues` with 32+ bytes — not timestamps, counters, or predictable values
- [ ] Choices are always hashed with a salt — never without
- [ ] Validity windows use `nbf`/`exp` (`BlockDurationZod` from `@xyo-network/xl1-sdk`) — not bespoke `commitDeadline`/`revealDeadline` field names
- [ ] `reveal.nbf >= commit.exp` — the reveal window does not open until the commit window has closed
- [ ] No client-side processing buffer is added to deadline checks (matches `TransactionDurationValidator` semantics)
- [ ] Salts are persisted locally (e.g., `StorageArchivist` with `type: 'local'`) for retrieval during the reveal phase
- [ ] Commit-reveal verification uses `PayloadBuilder.dataHash` — not a custom hash function
- [ ] Commits `$sources` to the market/session terms; reveals `$sources` to their commit — building a traversable audit DAG

**Source:** [Commit-Reveal Primitive](commit-reveal.md)

---

## Settlement & Authorities (if applicable)

- [ ] The session payload (market/exchange/auction) declares an `outcomeAuthorities: Address[]` list — never relies on "the market creator" implicitly
- [ ] Settlement payloads are lean — `{ outcome, terms: <hash> }` shape — supporting evidence (verified reveals, attestations) rides as BW co-payloads
- [ ] Winners/recipients are *derived* from the settlement BW + verified reveals — not stored inline on the outcome payload
- [ ] Any cached results view (e.g., `MarketResultsViewPayload`) is clearly marked non-authoritative; `$sources` to the settlement payload it derives from
- [ ] Settlement gate re-runs the entry gate before signing — never trusts caller-supplied verified state
- [ ] Settlement gate re-verifies every reveal hash against its commit (`PayloadBuilder.dataHash`) before bundling it into the settlement BW

**Source:** [Commit-Reveal Prediction Markets — Validation Gates](commit-reveal-prediction-markets.md#validation-gates), [Atomic Exchange — Validation Gates](atomic-exchange.md#validation-gates)

---

## Multi-Party Co-Signing (if applicable)

- [ ] Joint commitments use a single multi-signer BoundWitness (`.signers([a, b, ...])`) — not parallel single-signer BWs that a verifier would have to correlate
- [ ] "All parties must agree" checks use `addressesContainsAll(bw, parties)` from `@xyo-network/boundwitness-validator`
- [ ] "Any authorized authority may sign" checks use `addressesContainsAny(bw, authorities)`
- [ ] Multi-sig parties (a party with several addresses) require *all* of that party's addresses to co-sign their secret reveal — not any one of them

**Source:** [Protocol Primitives — Multi-Signer BoundWitnesses](../xyo-knowledge/primitives.md#multi-signer-co-witnessed-boundwitnesses), [Atomic Exchange](atomic-exchange.md)
