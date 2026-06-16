# Inscription Substrate

Read this pattern when your application needs **persistent, transferable, owned objects on XL1** — the equivalent of Bitcoin's Ordinals. Inscriptions are arbitrary content that has identity, ownership, and a transfer history derived from on-chain BoundWitnesses.

This pattern is the substrate. Higher-layer protocols (fungible tokens, collections, recursive content) compose on top of it. See [Fungible Tokens](fungible-tokens.md) for the canonical example.

**Builds on:**
- [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md) — the foundational decomposition this pattern exploits
- [Chain Data Indexing](chain-data-indexing-protocol.md) — schema-based payload submission and read models
- [In-Page Data Lakes](in-page-datalakes.md) — read-only browse without a wallet
- [Gateway](../xl1-knowledge/gateway.md) — `connection.viewer.finalization` for finalized state, `connection.viewer.block` for hydrated blocks
- [Datalakes](../xl1-knowledge/datalakes.md) — off-chain payload storage referenced by on-chain hash

---

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
4. **Indexer** polls finalized blocks, replays events, maintains an ownership ledger
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
import { PayloadBuilder } from '@xyo-network/sdk-js'
import { sentinelAddressFromSchema } from '@xyo-network/xl1-sdk'

// Pinned protocol sentinel — equals sentinelAddressFromSchema('network.xyo.ordinal')
const ORDINAL_SENTINEL = '4b210503f8caa8e82d38617997f2eaf612c0ec04'

const inscription = new PayloadBuilder<Inscription>({ schema: InscriptionSchema })
  .fields({ contentType: 'text/plain', content: 'Hello, XL1.' })
  .build()

// Per-payload burn address — verifiably no key, bound to this specific inscription
const burnAddress = sentinelAddressFromSchema('network.xyo.ordinal', inscription._hash)

// One Transfer payload, two recipients: protocol sentinel + per-payload burn
const sentinelTransfer = new PayloadBuilder({ schema: 'network.xyo.transfer' })
  .fields({
    from: walletAddress,         // chain stores addresses without the 0x prefix
    epoch: Date.now(),
    transfers: {
      [ORDINAL_SENTINEL]: '1',
      [burnAddress]:      '1',
    },
  })
  .build()

// 1. Persist content to the dApp's datalake
await datalakeRunner.insert([inscription])

// 2. Commit on-chain: Transfer at block level, inscription off-chain
const [txHash] = await defaultGateway.addPayloadsToChain([sentinelTransfer], [inscription])
```

The inscription ID is the payload's data hash, equal to `inscription._hash` once the payload is built. Treat that hash as the canonical inscription identifier throughout the application.

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
    inscriptionId: 'abc123…',  // the inscription's data hash, no 0x prefix
    to: 'recipient40HexChars…',
  })
  .build()

const burnAddress = sentinelAddressFromSchema('network.xyo.ordinal', transfer._hash)

const sentinelTransfer = new PayloadBuilder({ schema: 'network.xyo.transfer' })
  .fields({
    from: currentOwnerAddress,
    epoch: Date.now(),
    transfers: {
      [ORDINAL_SENTINEL]: '1',
      [burnAddress]:      '1',
    },
  })
  .build()

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
import type { Payload } from '@xyo-network/sdk-js'

type ArtifactRecord = {
  id: string                    // content-addressed hash — the artifact ID
  creator: Address              // signer of the BoundWitness that introduced it
  owner: Address                // current owner — updates as transfers replay
  payload: Payload              // the artifact's declarative content (any schema)
  inscribedAt: XL1BlockNumber   // block height at which it was first finalized
}

type IndexerState = {
  artifacts: Map<string, ArtifactRecord>
  byOwner:   Map<Address, Set<string>>  // per-address side-index — see Scan Strategies §3
  lastProcessedBlock: XL1BlockNumber
}
```

