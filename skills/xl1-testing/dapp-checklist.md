# dApp Definition of Done

Walk this checklist before declaring any XL1 dApp work complete. This is an **agent-facing completion gate**, not a deployment or release step — "done" here means the agent stops and reports the work as finished, regardless of whether anyone is about to deploy it. The `xl1-testing` skill owns this gate; each item corresponds to a rule or anti-pattern documented elsewhere in the skill stack and cites it under **Source**.

This checklist is **Gate 2** of a three-gate completion gate (see [`xy-development` (ariestools-skills) — workflow § Applying the Definition of Done](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-development/workflow.md#applying-the-definition-of-done), which numbers these as "layers"; here they are *gates*, so they do not collide with the skill-stack layer numbers):

1. **Gate 1 — Generic DoD** ([`xy-development` (ariestools-skills) — workflow § Definition of Done](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-development/workflow.md#definition-of-done)): builds, lints, tests, dev server, no placeholders, no regressions. Always applies.
2. **Gate 2 — Domain DoD (this checklist)**: XL1/browser-specific concerns. Applies when the project is a browser-facing dApp on XL1.
3. **Gate 3 — Project-specific acceptance criteria**: in `PRD.md` at the working directory, when present. Generated at planning time for each project — see [`xy-development` (ariestools-skills) — workflow § Writing Project-Specific Acceptance Criteria](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-development/workflow.md#writing-project-specific-acceptance-criteria).

Gate 1 always applies. Walk this checklist (Gate 2) when the project is a dApp. Walk Gate 3 when a `PRD.md` exists. If any item across any applicable gate fails, the work is not done — iterate until all gates pass.

---

## Gateway & Chain Access

- [ ] A gateway provider wraps the app — either `WalletGatewayProvider` (wallet-required) or `GatewayProvider` + `InPageGatewaysProvider` (read-only fallback)
- [ ] **In-page gateways are configured for REST.** `InPageGatewaysProvider` carries `transport="rest"` — the prop defaults to `'rpc'`, so omitting it silently puts every anonymous read on a live gateway node. `grep -n 'InPageGatewaysProvider' src/` shows `transport="rest"` on every occurrence. Reaching for `'rpc'` is allowed only with a stated reason (no published static layout, or a read that must observe unfinalized state)
- [ ] Non-React browser targets (plain pages, workers, service workers, extensions) integrate through `@xyo-network/xl1-browser-system` — not a hand-rolled gateway — and retain the session so the owning realm can stop it
- [ ] `gatewayName` is set on the provider (the target network's id, e.g. `SequenceNetwork.id` during development, `MainNetwork.id` in production) — without it, `defaultGateway` is always `undefined`
- [ ] Chain state is read through `connection.viewer` sub-viewers — no raw HTTP calls to the gateway endpoint
- [ ] `connection.viewer` is guarded before use (`?.` or null check) — it is `XyoViewer | undefined`
- [ ] Transactions are submitted through gateway methods (`addPayloadsToChain`, `send`, `sendMany`) or the SDK's phased durable-submission functions (next item) — no manual `TransactionBoundWitness` construction
- [ ] **Signer indexers, and any service that must survive a crash between signing and inclusion, use durable submission.** `addPayloadsToChain` is not a crash-safe boundary — nothing signed survives a crash mid-call, and a retry signs a different transaction. Drive the phases instead: `buildXl1Transaction` → `signXl1Transaction` (`createSignedXl1TransactionEvidence` rebuilds the evidence after a reload) → persist the signed evidence → `writeXl1TransactionContent` → `broadcastXl1Transaction` → `observeXl1TransactionInclusion` / `observeXl1TransactionFinality`. See [Gateway — Durable submission](../xl1-knowledge/gateway.md#durable-submission)
- [ ] Writes are gated on a granted account (lifted from `ConnectAccountsStack`'s `onAccountsChanged`) **and** write capability (`'addPayloadsToChain' in defaultGateway`) — under `GatewayProvider` the capability check alone passes as soon as the wallet extension is installed, before the user grants this site any account
- [ ] **No hand-rolled JSON-RPC envelopes anywhere.** `grep -rE '"jsonrpc"\s*:' src/` returns nothing. The `"jsonrpc"` field is required by JSON-RPC 2.0 and is the structural tell of a bypass — catches any direct call regardless of which method name it carries, so the check stays valid as new XL1 viewers are added. Every chain read goes through `connection.viewer.*`; every write goes through gateway methods. See [Gateway — Never Issue Raw RPC Calls](../xl1-knowledge/gateway.md#never-issue-raw-rpc-calls)
- [ ] **No Ethereum JSON-RPC method names anywhere.** XL1 is not an EVM chain. `grep -rE "\b(eth|net|web3|personal|engine)_[a-zA-Z]+\b" src/` returns nothing — these namespaces are defined by the Ethereum spec and do not exist on the XL1 gateway. Replace any hits with XL1 viewer/runner equivalents (`eth_getBalance` → `viewer.account.balance.accountBalance(...)`, `eth_blockNumber` → `viewer.block.currentBlockNumber()`, `eth_sendTransaction` → `gateway.addPayloadsToChain(...)` / `gateway.send(...)`, etc.)
- [ ] **No Ethereum SDKs imported for chain access.** `grep -rE "from ['\"](ethers|viem|web3|@ethersproject|@walletconnect)" src/` returns nothing — these libraries speak the Ethereum JSON-RPC protocol and will not work against XL1, regardless of configuration. Use `@xyo-network/xl1-sdk` instead. (Address compatibility via shared BIP44 derivation is the *only* thing XL1 borrows from Ethereum.)

**Source:** [Gateway](../xl1-knowledge/gateway.md), [Gateway — Never Issue Raw RPC Calls](../xl1-knowledge/gateway.md#never-issue-raw-rpc-calls), [Gateway — Durable submission](../xl1-knowledge/gateway.md#durable-submission), [Browser Gateway](../xl1-knowledge/gateway-browser.md), [Chain Data Indexing — Service § Signer Indexers](../xl1-patterns/chain-data-indexing-service.md#signer-indexers)

---

## Datalake

- [ ] Datalake clients are standalone `RestDataLakeRunner` / `RestDataLakeViewer` — not accessed via `gateway.datalake` (doesn't exist) or `gateway.connection.storage` (a `DataLakeViewer` or `DataLakeRunner` depending on how the gateway was built, and it may point elsewhere)
- [ ] Datalake clients are constructed with the `createRestDataLakeRunner(endpoint)` / `createRestDataLakeViewer(endpoint)` factories from `@xyo-network/xl1-sdk` — not by calling `.create({ context, endpoint })` directly
- [ ] Off-chain payloads are inserted into the dApp's datalake **before** submitting the transaction — the wallet does not do this automatically
- [ ] The dApp does not assume the wallet's datalake covers its persistence needs — wallet and dApp are independent datalake clients
- [ ] Off-chain payloads are read back from the dApp's datalake, never assumed hydrated by the gateway — block-walk indexers scan each `TransactionBoundWitness` for matching `payload_schemas[]`, gather the parallel `payload_hashes[]`, and fetch the bodies with `createRestDataLakeViewer(endpoint).get(hashes)` on the endpoint the submit path writes to. (No `connection.viewer` read — block reads, `transaction.byHash`, `block.payloadsByHash` — returns off-chain bodies; they return only the gateway store's on-chain payloads.)

**Source:** [Gateway — Accessing the Datalake](../xl1-knowledge/gateway.md#accessing-the-datalake), [Datalakes](../xl1-knowledge/datalakes.md)

---

## Wallet & Identity

- [ ] `Account.random()` is not used for user-facing wallet connections — it is for tests and non-interactive scripts only
- [ ] `ConnectAccountsStack` handles the wallet connection UI — no custom connection/disconnection UI that duplicates its functionality
- [ ] `ConnectAccountsStack` is rendered unconditionally — it manages both unconnected and connected states
- [ ] The granted accounts are lifted into app-level state via `onAccountsChanged`; the dApp keeps its chosen account there, clears it when the callback reports `[]` (revoked), and passes it down as props. `onAccountConnected` (a compatibility prop — first account only, never called on revoke) is not used to lift the address, and `useConnectAccount()` is not called in multiple components
- [ ] When the wallet extension is missing, the UI prompts the user to install it — no silent fallback to a random account
- [ ] Permission requests ask for `xyoWallet_getAccounts` only — its grant also covers `xyoSigner_address`, so there is no separate signer request — and `xyoDataLakes_get` / `xyoDataLakes_insert` are never requested (datalake access from a dApp is plain HTTP via `RestDataLakeRunner` / `RestDataLakeViewer`)
- [ ] The SDK's datalake components (`DataLake*` buttons and panels, `ApprovedLakeSelector`) are not rendered — they drive the wallet's internal `xyoDataLakes_*` methods
- [ ] The connection UI is restyled, if at all, through `ConnectAccountsStack`'s slot props (`AccountComponent`, `ConnectComponent`, `LoadingComponent`, `NoWalletInstalledComponent`) — not by wrapping or forking it

**Source:** [Browser UX — Wallet Connection](../xl1-patterns/browser-ux.md), [Wallet — Permissions](../xl1-patterns/wallet.md#permissions)

---

## SDK-First

- [ ] Payloads are built with `PayloadBuilder` — not raw object literals (`{ schema: '...', field: val }`)
- [ ] New application identity, references, commitments, cache keys, and deduplication use `PayloadBuilder.hash()`; each `dataHash` use cites an explicit protocol requirement. Never use a native digest of `JSON.stringify` as a substitute
- [ ] BoundWitnesses are built with `BoundWitnessBuilder` — field arrays are never constructed manually
- [ ] Datalake access uses `RestDataLakeRunner` / `RestDataLakeViewer` — not raw `fetch()` to the endpoint
- [ ] New types follow the Zod-first pattern: Zod schema is source of truth, TS type derived via `z.infer`, guards via `zodIsFactory` / `zodAsFactory` / `zodToFactory`
- [ ] Payloads read from the chain or datalake are filtered through Zod-factory guards (`isXxxPayload`) before being honored — `payload.schema === '...'` is a tag check, not a validator. `isPayloadOfSchemaType` is not a substitute
- [ ] Schemas are created with `asSchema('com.example.app.entity', true)` — not bare string literals

**Source:** [Protocol Best Practices](../xyo-knowledge/best-practices.md), [Development on XL1](../xl1-knowledge/development.md), [Datalakes](../xl1-knowledge/datalakes.md)

---

## Payload & Schema Design

- [ ] Application fields do not use `_*` or `$*` prefixes — these are reserved for storage infrastructure and client metadata
- [ ] Schema names use nonempty ASCII `[a-z0-9]` segments separated by single dots, within a namespace the author controls. No hyphens, Unicode, empty segments, or silent domain normalization; `network.xyo.*` is reserved
- [ ] New schema names have no structural `.v1` / `.1` suffix. Preserve historical identifiers unless an explicit migration calls for changes
- [ ] `$version` uses SDK radix-1,000 helpers; omitted means `1.0.0` without injection. Typed guards check supported version and shape with no downgrade fallback
- [ ] Published definitions are immutable; open/closed policy, nested closure, metadata handling, and stable field meanings are explicit. Compatibility tests cover both reader directions and stored history
- [ ] Original hashes and version support are checked before projections; `$version` is never stripped then treated as omitted. Unbound version metadata cannot weaken authorization/signature/consensus rules
- [ ] Validator caches use `(schema, effectiveVersion)`; payload-validation caches include root hash plus applicable policy, not data hash alone
- [ ] Each payload type represents one concept — game state, move, and result are separate schemas, not one combined payload
- [ ] Related payloads are referenced by hash (`$sources`), not embedded inside other payloads

**Source:** [Payload Schema Evolution and Identity](../xyo-knowledge/payload-schema-evolution.md), [Protocol Best Practices — Payload Design](../xyo-knowledge/best-practices.md), [Protocol Primitives](../xyo-knowledge/primitives.md)

---

## Indexer Floor Block

- [ ] `INDEXER_FLOOR_BLOCK` is set in `.env` for every chain the dApp targets — captured during development, not at deploy time
- [ ] Bounded dApps (any with self-authored `com.<your-org>.<app>.*` schemas) use a captured chain head as the floor
- [ ] Unbounded indexers (transfer ledgers, substrate indexers, XRC-20 ledgers) explicitly set `INDEXER_FLOOR_BLOCK=0` — never silently default
- [ ] Browser dApps that read chain data directly also expose the floor as `VITE_INDEXER_FLOOR_BLOCK`, with backward walks bounded at it
- [ ] The indexer fails closed when `INDEXER_FLOOR_BLOCK` is missing — no implicit floor of `0`
- [ ] Each environment (mainnet, sequence, devnet) has its own `.env` with its own captured floor — no reuse across chains

**Source:** [Chain Data Indexing — Floor Block](../xl1-patterns/chain-data-indexing-protocol.md#floor-block), [Chain Data Indexing — Service](../xl1-patterns/chain-data-indexing-service.md)

---

## Provider Architecture

- [ ] App needs read-only access without wallet? Uses `GatewayProvider` + `InPageGatewaysProvider` — not `WalletGatewayProvider`
- [ ] `InPageGatewaysProvider` sets `transport="rest"` — not left to the `'rpc'` default
- [ ] Only one browser system per network — a React app does not launch `launchXl1BrowserGatewaySystem` alongside `InPageGatewaysProvider`
- [ ] App strictly requires wallet? Uses `WalletGatewayProvider`
- [ ] Read-only components (history, leaderboards, explorers) are placed outside the wallet connection gate — they need no wallet
- [ ] Public chain reads under `GatewayProvider` use `gateways.inPageGateway` from `useProvidedGateway()` — not `defaultGateway`, which is the wallet's gateway whenever the extension is installed and `undefined` while wallet discovery runs
- [ ] **Multi-user derived views (game history, leaderboards, market listings) read the companion service's index** via relative `fetch('/api/…')` — not a browser chain walk. The in-page gateway serves only bounded lookups — a transaction by hash, a block by number, the finalized head — with off-chain payloads fetched from the dApp's datalake by hash. Any browser-side block walk that remains (a `blockByNumber` / `blocksByNumber` loop in the app package) is labelled prototype-only and bounded below at `VITE_INDEXER_FLOOR_BLOCK`
- [ ] Wallet-gated components (submit move, create game) check for a granted account and write capability before rendering action controls

**Source:** [In-Page Data Lakes](../xl1-patterns/in-page-datalakes.md), [Chain Data Indexing — Client](../xl1-patterns/chain-data-indexing-client.md), [Browser ↔ Service Wiring](../xl1-patterns/browser-service-wiring.md), [Browser Gateway](../xl1-knowledge/gateway-browser.md)

---

## Browser ↔ Service Wiring (if there's both an app and a service)

- [ ] Service routes mount under `/api/*` — never at the root or under app-specific paths
- [ ] React app calls the service with relative URLs (`fetch('/api/...')`) — no `VITE_API_URL`, no hardcoded `http://localhost:3001`, no `window.location.origin` concatenation
- [ ] App's `vite.config.ts` has a `server.proxy` rule for `/api` → `http://localhost:3001` with `changeOrigin: true`
- [ ] Service `PORT` defaults to `3001`; app's Vite `server.port` is `3000`
- [ ] No CORS middleware on the service — the default same-origin topology has nothing to CORS for. Adding `cors()` "just in case" is the anti-pattern
- [ ] Workspace root has a `dev` script that runs app + service concurrently (`pnpm -r --parallel run dev`)
- [ ] If the dApp deliberately runs cross-origin (escape hatch), the choice is documented, the CORS allowlist is explicit (not `*` for credentialed routes), and the preflight path was tested

**Source:** [Browser ↔ Service Wiring](../xl1-patterns/browser-service-wiring.md)

---

## Headless Verification

- [ ] A Node verification script exercises the dApp's happy path end-to-end — `GatewayBuilder.buildRunner()` against a seed phrase from `.env`, no browser involved
- [ ] The script imports the dApp's own domain functions (e.g., `submitMove`, `revealMove`) — does not re-implement payload construction or transaction logic
- [ ] Domain functions accept a runner/gateway as a parameter so the same code runs in both browser and Node contexts
- [ ] The signing account is derived via `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')` and passed to `.account(account)` — addresses match what MetaMask / XYO extension show on the same seed
- [ ] Multi-party flows derive distinct signers (`derivePath('0')`, `derivePath('1')`, …) and build one runner per signer
- [ ] The script reads back through `connection.viewer` after submission, and fetches the off-chain bodies from the dApp's datalake by the tx's `payload_hashes` — confirming the chain accepted the tx and the data shape is correct. This proves the **chain edge**; if the UI also reads from a service surface, see the next two items
- [ ] If the dApp exposes derived state through a service (REST API, GraphQL, WebSocket — anything the UI calls that is not directly `connection.viewer`), the verification script also reads back through that service surface. **Do not synthesize derived state via direct hash lookups (datalake `get(hashes)`, `viewer.block.payloadsByHash`) in the verify script** — that proves the agent can do the indexer's job, not that the indexer is doing it. The whole point of the service round-trip is to exercise the path the UI exercises
- [ ] Before declaring "the service is just behind, not buggy," the script asserts BOTH `viewer.finalization.headNumber() ≥ blockContaining(txHash)` AND `indexer.lastIndexedBlock ≥ blockContaining(txHash)` (read from the indexer's progress endpoint — see [Chain Data Indexing — Service § Progress Endpoint](../xl1-patterns/chain-data-indexing-service.md#progress-endpoint)). If both watermarks are past the tx block and the service still returns empty, that is a bug. "Sequence is slow" is not a valid explanation when both watermarks have advanced
- [ ] `confirmSubmittedTransaction` calls pass explicit options for non-local networks (e.g., `{ attempts: 30, delay: 10_000 }` for Sequence) — defaults time out before finalization
- [ ] Seed phrase loads from `.env` via `dotenv/config`; never logged, committed, or echoed to console
- [ ] Script defaults to a non-mainnet network (e.g., `XL1_NETWORK=sequence`) — explicit override required to point at mainnet
- [ ] **(if local vitest chain)** Prefer `@xyo-network/dapp-kit-vitest-config` `local-xl1` for public/dapp-kit consumers (its own `apiLocal` installer is also public); use the restricted `@xyo-network/xl1-vitest-config` `apiLocal` harness only when its XYO-internal packages are available — see [dApp Kit Vitest](local-chain-dapp-kit-vitest.md)

**Source:** [Headless Testnet Verification](headless-testnet-verification.md)

---

## Architecture principles (if state matters to more than one party)

- [ ] The [review questions](../xl1-patterns/architecture-principles.md#review-questions) are answered in the design or completion summary — in particular: one engine drives every interface; state recomputes from chain + datalakes alone; cold-load reads do not grow with history; every "first" / "latest" / completeness rule has a bound
- [ ] No payload declares its own author or time; the signer is the author and the block is the clock
- [ ] Index output never grants authority (signing, sponsorship, settlement) without a source check

**Source:** [dApp Architecture Principles](../xl1-patterns/architecture-principles.md)

---

## dApp Kit (if using `@xyo-network/dapp-kit*` / `xl1.dapp.json`)

- [ ] `xl1-dapp validate` and `plan --deployment <name>` succeed, and `xl1-dapp test --deployment <name>` passes the deployment's declared verifications (every deployment declares at least one `verification` entry with an `evidence` label)
- [ ] Target placement lives in `xl1.deploy.json`, not `xl1.dapp.json`; a Kubernetes/Proxmox target plan is schema-only and is not a deployment
- [ ] Clients use **application ports** / documented status — not a one-off shadow REST schema as the protocol
- [ ] Effect journal / crash recovery expectations are met or explicitly out of scope with reason
- [ ] If event-driven: wake ≠ durable event ≠ subscription cursor ([Events and wakes](../xl1-dapp-kit/events-and-wakes.md))
- [ ] If receiving Event Kit wakes: the public URL uses `createActiveSourceWakeHttpHostAdapter` (grant + active D-005 subscription, pre-auth rate limiter, size caps, deadline) and only admits; reducers run in a separate worker draining `WakeQueue` ([Authenticated Wake Delivery](../xl1-patterns/authenticated-wake-delivery.md))
- [ ] The evidence produced is stated as its runner label (`model` / `deterministic` / `node` / `browser` / `local-xl1` / `local-datalake` / `sequence` / `mainnet`) and L-level; local green (L5 or below) is not hosted (L6/L7) or production (L9) qualification ([Conformance](../xl1-dapp-kit/conformance.md))
- [ ] Local chain automation uses [dapp-kit vitest `local-xl1`](local-chain-dapp-kit-vitest.md) when specs need a vitest-owned chain

**Source:** [XL1 dApp Kit](../xl1-dapp-kit/SKILL.md), [Full local dApp stack — dapp-kit](local-dapp-stack.md#dapp-kit)

---

## Display

- [ ] Hashes (64 chars) and addresses (40 chars) are clamped to a readable prefix + suffix (e.g., `a1b2c3d4...ef567890`)
- [ ] Every clamped value provides a copy-to-clipboard action
- [ ] Every surfaced chain primitive (address, block, transaction, payload, list view) links to the corresponding Explorer page, with the URL built via `ExplorerLinks` from `@xyo-network/xl1-sdk` — no hand-concatenated explorer paths

**Source:** [Browser UX — Display Conventions](../xl1-patterns/browser-ux.md)

---

## Commit-Reveal (if applicable)

- [ ] Salts are never stored on-chain during the commit phase
- [ ] Salts use `crypto.getRandomValues` with 32+ bytes — not timestamps, counters, or predictable values
- [ ] Choices are always hashed with a salt — never without
- [ ] Validity windows use `nbf`/`exp` (`BlockDurationZod` from `@xyo-network/xl1-sdk`) — not bespoke `commitDeadline`/`revealDeadline` field names
- [ ] `reveal.nbf >= commit.exp` — the reveal window does not open until the commit window has closed
- [ ] No client-side processing buffer is added to deadline checks (matches `TransactionDurationValidator` semantics)
- [ ] Salts are persisted locally (e.g., `StorageArchivist` with `type: 'local'`) for retrieval during the reveal phase
- [ ] New application commit-reveal verification uses `PayloadBuilder.hash` over the agreed exact preimage; deployed commitment algorithms change only under an explicit migration
- [ ] The commitment preimage binds the committer (the commit transaction's `from`) and the session topic; verification requires reveal-transaction `from` === commit-transaction `from` and recomputes with that address — no `from`/`committer` field in commit or reveal payloads, and indexers key commits/reveals by `(topic, signer)`, not by payload hash alone
- [ ] Commits `$sources` to the market/session terms; reveals `$sources` to their commit — building a traversable audit DAG

**Source:** [Commit-Reveal Primitive](../xl1-patterns/commit-reveal.md)

---

## Settlement & Authorities (if applicable)

- [ ] The session payload (market/exchange/auction) declares an `outcomeAuthorities: Address[]` list — never relies on "the market creator" implicitly
- [ ] Settlement payloads are lean — `{ outcome, terms: <hash> }` shape — supporting evidence (verified reveals, attestations) rides as BW co-payloads
- [ ] Winners/recipients are *derived* from the settlement BW + verified reveals — not stored inline on the outcome payload
- [ ] Any cached results view (e.g., `MarketResultsViewPayload`) is clearly marked non-authoritative; `$sources` to the settlement payload it derives from
- [ ] Settlement gate re-runs the entry gate before signing — never trusts caller-supplied verified state
- [ ] Settlement gate re-verifies every reveal against its committed exact preimage (`PayloadBuilder.hash` for new application contracts) before bundling it into the settlement BW — against its signer's own commit (reveal-tx `from` === commit-tx `from`)

**Source:** [Commit-Reveal Prediction Markets — Validation Gates](../xl1-patterns/commit-reveal-prediction-markets.md#validation-gates), [Atomic Exchange — Validation Gates](../xl1-patterns/atomic-exchange.md#validation-gates)

---

## Multi-Party Co-Signing (if applicable)

- [ ] Joint commitments use a single multi-signer BoundWitness (`.signers([a, b, ...])` when every key is in one process; `.participant(s)` + `cosignBoundWitness` when parties sign in separate processes — see [sequential cosigning](../xyo-knowledge/primitives.md#parties-in-separate-processes-sequential-cosigning)) — not parallel single-signer BWs that a verifier would have to correlate
- [ ] Every multi-signer BW is signature-checked with `BoundWitnessValidator` (`(await new BoundWitnessValidator(bw).validate()).length === 0`) before any membership check — `addressesContainsAll` / `addressesContainsAny` test membership in `addresses` only, not signatures
- [ ] "All parties must agree" checks use `addressesContainsAll(bw, parties)` from `@xyo-network/sdk`, on a validated BW
- [ ] "Any authorized authority may sign" checks use `addressesContainsAny(bw, authorities)` on a validated BW, with a non-empty `authorities` list (an empty list returns `true`)
- [ ] Multi-sig parties (a party with several addresses) require *all* of that party's addresses to co-sign their secret reveal — not any one of them

**Source:** [Protocol Primitives — Multi-Signer BoundWitnesses](../xyo-knowledge/primitives.md#multi-signer-co-witnessed-boundwitnesses), [Atomic Exchange](../xl1-patterns/atomic-exchange.md)

---

## Statement Graph (if applicable)

- [ ] Every claim sets `subject` and is published with `publishStatements` (claim elevated, every claimed object in the same transaction, no `$` metadata on claimed objects)
- [ ] Vocabulary schemas live under a namespace you control (`com.<org>.*`), not `network.xyo.*`
- [ ] Statement Graph version matches its composers' peer ranges (`~0.5.x` while Event Kit 2.2 / Service Kit 0.2 peer `^0.5`); pre-fold-4 checkpoints are deleted or rescanned

**Source:** [Statement Graph](../xl1-patterns/statement-graph.md)
