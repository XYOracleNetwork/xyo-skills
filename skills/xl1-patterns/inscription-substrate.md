# Inscription Substrate

Read this pattern when your application needs **persistent, transferable, owned objects on XL1** — the equivalent of Bitcoin's Ordinals. Inscriptions are arbitrary content that has identity, ownership, and a transfer history derived from on-chain BoundWitnesses.

This pattern is the substrate. Higher-layer protocols (fungible tokens, collections, recursive content) compose on top of it. See [Fungible Tokens](fungible-tokens.md) for the canonical example.

**Builds on:**
- [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md) — the foundational decomposition this pattern exploits
- [Chain Data Indexing](chain-data-indexing-protocol.md) — schema-based payload submission and read models
- [In-Page Data Lakes](in-page-datalakes.md) — read-only browse without a wallet
- [Gateway](../xl1-knowledge/gateway.md) — `connection.viewer.finalization` for finalized state, `connection.viewer.block` for block reads (on-chain payloads only)
- [Datalakes](../xl1-knowledge/datalakes.md) — off-chain payload storage referenced by on-chain hash

---

Ordinal inscription IDs and sentinel/burn derivation are existing **data-hash** contracts. Preserve their algorithms; root hashes are the default for new application contracts outside this substrate. Never substitute `_hash` for `_dataHash` when metadata is present. See [Payload Schema Evolution and Identity](../xyo-knowledge/payload-schema-evolution.md).

## The Problem

Bitcoin Ordinals binds arbitrary data to a specific satoshi, making the inscription transferable through Bitcoin's UTXO graph. The chain orders the inscriptions; off-chain indexers track ownership.

XL1 has no UTXO and no satoshi. It is account-based. But XL1 *does* have the property Ordinals depends on: **the chain orders signed BoundWitnesses without interpreting their payload contents**, and off-chain datalakes hold the payload bytes. We can build an inscription substrate that is structurally analogous to Ordinals, with one strict improvement — ownership is derived from cryptographic signatures on transfer events rather than implicit UTXO custody.

---

## Concepts

### Artifacts vs. events

The substrate distinguishes two payload kinds:

- **Artifacts** — persistent objects with stable identity. An *inscription* is an artifact. Its ID is content-addressed (the payload's data hash), so byte-identical content collapses to a single artifact. Ownership is established by the first finalized BoundWitness referencing that payload, and can be transferred by subsequent events.
- **Events** — fire-and-forget state changes. A *transfer* is an event. It references an artifact ID, declares a new owner, and is processed by indexers in canonical order. Events do not have IDs of their own; they are not addressable.

This split is what makes the substrate scale cleanly to higher layers. Token operations like `mint` and `transfer` are events; deploy declarations are artifacts.

### Identity is content-addressed; authorship is structural

The inscription ID is the data hash of the inscription payload. The actor — the inscriber, the transferer, the eventual owner — is derived from the wrapping BoundWitness signer, never from a payload field. See [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md) for why.

### Indexers derive state from finalized blocks only

XL1 reorgs are bounded but possible until finality. An ownership ledger that updates from unfinalized blocks can show ownership transitions that later disappear. Indexers must read from `connection.viewer.finalization` to bound their derivation.

---

## Pattern Overview

```
Inscribe                                   Browse
  │                                          │
  ▼                                          ▼
PayloadBuilder ──► datalakeRunner.insert    finalization viewer
  │                       │                  │
  ▼                       ▼                  ▼
addPayloadsToChain    durable storage    indexer (diviner)
  │                                          │
  ▼                                          ▼
TransactionBoundWitness ──────────────► canonical ownership ledger
  (from = signer, references payload hash)
```

1. **Define inscription and transfer schemas** under `network.xyo.ordinal.*`
2. **Submit inscriptions** via `addPayloadsToChain([], [inscription])` — datalake stores the bytes, BoundWitness commits the hash on-chain
3. **Submit transfers** the same way, signed by the current owner
4. **Indexer** follows finalized blocks in order, replays events, maintains an ownership ledger
5. **Browse** by reading the indexer or filtering the datalake by schema

---

## Step 1: Use the Substrate Types

Both schemas ship from the SDK under the chain-agnostic `network.xyo.ordinal.*` namespace — import them rather than redefining. Application schemas built *on top* of the substrate still belong under your own `com.<your-org>.<app>.*` namespace; see [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming).

```ts
import {
  Inscription, InscriptionSchema, isInscription, asInscription,
  OrdinalTransfer, OrdinalTransferSchema, isOrdinalTransfer, asOrdinalTransfer,
} from '@xyo-network/xl1-sdk'
```

### The inscription artifact

Pure declarative content. No `from`, no `creator`, no `owner` — those are derived structurally from the wrapping BoundWitness. Fields:

- `contentType` (string) — MIME type (`'text/plain'`, `'image/png'`, `'application/json'`)
- `content` (string) — base64 for binary, raw for text/JSON

The inscription ID is the data hash of the payload, established by the wrapping BoundWitness rather than any payload field.

### The transfer event

References the target inscription by its content-addressed ID and declares the new owner. The current owner is *not* in the payload — it is derived from the BoundWitness signer at index time. Fields:

- `inscriptionId` (`Hash`) — content-addressed hash of the target inscription
- `to` (`XyoAddress`) — recipient address (declarative content — fact about the world)

`to` is content (a fact the signer is declaring); `from` would be authorship (already on the BoundWitness). Only `to` belongs in the payload.

---

## Step 2: Inscribe

The substrate uses **carrier Path A** (off-chain payload referenced by TransactionBoundWitness) plus **dual sentinel transfers** for free chain-native indexing. See [Chain Data Indexing — Choosing a Carrier](chain-data-indexing-protocol.md#choosing-a-carrier--how-to-anchor-off-chain-data-on-chain) and [Destination as Protocol](chain-data-indexing-protocol.md#destination-as-protocol--a-native-xl1-pattern) for the full landscape.

```ts
import { asXyoAddress, PayloadBuilder } from '@xyo-network/sdk'
import { createTransferPayload, sentinelAddressFromSchema } from '@xyo-network/xl1-sdk'

// Pinned protocol sentinel — equals sentinelAddressFromSchema('network.xyo.ordinal').
// asXyoAddress brands the literal so it can key a transfers map.
const ORDINAL_SENTINEL = asXyoAddress('4b210503f8caa8e82d38617997f2eaf612c0ec04', true)

const inscription = new PayloadBuilder<Inscription>({ schema: InscriptionSchema })
  .fields({ contentType: 'text/plain', content: 'Hello, XL1.' })
  .build()

// The inscription ID. `build()` is synchronous and does NOT attach `_hash` —
// compute the data hash explicitly. See the anti-pattern note below.
const inscriptionId = await PayloadBuilder.dataHash(inscription)

// Per-payload burn address — verifiably no key, bound to this specific inscription
const burnAddress = sentinelAddressFromSchema('network.xyo.ordinal', inscriptionId)

// One Transfer payload, two recipients: protocol sentinel + per-payload burn.
// createTransferPayload builds the chain's TransferSchema payload — { from, epoch, transfers } —
// stamping `epoch` and hex-encoding the bigint AttoXL1 amounts. `from` is the
// signing wallet's XyoAddress (no 0x prefix); it must equal the transaction's `from`.
const sentinelTransfer = createTransferPayload(walletAddress, {
  [ORDINAL_SENTINEL]: 1n,
  [burnAddress]: 1n,
})

// 1. Persist content to the dApp's datalake
await datalakeRunner.insert([inscription])

// 2. Commit on-chain: Transfer at block level, inscription off-chain
const [txHash] = await defaultGateway.addPayloadsToChain([sentinelTransfer], [inscription])
```

The inscription ID is the payload's **data hash**. Treat it as the canonical inscription identifier throughout the application.

> **`build()` does not attach `_hash`.** `PayloadBuilder.build()` is synchronous and returns the plain payload; `_hash` / `_dataHash` are attached only by the async `PayloadBuilder.addHashMeta()` / `addStorageMeta()`. Reading `payload._hash` straight after `build()` yields `undefined` — and because `sentinelAddressFromSchema(schema, payloadHash?)` takes an *optional* second argument, passing `undefined` silently returns the **static protocol sentinel** instead of the per-payload burn address. No error is thrown; the dual-sentinel transfer quietly degrades to a single recipient. Always compute the hash with `await PayloadBuilder.dataHash(payload)` (or read the verified `_dataHash` from hydrated payloads; `_hash` is the root hash and may differ).

The dual sentinel transfer:
- Adds the inscription's transaction to `accountBalanceHistory(ORDINAL_SENTINEL)` — anyone can list every ordinal protocol invocation chain-side, no global indexer required.
- Adds it to `accountBalanceHistory(walletAddress)` — the inscriber and dApps showing "my inscriptions" can find the transaction without scanning every block.
- Burns 2 AttoXL1 to no-key addresses — verifiable real cost per inscription.

If gas economy is critical and you can run a global indexer ([Step 4](#step-4-build-the-indexer)), you may omit the sentinel transfer and rely on the indexer's per-address side-index. The substrate works either way; sentinels are an optional discoverability enhancement, not a correctness requirement.

---

## Step 3: Transfer Ownership

A transfer is signed by the **current owner** (whoever the indexer's ledger shows as the owner of `inscriptionId` at the moment the transfer lands). The same dual-sentinel pattern applies, so transfers are also discoverable via address-scoped balance history.

```ts
const transfer = new PayloadBuilder<OrdinalTransfer>({ schema: OrdinalTransferSchema })
  .fields({
    inscriptionId,          // the inscription's data hash (a Hash — see Step 2), no 0x prefix
    to: recipientAddress,   // the recipient's XyoAddress
  })
  .build()

const transferId = await PayloadBuilder.dataHash(transfer)
const burnAddress = sentinelAddressFromSchema('network.xyo.ordinal', transferId)

const sentinelTransfer = createTransferPayload(currentOwnerAddress, {
  [ORDINAL_SENTINEL]: 1n,
  [burnAddress]: 1n,
})

await datalakeRunner.insert([transfer])
await defaultGateway.addPayloadsToChain([sentinelTransfer], [transfer])
```

The wallet signs the wrapping `TransactionBoundWitness`. The indexer reads `tx.from` to determine who signed, and rejects the transfer if that address is not the current owner of `inscriptionId`. There is no `from` field on the transfer payload to verify against — by construction, only the BoundWitness signer can claim authorship.

---

## Step 4: Build the Indexer

The indexer is the off-chain component that derives the ownership ledger. In production, package it as a diviner module ([Module System](../xyo-knowledge/modules.md)). For prototypes, an in-memory worker is enough.

### Indexing posture: unbounded, ordered, with a permanent floor

The substrate sits at three corners of the indexing-concerns space defined in [Floor Block](chain-data-indexing-protocol.md#floor-block):

- **Unbounded.** Inscriptions and transfers are pre-existing schemas relative to any indexer of the substrate. Floor: `0`.
- **Ordered.** State derivation requires in-order replay — standard for any state-deriving indexer. See [Strategy 1](chain-data-indexing-protocol.md#strategy-1-global-block-walk-forward-iteration).
- **Permanent floor.** Unlike most ordered + unbounded indexers, the substrate's floor cannot be raised retroactively. Canonical authorship — "the first finalized BoundWitness referencing this content hash wins" — is established by *first appearance*, and first appearance is only observable by walking from genesis. Skipping early blocks silently miscredits authorship to a later inscriber. An operator standing up a substrate indexer in 2030 still walks from genesis.

This third property distinguishes the substrate from, say, an XL1 balance ledger: the balance ledger is also unbounded + ordered, but a snapshot at block N permits resuming from N+1 without information loss. The substrate doesn't allow the snapshot trick because identity is *established by* the very early blocks the snapshot would skip.

### Indexers built on top of the substrate

A dApp built on top of the substrate — a token deploy, an NFT collection, a recursive content protocol — has two state layers:

- **Substrate ownership state.** Driven by the inscription substrate's replay loop. Unbounded, ordered, permanent floor. The dApp depends on it being authoritative.
- **Application-layer state.** The dApp's own derivations beyond ownership — e.g., a leaderboard of trades, an "inscriptions in this collection" filter, custom metadata indexes.

The application-layer state can have its own `INDEXER_FLOOR_BLOCK` *for the dApp's own handlers*, but the substrate replay underneath the dApp is still unbounded. Mixing modes in one indexer is a [mixed indexer](chain-data-indexing-protocol.md#mixed-indexers--the-escape-hatch), with the same caveat: as soon as one schema's floor is `0`, the scan hydrates every block from genesis and the bounded benefit is lost. The honest framing is: **substrate-dependent dApps are unbounded indexers in practice**; the per-handler bounded floor only suppresses application work, not block reads.

If the dApp wants real bounded performance, it must split: one process runs the substrate indexer (unbounded), exposes its derived ownership ledger as a service, and the bounded application-layer indexer consumes that service rather than re-deriving from raw blocks.

### State shape

The substrate's record is intentionally schema-agnostic. Anything with an artifact-shaped lifecycle — a plain inscription, a token deploy, a collection root — goes in the same map. Schema-specific details live in higher-layer state alongside it.

```ts
import type { Hash } from '@ariestools/sdk'
import type { Payload, XyoAddress } from '@xyo-network/sdk'
import type { XL1BlockNumber } from '@xyo-network/xl1-sdk'

type ArtifactRecord = {
  id: string                    // content-addressed hash — the artifact ID
  creator: XyoAddress           // signer of the BoundWitness that introduced it
  owner: XyoAddress             // current owner — updates as transfers replay
  payload: Payload              // the artifact's declarative content (any schema)
  inscribedAt: XL1BlockNumber   // block height at which it was first finalized
}

type IndexerState = {
  artifacts: Map<string, ArtifactRecord>
  byOwner:   Map<XyoAddress, Set<string>>  // per-address side-index — see Scan Strategies §3
  lastProcessedHash?: Hash                  // checkpoint: hash of the last applied block (resume cursor)
  lastProcessedBlock?: XL1BlockNumber       // checkpoint: its height (ordering, display)
}
```

The `byOwner` side-index is maintained alongside `artifacts` during replay. It costs no extra block reads and turns "show me address X's inscriptions" into a single map lookup — see [Scan Strategies — Strategy 3](chain-data-indexing-protocol.md#strategy-3-indexer-maintained-per-address-side-index-forward-iteration).

### Replay loop

A hydrated block is a tuple `[BlockBoundWitness, Payload[]]` where the payloads array contains the block's **on-chain** payloads only — system payloads and the `TransactionBoundWitness` instances that introduced application data. The off-chain inscription / transfer payloads referenced by each `TransactionBoundWitness.payload_hashes[]` are **not** in `payloads`, even with a datalake configured (see [Gateway — What `block.blockByNumber` returns](../xl1-knowledge/gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow)).

The `TransactionBoundWitness` is the structural carrier of authorship — its `from` field is the signer, its `payload_hashes[]` lists the wrapped payload hashes, and its parallel `payload_schemas[]` tells you what each one is *without* fetching it. The replay applies one finalized block at a time in a three-pass scan: list every substrate hash the block's transactions reference, in canonical order, each paired with *its own* transaction's signer; fetch the distinct off-chain bodies once from the datalake with `datalakeViewer.get(...)` (no gateway read returns them); then apply the refs in order, looking each body up by hash.

```ts
import type { Hash } from '@ariestools/sdk'
import type { Payload, WithHashMeta, XyoAddress } from '@xyo-network/sdk'
import { isAnyPayload, PayloadBuilder } from '@xyo-network/sdk'
import type { SignedHydratedBlockWithHashMeta } from '@xyo-network/xl1-sdk'
import {
  createRestDataLakeViewer, isTransactionBoundWitness, NetworkDataLakeUrls,
} from '@xyo-network/xl1-sdk'

const SUBSTRATE_SCHEMAS = new Set<string>([InscriptionSchema, OrdinalTransferSchema])

// Bodies are read from the datalake the inscribe/transfer path writes to
// (datalakeRunner's endpoint): the dApp's configured endpoint, defaulting to the network's
const DATALAKE_ENDPOINT = appConfig.dataLakeEndpoint ?? NetworkDataLakeUrls[networkId]
const datalakeViewer = await createRestDataLakeViewer(DATALAKE_ENDPOINT)

/** One occurrence of a substrate hash in a block, kept with the signer of the transaction that listed it */
interface SubstrateRef {
  hash: Hash
  /** `from` of the TransactionBoundWitness that carried this hash */
  signer: XyoAddress
  /** That transaction's hash, and this hash's position in its payload_hashes[] */
  txHash: Hash
  index: number
}

/**
 * Pass 1: substrate refs in canonical order — transactions in the order the block
 * lists them (its own payload_hashes[]), then each transaction's payload_hashes[]
 * in order. One ref per occurrence: two transactions carrying a byte-identical
 * payload (two identical mints, a copied event) are two refs with two signers.
 */
function substrateRefs([blockBw, blockPayloads]: SignedHydratedBlockWithHashMeta): SubstrateRef[] {
  const onChain = new Map(blockPayloads.map(p => [p._hash, p]))
  const refs: SubstrateRef[] = []
  for (const txHash of blockBw.payload_hashes) {
    const tx = onChain.get(txHash)
    if (!isTransactionBoundWitness(tx)) continue
    // payload_hashes[i] / payload_schemas[i] are parallel arrays — read both together
    for (let index = 0; index < tx.payload_hashes.length; index++) {
      if (SUBSTRATE_SCHEMAS.has(tx.payload_schemas[index])) {
        refs.push({
          hash: tx.payload_hashes[index], signer: tx.from, txHash, index,
        })
      }
    }
  }
  return refs
}

/**
 * Pass 2: fetch each distinct body once from the datalake — no gateway read
 * (block reader or payloadsByHash) returns off-chain bodies. `get` omits hashes
 * it doesn't hold (positions shift) and promises no order, so key the result by
 * hash, never by position. The datalake is untrusted storage: addHashMeta recomputes
 * `_hash` / `_dataHash` from each body, so a body is only found under the hash
 * it actually hashes to.
 */
async function fetchBodies(refs: SubstrateRef[]): Promise<Map<Hash, WithHashMeta<Payload>>> {
  const hashes = [...new Set(refs.map(ref => ref.hash))]
  if (hashes.length === 0) return new Map()
  const fetched = (await datalakeViewer.get(hashes)).filter(isAnyPayload)
  const hashed = await PayloadBuilder.addHashMeta(fetched)
  return new Map(hashed.map(body => [body._hash, body]))
}

/** Apply one finalized block — the driver below calls this once per block, in order */
async function applySubstrateBlock(state: IndexerState, block: SignedHydratedBlockWithHashMeta): Promise<void> {
  const blockHeight = block[0].block
  const refs = substrateRefs(block)
  const bodies = await fetchBodies(refs)

  // Pass 3: apply every ref in canonical order, under its own transaction's signer
  for (const { hash, signer } of refs) {
    const p = bodies.get(hash)
    if (!p) continue // not in the datalake, or no fetched body hashes to it — drop

    if (isInscription(p)) {
      registerArtifact(state, p, signer, blockHeight)
    } else if (isOrdinalTransfer(p)) {
      applyTransfer(state, p, signer)
    }
  }
}
```

Each ref keeps a hash paired with its own transaction's signer — **not** a `hash → signer` map. A map collapses repeated hashes: when two transactions in a block carry a byte-identical payload, the last writer wins, one event is lost, and the surviving one can be credited to the wrong signer. The datalake returns bodies with missing hashes omitted and no ordering guarantee, so apply order comes from the refs, never from the fetched array. This is the same per-transaction pairing as [Commit-Reveal — Binding Commits to Identity](commit-reveal.md#binding-commits-to-identity). The schema filter in pass 1 keeps the datalake `get` call narrow to substrate-relevant payloads only.

### A note on `tx.from` vs `transfer.from`

The actor for any application payload is `transactionBoundWitness.from`. The sentinel `Transfer` payload accompanying an inscription has its own `from` field, but the indexer doesn't read it — the chain's balance validator already enforces `transfer.from === tx.from`, and reading authorship out of payload content would mix declarative content with structural authorship.

Chain-native consumers using [Scan Strategy 4](chain-data-indexing-protocol.md#strategy-4-sentinel-transfer-typically-backward) end up reading `transfer.from` because that's what `accountBalanceHistory` returns directly — they arrive at the same minter address by a different path. Both views agree by construction.

### Register an artifact

Content-addressed identity means duplicates collapse harmlessly. First-finalized wins. Higher layers (token deploys, collection roots) reuse this same registration to participate in the substrate's transfer mechanism.

```ts
function registerArtifact(
  state: IndexerState,
  payload: WithHashMeta<Payload>,  // verified root and data hash metadata
  signer: XyoAddress,
  blockHeight: XL1BlockNumber,
) {
  const id = payload._dataHash // ordinal identity uses the prescribed data hash
  if (state.artifacts.has(id)) return // identical content already registered; ignore
  state.artifacts.set(id, {
    id,
    creator: signer,
    owner: signer,
    payload,
    inscribedAt: blockHeight,
  })
  addToOwner(state, signer, id)
}

function addToOwner(state: IndexerState, owner: XyoAddress, id: string) {
  if (!state.byOwner.has(owner)) state.byOwner.set(owner, new Set())
  state.byOwner.get(owner)!.add(id)
}
```

### Apply a transfer

Three structural changes: validate target exists, validate signer is current owner, then move the artifact ID from the old owner's side-index to the new owner's. No payload field carries authorship; the only `from` we accept is the BoundWitness signer.

```ts
function applyTransfer(
  state: IndexerState,
  payload: OrdinalTransfer,
  signer: XyoAddress,
) {
  const record = state.artifacts.get(payload.inscriptionId)
  if (!record) return                       // unknown target — drop
  if (record.owner !== signer) return       // unauthorized — drop

  state.byOwner.get(record.owner)?.delete(record.id)
  record.owner = payload.to
  addToOwner(state, payload.to, record.id)
}
```

Drops are silent and intentional. A misaddressed or unauthorized transfer is a malformed event, not a chain-level fault — the chain accepted it because the chain is content-agnostic. The indexer's job is to filter to the canonical interpretation.

### Polling cadence

Don't hand-roll a `setInterval` block walk. Drive `applySubstrateBlock` from a finalized block stream — it polls the finalized head for you, delivers each finalized block once and in order, and verifies continuity from your checkpoint hash. Checkpoint `{ hash, number }` after every block. Seed `after` explicitly on cold start: with no `after`, `blocks()` starts at the current head and skips history. The substrate's floor is permanently `0`, so a cold start always applies genesis first:

```ts
import type { XyoGateway } from '@xyo-network/xl1-sdk'
import { asXL1BlockNumber, finalizedBlockStreamFromGateway } from '@xyo-network/xl1-sdk'

async function followFinalizedBlocks(gateway: XyoGateway, state: IndexerState): Promise<void> {
  const viewer = gateway.connection.viewer
  if (!viewer) throw new Error('Gateway has no viewer attached')

  let after = state.lastProcessedHash
  if (after === undefined) {
    // Cold start at the permanent floor. Nothing precedes genesis and `blocks()`
    // has no genesis option, so apply block 0 directly, then resume after it.
    const genesis = await viewer.block.blockByNumber(asXL1BlockNumber(0, true))
    if (!genesis) throw new Error('Genesis block unavailable')
    await applySubstrateBlock(state, genesis)
    state.lastProcessedHash = genesis[0]._hash
    state.lastProcessedBlock = genesis[0].block
    await saveCheckpoint(state)
    after = state.lastProcessedHash
  }

  const stream = await finalizedBlockStreamFromGateway(gateway)
  for await (const { block } of stream.blocks({ after })) {
    await applySubstrateBlock(state, block)
    state.lastProcessedHash = block[0]._hash
    state.lastProcessedBlock = block[0].block
    await saveCheckpoint(state) // persist the ledger and { hash, number } together
  }
}
```

The cadence knob is the stream's `pollIntervalMs` option (`finalizedBlockStreamFromGateway(gateway, { pollIntervalMs })`; default 10 s, minimum 5 s). Persist `artifacts`, `byOwner`, and the checkpoint atomically so a crash resumes from `lastProcessedHash` without re-applying a block. Stream contract, resume splice, and `FinalizedBlockStreamDesyncError`: [Chain Data Indexing — Service § Finalized block stream](chain-data-indexing-service.md#finalized-block-stream).

---

## Step 5: Browse

Four browse paths, picked by what the UI needs and what infrastructure is available. See [Chain Data Indexing — Scan Strategies](chain-data-indexing-protocol.md#scan-strategies--reading-indexed-data) for the full taxonomy.

### All inscriptions of a given content type

Walk the chain and use the two-step pattern: each block read returns the on-chain `TransactionBoundWitness` instances, you scan their `payload_schemas[]` for the inscription schema, then fetch the matching `payload_hashes[]` from the datalake with `datalakeViewer.get(...)`. Inscription payload bodies live in the datalake — they are not in `block[1]` (see [Gateway — What `block.blockByNumber` returns](../xl1-knowledge/gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow)). For an explorer-style "all inscriptions ever" view, persist `lastSeenBlock` between sessions so each load only walks new blocks; for a recent-window view, walk from `head - WINDOW`.

```ts
import { asXL1BlockNumber, isTransactionBoundWitness } from '@xyo-network/xl1-sdk'

// datalakeViewer — RestDataLakeViewer on the dApp's DATALAKE_ENDPOINT (see Replay loop)
const viewer = defaultGateway.connection.viewer
if (!viewer) throw new Error('Gateway has no viewer attached')

const head = Number(await viewer.finalization.headNumber())
const inscriptions: Inscription[] = []
for (let n = lastSeenBlock + 1; n <= head; n++) {
  const hydrated = await viewer.block.blockByNumber(asXL1BlockNumber(n, true))
  if (!hydrated) continue
  const [, payloads] = hydrated

  const inscriptionHashes: Hash[] = []
  for (const p of payloads) {
    if (!isTransactionBoundWitness(p)) continue
    for (let i = 0; i < p.payload_hashes.length; i++) {
      if (p.payload_schemas[i] === InscriptionSchema) {
        inscriptionHashes.push(p.payload_hashes[i])
      }
    }
  }
  if (inscriptionHashes.length === 0) continue

  const fetched = await datalakeViewer.get(inscriptionHashes)
  inscriptions.push(...fetched.filter(isInscription))
}
```

Do not reach for `datalakeViewer.next({ allowedSchemas: [InscriptionSchema] })` — the XL1 datalake is content-addressed and has no cursor pagination, so `.next()` is an unbounded scan with no chain context. See [Datalakes — How to read](../xl1-knowledge/datalakes.md).

### Ownership-aware browsing (per-address side-index)

Query the indexer (or its diviner equivalent). The indexer's `artifacts` map plus a `byOwner: Map<XyoAddress, Set<ArtifactId>>` side-index ([Strategy 3](chain-data-indexing-protocol.md#strategy-3-indexer-maintained-per-address-side-index-forward-iteration)) is the read model — expose it via a query interface that returns `ArtifactRecord[]` filtered by `owner`, by `creator`, or by ID. This is the canonical "show me my inscriptions" path when you control an indexer.

### Free chain-native per-address browsing (sentinel transfers)

If inscriptions were submitted with the dual-sentinel pattern from [Step 2](#step-2-inscribe), per-address browse is free without any indexer infrastructure. Query `accountBalanceHistory(userAddress)`, filter the returned transactions for ones whose `Transfer` has `ORDINAL_SENTINEL` as a recipient, then take the inscription hash from the transaction's `payload_hashes` and read the off-chain body from the datalake:

```ts
const history = await defaultGateway.connection.viewer?.account.balance
  .accountBalanceHistory(userAddress)

const myInscriptions: Inscription[] = []
for (const [, tx, transfer] of history ?? []) {
  if (!transfer.transfers[ORDINAL_SENTINEL]) continue
  // The inscription is off-chain — fetch it from the datalake by the hash this tx lists
  const hashes = tx.payload_hashes.filter((_, i) => tx.payload_schemas[i] === InscriptionSchema)
  const payloads = await datalakeViewer.get(hashes)
  myInscriptions.push(...payloads.filter(isInscription))
}
```

Anyone can run this against the chain plus a datalake holding the bodies — the discovery is a chain-native query, no diviner trust required.

### Read-only without a wallet

Wrap the dApp in `InPageGatewaysProvider transport="rest"` + `GatewayProvider` ([In-Page Data Lakes](in-page-datalakes.md)). The ownership ledger is a multi-user derived view, so the indexer runs in the companion [service](chain-data-indexing-service.md) and the browser reads it with a relative `fetch('/api/…')`, which needs no wallet. The in-page gateway (`useProvidedGateway()`'s `defaultGateway`) covers bounded chain lookups — a single transaction, a block — and the dApp's datalake viewer returns one inscription's body by hash, so inscriptions, transfers, and ownership are all browsable for unauthenticated visitors.

---

## Anti-Patterns

| Anti-Pattern | Why it fails | Do this instead |
|---|---|---|
| Putting `from`, `creator`, or `owner` in the inscription or transfer payload | Mixes declarative content with structural authorship — creates two sources of truth that can disagree | Derive the actor from `transactionBoundWitness.from` |
| Polling `viewer.block.currentBlockNumber()` for the indexer's replay bound | Includes unfinalized blocks; ownership transitions can be reorged out and the ledger goes stale | Drive replay from `finalizedBlockStreamFromGateway` ([Polling cadence](#polling-cadence)), or use `viewer.finalization.headNumber()` to bound it |
| Using `(blockHeight, payloadIndex)` as the inscription ID | Loses content-addressing — byte-identical inscriptions get separate IDs, breaks idempotency, breaks the deploy-collision-is-a-feature property | Use the payload's data hash (`await PayloadBuilder.dataHash(payload)`, or verified `_dataHash` on hydrated payloads) |
| Reading `payload._hash` right after `PayloadBuilder.build()` | `build()` is synchronous and attaches no hash meta — `_hash` is `undefined`, and `sentinelAddressFromSchema` silently falls back to the static protocol sentinel | `await PayloadBuilder.dataHash(payload)` |
| Attributing fetched bodies through a `hash → signer` map, or applying them in the order the datalake returns them | Byte-identical payloads in two transactions share a hash: the map keeps one signer, drops the other event, and can credit the wrong account; datalake results carry no ordering guarantee, so apply order — and state — can diverge across indexers | Build ordered `{ hash, signer }` refs — one per occurrence, in block and `payload_hashes[]` order — and apply them in that order, looking bodies up by hash ([Replay loop](#replay-loop)) |
| Trusting the chain to validate inscription semantics | The chain validates BoundWitness signatures and balance flows only; inscription/transfer rules are off-chain | Indexer enforces rules (target exists, signer is owner) on replay |
| Committing inscription bytes only to a local archivist before chain submission | The data hash on-chain references bytes nobody else can fetch | Always insert into the dApp's datalake (`RestDataLakeRunner`) before `addPayloadsToChain` |
| Submitting a transfer signed by an account that isn't the current owner | Indexer drops it silently; on-chain fee is wasted; UX appears broken | Read the indexer's current owner before signing a transfer |
| Sending the sentinel transfer to the zero address (`0x0000…0000`) | Zero address is the source of native XL1 minting; its history is enormous and noisy, and protocol activity is unfindable in the noise | Use the protocol-derived sentinel from `sentinelAddressFromSchema(protocolId)` |
| Self-transfer (`from === to`) as a sentinel | Likely filtered as no-op at chain validation; behavior is fragile | Send to a no-key derived address (protocol sentinel or per-payload burn) |
| Publishing a known-key address as the protocol sentinel | Defeats the burn semantic; key-holder could later spend accumulated dust | Always derive sentinels via `sentinelAddressFromSchema(...)` so no key exists |

---

## Key Decisions

| Decision | Guidance |
|---|---|
| Inscribe small text/JSON content? | Embed directly in the `content` field. Keep payloads under tens of KB to keep gas costs predictable |
| Inscribe large media? | Store the binary in an off-chain CDN; inscribe a payload referencing it by content hash. The on-chain inscription is the cryptographic commitment |
| Need transfer atomicity (escrow, atomic swap)? | Out of scope for v1. A composite event protocol on top of the substrate handles this |
| Need to invalidate / burn an inscription? | Define an additional event schema (`network.xyo.ordinal.burn`) and have the indexer remove the record. Out of v1 scope |
| Multiple indexers across operators? | Encouraged. The substrate's rules are deterministic; competing diviners that agree provide social consensus on ledger state. Document the reference implementation; let others replicate |
| Reorg deeper than expected? | Checkpoint (`lastProcessedHash` / `lastProcessedBlock`) only from finalized blocks — the finalized block stream delivers nothing else; the substrate's finalization-only discipline already handles common reorg windows |
| Need free chain-native per-user discovery without running a global indexer? | Use the dual-sentinel pattern in [Step 2](#step-2-inscribe). `accountBalanceHistory(userAddress)` then surfaces every inscription that user submitted, no diviner required |
| Need verifiable real cost per inscription? | Per-payload derived burn address — `sentinelAddressFromSchema('network.xyo.ordinal', await PayloadBuilder.dataHash(payload))`. Each inscription burns dust to a unique no-key address |
| Want both protocol-wide free indexing *and* per-payload burn? | Use both sentinels in one Transfer payload's `transfers` map. One extra payload, two recipients |

---

## Extension: Co-Witnessed Inscriptions

The default inscription payload is a plain declarative `Payload` whose authorship is fully delegated to the wrapping `TransactionBoundWitness`. That covers single-author artifacts — NFTs, ordinary inscriptions, BRC-20-style operations. For artifacts that **need multiple parties to attest to the content itself**, the inscription payload can instead be a `BoundWitness` payload with multiple co-signers baked in.

Use cases that warrant this:

- **Bilateral agreements** — a contract clause inscribed on-chain where both parties co-sign the statement; "who paid gas" is a separate concern from "who agreed"
- **Notarized artifacts** — an artifact co-signed by the creator and a notary, where the notary's signature is part of the artifact's identity
- **Joint statements** — a press release, audit attestation, or governance vote inscribed as an artifact whose authority depends on the full signer set

### Structure

A co-witnessed inscription is a payload with `schema: 'network.xyo.boundwitness'` whose `payload_hashes[]` references the actual content payload (in turn stored in the datalake):

```ts
import { asSchema, BoundWitnessBuilder, PayloadBuilder } from '@xyo-network/sdk'

// The content's own application schema, under your namespace
const ContentSchema = asSchema('com.example.agreement.content', true)

// Content payload — pure declarative
const content = new PayloadBuilder({ schema: ContentSchema })
  .fields({ contentType: 'application/json', content: '...' })
  .build()

// Inscription payload — a BoundWitness co-signed by multiple parties
const [inscription] = await new BoundWitnessBuilder()
  .signers([accountA, accountB, accountC])
  .payloads([content])
  .build()

await datalakeRunner.insert([content, inscription])
await defaultGateway.addPayloadsToChain([], [content, inscription])
```

`.signers([...])` signs every slot at `build()`, so it needs all the parties' keys in one process. When the parties sign from separate processes, reserve their slots by address and have each one cosign in turn — see [Primitives — Parties in separate processes](../xyo-knowledge/primitives.md#parties-in-separate-processes-sequential-cosigning).

The wrapping `TransactionBoundWitness` still has a single `from` (the gas payer); the *artifact's* signer set is `inscription.addresses[]`.

### Indexer changes

When registering a co-witnessed artifact, capture the full signer set, not just the gas payer:

```ts
type CoWitnessedArtifactRecord = ArtifactRecord & {
  cosigners: XyoAddress[]   // all addresses on the inscription BoundWitness
}

function registerCoWitnessedArtifact(
  state: IndexerState,
  payload: WithHashMeta<BoundWitness>,  // from the datalake fetch — hash meta recomputed by addHashMeta
  gasPayer: XyoAddress,
  blockHeight: XL1BlockNumber,
) {
  // Same ID space as every other artifact: the data hash. It is what the cosigners
  // signed and stays fixed as `$signatures` slots fill; `_hash` (root) does not.
  const id = payload._dataHash
  if (state.artifacts.has(id)) return
  const record: CoWitnessedArtifactRecord = {
    id,
    creator: gasPayer,            // who paid to inscribe it
    owner: gasPayer,              // initial owner — could be a different policy
    payload,
    inscribedAt: blockHeight,
    cosigners: payload.addresses, // who attested to the content
  }
  state.artifacts.set(id, record)
  addToOwner(state, gasPayer, id)
}
```

The replay loop above does not see these yet. To index co-witnessed artifacts, add `BoundWitnessSchema` (from `@xyo-network/sdk`) to `SUBSTRATE_SCHEMAS` so pass 1 collects them, and in `applySubstrateBlock` route a body that is a bound witness wrapping an inscription to `registerCoWitnessedArtifact` — after checking its signatures with `BoundWitnessValidator`, since `addresses[]` alone proves nothing — instead of `registerArtifact`.

The `creator` / `owner` / `cosigners` distinction is intentional. The gas payer initiated the inscription, the cosigners attested to the content, and ownership starts at the gas payer but can transfer independently. Higher-layer protocols can require additional cosigner consent for transfers (e.g., "a notarized artifact can only be transferred if the notary co-signs the transfer event").

### Tradeoffs

| Concern | Plain payload (default) | BoundWitness payload (extension) |
|---|---|---|
| Multi-party attestation | No | Yes |
| Content-addressed idempotency | Pure — same content collapses to same artifact | Polluted — different signer sets produce different hashes for the same content |
| Storage cost | Small | Larger (BoundWitness wrapper + content) |
| Indexer complexity | Single artifact apply | Discriminate by inscription payload shape, capture cosigners |
| Fits "declarative content, structural authorship" | Cleanly | Tension — the BoundWitness payload *is* an artifact whose content includes its own signatories |

Use the extension when multi-party attestation is the *point* of the artifact. For everything else — including BRC-20-style tokens — the plain payload form is right.

---

## What This Pattern Enables

The inscription substrate is general-purpose. Specific application protocols layer on top by defining additional event schemas under `network.xyo.ordinal.*` whose content carries application semantics:

- **[Fungible Tokens](fungible-tokens.md)** — BRC-20-style deploy/mint/transfer, where deploys are inscriptions claiming a ticker and mints/transfers are events
- **Collections / parent-child inscriptions** — an inscription whose content references another inscription's ID, with the indexer materializing the relationship
- **Delegations / leases** — an event schema that grants a third party authority to transfer on the owner's behalf for a bounded time

Each higher layer is a new pair of (artifact schema, event schemas) plus rules in the indexer. The substrate stays unchanged.