The `byOwner` side-index is maintained alongside `artifacts` during replay. It costs no extra block reads and turns "show me address X's inscriptions" into a single map lookup — see [Scan Strategies — Strategy 3](chain-data-indexing-protocol.md#strategy-3-indexer-maintained-per-address-side-index-forward-iteration).

### Replay loop

A hydrated block is a tuple `[BlockBoundWitness, Payload[]]` where the payloads array contains the block's **on-chain** payloads only — system payloads and the `TransactionBoundWitness` instances that introduced application data. The off-chain inscription / transfer payloads referenced by each `TransactionBoundWitness.payload_hashes[]` are **not** in `payloads`, even with a datalake configured (see [Gateway — What `block.blockByNumber` returns](../xl1-knowledge/gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow)).

The `TransactionBoundWitness` is the structural carrier of authorship — its `from` field is the signer, its `payload_hashes[]` lists the wrapped payload hashes, and its parallel `payload_schemas[]` tells you what each one is *without* fetching it. The replay does a three-pass scan: build a hash→signer index from the transactions in the block, fetch the off-chain inscription/transfer payloads via `payloadsByHash`, then attribute the fetched payloads through the index.

```ts
import type { XyoGateway } from '@xyo-network/xl1-sdk'
import { isTransactionBoundWitness } from '@xyo-network/xl1-sdk'
import type { Address, Hash } from '@xyo-network/sdk-js'

const SUBSTRATE_SCHEMAS = new Set<string>([InscriptionSchema, OrdinalTransferSchema])

async function replayFinalizedBlocks(gateway: XyoGateway, state: IndexerState) {
  const viewer = gateway.connection.viewer
  if (!viewer) throw new Error('Gateway has no viewer attached')

  // Bound the replay window to the finalized head — never derive from unfinalized state
  const finalizedHead = Number(await viewer.finalization.headNumber())
  if (finalizedHead <= state.lastProcessedBlock) return

  for (let n = state.lastProcessedBlock + 1; n <= finalizedHead; n++) {
    const hydrated = await viewer.block.blockByNumber(n)
    if (!hydrated) continue
    const [, payloads] = hydrated

    // Pass 1: index every off-chain hash to its signer, and gather the hashes
    // whose schema this indexer cares about. payload_hashes[i] / payload_schemas[i]
    // are parallel arrays — read both together.
    const hashToSigner = new Map<Hash, Address>()
    const offChainHashes: Hash[] = []
    for (const p of payloads) {
      if (!isTransactionBoundWitness(p)) continue
      for (let i = 0; i < p.payload_hashes.length; i++) {
        const hash = p.payload_hashes[i]
        hashToSigner.set(hash, p.from)
        if (SUBSTRATE_SCHEMAS.has(p.payload_schemas[i])) {
          offChainHashes.push(hash)
        }
      }
    }

    // Pass 2: fetch the off-chain payloads from the datalake by hash. This is
    // the step that actually retrieves the inscription/transfer bodies — the
    // block reader does not do it for you.
    const offChain = offChainHashes.length > 0
      ? await viewer.block.payloadsByHash(offChainHashes)
      : []

    // Pass 3: process inscription/transfer payloads with structural authorship
    for (const p of offChain) {
      const signer = hashToSigner.get(p._hash)
      if (!signer) continue // hash mismatch — defensive only

      if (isInscription(p)) {
        registerArtifact(state, p, signer, n)
      } else if (isOrdinalTransfer(p)) {
        applyTransfer(state, p, signer)
      }
    }
  }

  state.lastProcessedBlock = finalizedHead
}
```

The `hashToSigner` index covers every off-chain hash a transaction in this block referenced; the schema filter in pass 1 keeps the `payloadsByHash` call narrow to substrate-relevant payloads only.

### A note on `tx.from` vs `transfer.from`

The actor for any application payload is `transactionBoundWitness.from`. The sentinel `Transfer` payload accompanying an inscription has its own `from` field, but the indexer doesn't read it — the chain's balance validator already enforces `transfer.from === tx.from`, and reading authorship out of payload content would mix declarative content with structural authorship.

Chain-native consumers using [Scan Strategy 4](chain-data-indexing-protocol.md#strategy-4-sentinel-transfer-typically-backward) end up reading `transfer.from` because that's what `accountBalanceHistory` returns directly — they arrive at the same minter address by a different path. Both views agree by construction.

### Register an artifact

Content-addressed identity means duplicates collapse harmlessly. First-finalized wins. Higher layers (token deploys, collection roots) reuse this same registration to participate in the substrate's transfer mechanism.

```ts
function registerArtifact(
  state: IndexerState,
  payload: Payload,
  signer: Address,
  blockHeight: XL1BlockNumber,
) {
  const id = payload._hash
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

function addToOwner(state: IndexerState, owner: Address, id: string) {
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
  signer: Address,
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

```ts
const intervalId = setInterval(() => {
  replayFinalizedBlocks(gateway, state).catch(console.error)
}, 5_000)
```

5 s is a reasonable default; tune to the chain's finalization cadence. If the indexer crashes, persist `lastProcessedBlock` and the artifacts map so it can resume.

---

## Step 5: Browse

Four browse paths, picked by what the UI needs and what infrastructure is available. See [Chain Data Indexing — Scan Strategies](chain-data-indexing-protocol.md#scan-strategies--reading-indexed-data) for the full taxonomy.

### All inscriptions of a given content type

Walk the chain and use the two-step pattern: each block read returns the on-chain `TransactionBoundWitness` instances, you scan their `payload_schemas[]` for the inscription schema, then fetch the matching `payload_hashes[]` from the datalake via `payloadsByHash`. Inscription payload bodies live in the datalake — they are not in `block[1]` (see [Gateway — What `block.blockByNumber` returns](../xl1-knowledge/gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow)). For an explorer-style "all inscriptions ever" view, persist `lastSeenBlock` between sessions so each load only walks new blocks; for a recent-window view, walk from `head - WINDOW`.

```ts
import { isTransactionBoundWitness } from '@xyo-network/xl1-sdk'

const viewer = defaultGateway.connection.viewer
if (!viewer) throw new Error('Gateway has no viewer attached')

const head = Number(await viewer.finalization.headNumber())
const inscriptions: Payload[] = []
for (let n = lastSeenBlock + 1; n <= head; n++) {
  const hydrated = await viewer.block.blockByNumber(n)
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

  const fetched = await viewer.block.payloadsByHash(inscriptionHashes)
  inscriptions.push(...fetched.filter(isInscription))
}
```

Do not reach for `datalakeViewer.next({ allowedSchemas: [InscriptionSchema] })` — the XL1 datalake is content-addressed and has no cursor pagination, so `.next()` is an unbounded scan with no chain context. See [Datalakes — How to read](../xl1-knowledge/datalakes.md).

### Ownership-aware browsing (per-address side-index)

Query the indexer (or its diviner equivalent). The indexer's `artifacts` map plus a `byOwner: Map<Address, Set<ArtifactId>>` side-index ([Strategy 3](chain-data-indexing-protocol.md#strategy-3-indexer-maintained-per-address-side-index-forward-iteration)) is the read model — expose it via a query interface that returns `ArtifactRecord[]` filtered by `owner`, by `creator`, or by ID. This is the canonical "show me my inscriptions" path when you control an indexer.

### Free chain-native per-address browsing (sentinel transfers)

If inscriptions were submitted with the dual-sentinel pattern from [Step 2](#step-2-inscribe), per-address browse is free without any indexer infrastructure. Query `accountBalanceHistory(userAddress)`, filter the returned transactions for ones whose `Transfer` has `ORDINAL_SENTINEL` as a recipient, then walk the transaction's `payload_hashes` to recover the inscription:

```ts
const history = await defaultGateway.connection.viewer?.account.balance
  .accountBalanceHistory(userAddress)

const myInscriptions = []
for (const [, tx, transfer] of history ?? []) {
  if (!transfer.transfers[ORDINAL_SENTINEL]) continue
  const payloads = await defaultGateway.connection.viewer?.block.payloadsByHash(tx.payload_hashes)
  myInscriptions.push(...(payloads ?? []).filter(isInscription))
}
```

Anyone can run this against the chain — it's a chain-native query, no diviner trust required.

### Read-only without a wallet

Wrap the dApp in `InPageGatewaysProvider` + `GatewayProvider` ([In-Page Data Lakes](in-page-datalakes.md)). The indexer reads chain state through `useProvidedGateway()`'s `defaultGateway`, which works without a wallet connection. Inscriptions, transfers, and ownership are all browsable for unauthenticated visitors.

---

## Anti-Patterns

| Anti-Pattern | Why it fails | Do this instead |
|---|---|---|
| Putting `from`, `creator`, or `owner` in the inscription or transfer payload | Mixes declarative content with structural authorship — creates two sources of truth that can disagree | Derive the actor from `transactionBoundWitness.from` |
| Polling `viewer.block.currentBlockNumber()` for the indexer's replay bound | Includes unfinalized blocks; ownership transitions can be reorged out and the ledger goes stale | Use `viewer.finalization.headNumber()` to bound replay |
| Using `(blockHeight, payloadIndex)` as the inscription ID | Loses content-addressing — byte-identical inscriptions get separate IDs, breaks idempotency, breaks the deploy-collision-is-a-feature property | Use the payload's data hash (`payload._hash`) |
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
| Reorg deeper than expected? | Persist `lastProcessedBlock` only when finalized; the substrate's finalization-only discipline already handles common reorg windows |
| Need free chain-native per-user discovery without running a global indexer? | Use the dual-sentinel pattern in [Step 2](#step-2-inscribe). `accountBalanceHistory(userAddress)` then surfaces every inscription that user submitted, no diviner required |
| Need verifiable real cost per inscription? | Per-payload derived burn address — `sentinelAddressFromSchema('network.xyo.ordinal', payload._hash)`. Each inscription burns dust to a unique no-key address |
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
// Content payload — pure declarative
const content = new PayloadBuilder({ schema: ContentSchema })
  .fields({ contentType: 'application/json', content: '...' })
  .build()

// Inscription payload — a BoundWitness co-signed by multiple parties
const inscription = await new BoundWitnessBuilder()
  .signers([accountA, accountB, accountC])
  .payloads([content])
  .build()

await datalakeRunner.insert([content, inscription[0]])
await defaultGateway.addPayloadsToChain([], [content, inscription[0]])
```

The wrapping `TransactionBoundWitness` still has a single `from` (the gas payer); the *artifact's* signer set is `inscription.addresses[]`.

### Indexer changes

When registering a co-witnessed artifact, capture the full signer set, not just the gas payer:

```ts
type CoWitnessedArtifactRecord = ArtifactRecord & {
  cosigners: Address[]   // all addresses on the inscription BoundWitness
}

function registerCoWitnessedArtifact(
  state: IndexerState,
  payload: BoundWitness,
  gasPayer: Address,
  blockHeight: XL1BlockNumber,
) {
  const id = payload._hash
  if (state.artifacts.has(id)) return
  state.artifacts.set(id, {
    id,
    creator: gasPayer,            // who paid to inscribe it
    owner: gasPayer,              // initial owner — could be a different policy
    payload,
    inscribedAt: blockHeight,
    cosigners: payload.addresses, // who attested to the content
  })
}
```

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
