# dApp Definition of Done

Walk this checklist before declaring any XL1 dApp work complete. This is an **agent-facing completion gate**, not a deployment or release step — "done" here means the agent stops and reports the work as finished, regardless of whether anyone is about to deploy it. Each item corresponds to a rule or anti-pattern documented in the skill stack. The general [Definition of Done](../xy-development/workflow.md) (builds, lints, tests, dev server, no placeholders, no regressions) still applies — this checklist adds XL1-specific concerns on top of it.

---

## Gateway & Chain Access

- [ ] A gateway provider wraps the app — either `WalletGatewayProvider` (wallet-required) or `GatewayProvider` + `InPageGatewaysProvider` (read-only fallback)
- [ ] `gatewayName` is set on the provider (e.g., `MainNetwork.id`) — without it, `defaultGateway` is always `undefined`
- [ ] Chain state is read through `connection.viewer` sub-viewers — no raw HTTP calls to the gateway endpoint
- [ ] `connection.viewer` is guarded before use (`?.` or null check) — it is `XyoViewer | undefined`
- [ ] Transactions are submitted through gateway methods (`addPayloadsToChain`, `send`, `sendMany`) — no manual `TransactionBoundWitness` construction
- [ ] Write capability is checked before submitting (`'addPayloadsToChain' in defaultGateway`)
- [ ] **No hand-rolled JSON-RPC envelopes anywhere.** `grep -rE '"jsonrpc"\s*:' src/` returns nothing. The `"jsonrpc"` field is required by JSON-RPC 2.0 and is the structural tell of a bypass — catches any direct call regardless of which method name it carries, so the check stays valid as new XL1 viewers are added. Every chain read goes through `connection.viewer.*`; every write goes through gateway methods. See [Gateway — Never Issue Raw RPC Calls](../xl1-knowledge/gateway.md#never-issue-raw-rpc-calls)
- [ ] **No Ethereum JSON-RPC method names anywhere.** XL1 is not an EVM chain. `grep -rE "\b(eth|net|web3|personal|engine)_[a-zA-Z]+\b" src/` returns nothing — these namespaces are defined by the Ethereum spec and do not exist on the XL1 gateway. Replace any hits with XL1 viewer/runner equivalents (`eth_getBalance` → `viewer.account.balance.accountBalance(...)`, `eth_blockNumber` → `viewer.block.currentBlockNumber()`, `eth_sendTransaction` → `gateway.addPayloadsToChain(...)` / `gateway.send(...)`, etc.)
- [ ] **No Ethereum SDKs imported for chain access.** `grep -rE "from ['\"](ethers|viem|web3|@ethersproject|@walletconnect)" src/` returns nothing — these libraries speak the Ethereum JSON-RPC protocol and will not work against XL1, regardless of configuration. Use `@xyo-network/xl1-sdk` instead. (Address compatibility via shared BIP44 derivation is the *only* thing XL1 borrows from Ethereum.)

**Source:** [Gateway](../xl1-knowledge/gateway.md), [Gateway — Never Issue Raw RPC Calls](../xl1-knowledge/gateway.md#never-issue-raw-rpc-calls), [Browser Gateway](../xl1-knowledge/gateway-browser.md)

---

## Datalake

- [ ] Datalake clients are standalone `RestDataLakeRunner` / `RestDataLakeViewer` — not accessed via `gateway.datalake` (doesn't exist) or `gateway.connection.storage` (read-only, may point elsewhere)
- [ ] Datalake clients are constructed with the `createRestDataLakeRunner(endpoint)` / `createRestDataLakeViewer(endpoint)` factories from `@xyo-network/xl1-sdk` — not by calling `.create({ context, endpoint })` directly
- [ ] Off-chain payloads are inserted into the dApp's datalake **before** submitting the transaction — the wallet does not do this automatically
- [ ] The dApp does not assume the wallet's datalake covers its persistence needs — wallet and dApp are independent datalake clients
- [ ] Block-walk indexers do not assume `viewer.block.blockByNumber(n)` hydrates off-chain payloads — they scan each `TransactionBoundWitness` for matching `payload_schemas[]`, gather the parallel `payload_hashes[]`, and fetch via `viewer.block.payloadsByHash(hashes)`. (Block reads are on-chain only; only `viewer.transaction.byHash` hydrates off-chain payloads in one shot.)

**Source:** [Gateway — Accessing the Datalake](../xl1-knowledge/gateway.md#accessing-the-datalake), [Datalakes](../xl1-knowledge/datalakes.md)

---

## Wallet & Identity

- [ ] `Account.random()` is not used for user-facing wallet connections — it is for tests and non-interactive scripts only
- [ ] `ConnectAccountsStack` handles the wallet connection UI — no custom connection/disconnection UI that duplicates its functionality
- [ ] `ConnectAccountsStack` is rendered unconditionally — it manages both unconnected and connected states
- [ ] The connected address is lifted into app-level state via `onAccountConnected` and passed as props — `useConnectAccount()` is not called in multiple components
- [ ] When the wallet extension is missing, the UI prompts the user to install it — no silent fallback to a random account

**Source:** [Browser UX — Wallet Connection](browser-ux.md)

---

## SDK-First

- [ ] Payloads are built with `PayloadBuilder` — not raw object literals (`{ schema: '...', field: val }`)
- [ ] Hashing uses `PayloadBuilder.dataHash()` — not `crypto.subtle.digest` on `JSON.stringify` (produces non-canonical hashes)
- [ ] BoundWitnesses are built with `BoundWitnessBuilder` — field arrays are never constructed manually
- [ ] Datalake access uses `RestDataLakeRunner` / `RestDataLakeViewer` — not raw `fetch()` to the endpoint
- [ ] New types follow the Zod-first pattern: Zod schema is source of truth, TS type derived via `z.infer`, guards via `zodIsFactory` / `zodAsFactory` / `zodToFactory`
- [ ] Payloads read from the chain or datalake are filtered through Zod-factory guards (`isXxxPayload`) before being honored — `payload.schema === '...'` is a tag check, not a validator. `isPayloadOfSchemaType` is not a substitute
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

## Indexer Floor Block

- [ ] `INDEXER_FLOOR_BLOCK` is set in `.env` for every chain the dApp targets — captured during development, not at deploy time
- [ ] Bounded dApps (any with self-authored `network.xyo.<myapp>.*` schemas) use a captured chain head as the floor
- [ ] Unbounded indexers (transfer ledgers, substrate indexers, XRC-20 ledgers) explicitly set `INDEXER_FLOOR_BLOCK=0` — never silently default
- [ ] Browser dApps that read chain data directly also expose the floor as `VITE_INDEXER_FLOOR_BLOCK`, with backward walks bounded at it
- [ ] The indexer fails closed when `INDEXER_FLOOR_BLOCK` is missing — no implicit floor of `0`
- [ ] Each environment (mainnet, sequence, devnet) has its own `.env` with its own captured floor — no reuse across chains

**Source:** [Chain Data Indexing — Floor Block](chain-data-indexing-protocol.md#floor-block), [Chain Data Indexing — Service](chain-data-indexing-service.md)

---

## Provider Architecture

- [ ] App needs read-only access without wallet? Uses `GatewayProvider` + `InPageGatewaysProvider` — not `WalletGatewayProvider`
- [ ] App strictly requires wallet? Uses `WalletGatewayProvider`
- [ ] Read-only components (history, leaderboards, explorers) are placed outside the wallet connection gate — they work with just the in-page gateway
- [ ] Wallet-gated components (submit move, create game) check write capability before rendering action controls

**Source:** [In-Page Data Lakes](in-page-datalakes.md), [Browser Gateway](../xl1-knowledge/gateway-browser.md)

---

## Browser ↔ Service Wiring (if there's both an app and a service)

- [ ] Service routes mount under `/api/*` — never at the root or under app-specific paths
- [ ] React app calls the service with relative URLs (`fetch('/api/...')`) — no `VITE_API_URL`, no hardcoded `http://localhost:3001`, no `window.location.origin` concatenation
- [ ] App's `vite.config.ts` has a `server.proxy` rule for `/api` → `http://localhost:3001` with `changeOrigin: true`
- [ ] Service `PORT` defaults to `3001`; app's Vite `server.port` is `3000`
- [ ] No CORS middleware on the service — the default same-origin topology has nothing to CORS for. Adding `cors()` "just in case" is the anti-pattern
- [ ] Workspace root has a `dev` script that runs app + service concurrently (`pnpm -r --parallel run dev`)
- [ ] If the dApp deliberately runs cross-origin (escape hatch), the choice is documented, the CORS allowlist is explicit (not `*` for credentialed routes), and the preflight path was tested

**Source:** [Browser ↔ Service Wiring](browser-service-wiring.md)

---

## Headless Verification

- [ ] A Node verification script exercises the dApp's happy path end-to-end — `GatewayBuilder.build(signer)` against a seed phrase from `.env`, no browser involved
- [ ] The script imports the dApp's own domain functions (e.g., `submitMove`, `revealMove`) — does not re-implement payload construction or transaction logic
- [ ] Domain functions accept a runner/gateway as a parameter so the same code runs in both browser and Node contexts
- [ ] The signer is derived via `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')` + `buildSimpleXyoSignerV2` — addresses match what MetaMask / XYO extension show on the same seed
- [ ] Multi-party flows derive distinct signers (`derivePath('0')`, `derivePath('1')`, …) and build one runner per signer
- [ ] The script reads back through `connection.viewer` after submission — confirming the chain accepted the tx and the data shape is correct. This proves the **chain edge**; if the UI also reads from a service surface, see the next two items
- [ ] If the dApp exposes derived state through a service (REST API, GraphQL, WebSocket — anything the UI calls that is not directly `connection.viewer`), the verification script also reads back through that service surface. **Do not synthesize derived state via direct `viewer.block.payloadsByHash` lookups in the verify script** — that proves the agent can do the indexer's job, not that the indexer is doing it. The whole point of the service round-trip is to exercise the path the UI exercises
- [ ] Before declaring "the service is just behind, not buggy," the script asserts BOTH `viewer.finalization.headNumber() ≥ blockContaining(txHash)` AND `indexer.lastIndexedBlock ≥ blockContaining(txHash)` (read from the indexer's progress endpoint — see [Chain Data Indexing — Service § Progress Endpoint](chain-data-indexing-service.md#progress-endpoint)). If both watermarks are past the tx block and the service still returns empty, that is a bug. "Sequence is slow" is not a valid explanation when both watermarks have advanced
- [ ] `confirmSubmittedTransaction` calls pass explicit options for non-local networks (e.g., `{ attempts: 30, delay: 10_000 }` for Sequence) — defaults time out before finalization
- [ ] Seed phrase loads from `.env` via `dotenv/config`; never logged, committed, or echoed to console
- [ ] Script defaults to a non-mainnet network (e.g., `XL1_NETWORK=sequence`) — explicit override required to point at mainnet

**Source:** [Headless dApp Verification](headless-verification.md)

---

## Display

- [ ] Hashes (64 chars) and addresses (40 chars) are clamped to a readable prefix + suffix (e.g., `a1b2c3d4...ef567890`)
- [ ] Every clamped value provides a copy-to-clipboard action
- [ ] Every surfaced chain primitive (address, block, transaction, payload, list view) links to the corresponding Explorer page, with the URL built via `ExplorerLinks` from `@xyo-network/xl1-sdk` — no hand-concatenated explorer paths

**Source:** [Browser UX — Display Conventions](browser-ux.md)

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
