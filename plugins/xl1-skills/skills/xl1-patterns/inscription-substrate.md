# Inscription Substrate

Read this pattern when your application needs **persistent, transferable, owned objects on XL1** — the equivalent of Bitcoin's Ordinals. Inscriptions are arbitrary content that has identity, ownership, and a transfer history derived from on-chain BoundWitnesses.

This pattern is the substrate. Higher-layer protocols (fungible tokens, collections, recursive content) compose on top of it. See [Fungible Tokens](fungible-tokens.md) for the canonical example.

**Builds on:**
- [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md) — the foundational decomposition this pattern exploits
- [Chain Data Indexing](chain-data-indexing.md) — schema-based payload submission and read models
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

## Step 1: Define Schemas

Two schemas form the substrate. Both follow the chain-agnostic `network.xyo.ordinal.*` namespace.

```ts
import { asSchema } from '@xyo-network/sdk-js'
import { zodIsFactory, zodAsFactory, zodToFactory } from '@xylabs/sdk-js'
import { z } from 'zod'

export const InscriptionSchema = asSchema('network.xyo.ordinal.inscription', true)
export const TransferSchema    = asSchema('network.xyo.ordinal.transfer', true)
```

### The inscription payload

Pure declarative content. No `from`, no `creator`, no `owner` — those are derived structurally from the wrapping BoundWitness.

```ts
export const InscriptionPayloadZod = z.object({
  schema: z.literal('network.xyo.ordinal.inscription'),
  contentType: z.string(),         // e.g. 'text/plain', 'image/png', 'application/json'
  content: z.string(),             // base64 for binary, raw for text/JSON
})

export type InscriptionPayload = z.infer<typeof InscriptionPayloadZod>
export const isInscriptionPayload = zodIsFactory(InscriptionPayloadZod)
export const asInscriptionPayload = zodAsFactory(InscriptionPayloadZod, 'asInscriptionPayload')
export const toInscriptionPayload = zodToFactory(InscriptionPayloadZod, 'toInscriptionPayload')
```

### The transfer payload

References the target inscription by its content-addressed ID and declares the new owner. The current owner is *not* in the payload — it is derived from the BoundWitness signer at index time.

```ts
export const TransferPayloadZod = z.object({
  schema: z.literal('network.xyo.ordinal.transfer'),
  inscriptionId: z.string(),       // hex hash of the target inscription payload
  to: z.string(),                  // recipient address (declarative content — fact about the world)
})

export type TransferPayload = z.infer<typeof TransferPayloadZod>
export const isTransferPayload = zodIsFactory(TransferPayloadZod)
export const asTransferPayload = zodAsFactory(TransferPayloadZod, 'asTransferPayload')
export const toTransferPayload = zodToFactory(TransferPayloadZod, 'toTransferPayload')
```

`to` is content (a fact the signer is declaring); `from` would be authorship (already on the BoundWitness). Only `to` belongs in the payload.

---

## Step 2: Inscribe

Same submit flow as any other application data — datalake first, then chain. See [Chain Data Indexing — Step 2](chain-data-indexing.md) for the rationale on ordering.

```ts
import { PayloadBuilder } from '@xyo-network/sdk-js'

const inscription = asInscriptionPayload(
  new PayloadBuilder({ schema: InscriptionSchema })
    .fields({ contentType: 'text/plain', content: 'Hello, XL1.' })
    .build(),
  true,
)

// 1. Persist to the dApp's datalake — makes the bytes retrievable by hash
await datalakeRunner.insert([inscription])

// 2. Commit on-chain — the BoundWitness records the inscription's data hash
const [txHash] = await defaultGateway.addPayloadsToChain([], [inscription])
```

The inscription ID is the payload's data hash, which equals `inscription._hash` once the payload is built. Treat the data hash as the canonical inscription identifier throughout the application.

---

## Step 3: Transfer Ownership

A transfer is signed by the **current owner** (whoever the indexer's ledger shows as the owner of `inscriptionId` at the moment the transfer lands).

```ts
const transfer = asTransferPayload(
  new PayloadBuilder({ schema: TransferSchema })
    .fields({
      inscriptionId: '0xabc123…',  // the inscription's data hash
      to: '0xRecipient…',
    })
    .build(),
  true,
)

await datalakeRunner.insert([transfer])
await defaultGateway.addPayloadsToChain([], [transfer])
```

The wallet signs the wrapping `TransactionBoundWitness`. The indexer reads `tx.from` to determine who signed, and rejects the transfer if that address is not the current owner of `inscriptionId`. There is no `from` field on the payload to verify against — by construction, only the BoundWitness signer can claim authorship.

---

## Step 4: Build the Indexer

The indexer is the off-chain component that derives the ownership ledger. In production, package it as a diviner module ([Module System](../xyo-knowledge/modules.md)). For prototypes, an in-memory worker is enough.

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
  lastProcessedBlock: XL1BlockNumber
}
```

### Replay loop

A hydrated block is a tuple `[BlockBoundWitness, Payload[]]` where the payloads array contains both system payloads and the `TransactionBoundWitness` instances that introduced application data. The `TransactionBoundWitness` is the structural carrier of authorship — its `from` field is the signer, and its `payload_hashes[]` lists the payload hashes it wrapped. The replay does a two-pass scan: build a hash→signer index from the transactions in the block, then attribute application payloads through that index.

```ts
import type { XyoGateway } from '@xyo-network/xl1-sdk'
import { isTransactionBoundWitness } from '@xyo-network/xl1-sdk'
import type { Address, Hash } from '@xyo-network/sdk-js'

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

    // Pass 1: index every payload hash to the address that wrapped it
    const hashToSigner = new Map<Hash, Address>()
    for (const p of payloads) {
      if (isTransactionBoundWitness(p)) {
        for (const referencedHash of p.payload_hashes) {
          hashToSigner.set(referencedHash, p.from)
        }
      }
    }

    // Pass 2: process inscription/transfer payloads with structural authorship
    for (const p of payloads) {
      const signer = hashToSigner.get(p._hash)
      if (!signer) continue // not wrapped by a transaction in this block

      if (isInscriptionPayload(p)) {
        registerArtifact(state, p, signer, n)
      } else if (isTransferPayload(p)) {
        applyTransfer(state, p, signer)
      }
    }
  }

  state.lastProcessedBlock = finalizedHead
}
```

If `hashToSigner.get(p._hash)` returns `undefined`, the payload was not wrapped by a transaction in this block (e.g., it's a system payload). Drop it — only transaction-wrapped payloads carry application authorship.

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
}
```

### Apply a transfer

Two structural checks: the artifact must exist, and the signer must be the current owner. No payload field carries authorship; the only `from` we accept is the BoundWitness signer.

```ts
function applyTransfer(
  state: IndexerState,
  payload: TransferPayload,
  signer: Address,
) {
  const record = state.artifacts.get(payload.inscriptionId)
  if (!record) return                       // unknown target — drop
  if (record.owner !== signer) return       // unauthorized — drop
  record.owner = payload.to
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

Three browse paths, depending on what the UI needs:

### All inscriptions of a given content type

Filter the datalake by schema; render directly. No indexer required for read-only display of inscription content.

```ts
const inscriptionsView = await datalakeViewer.next({
  allowedSchemas: [InscriptionSchema],
})
const inscriptions = inscriptionsView.filter(isInscriptionPayload)
```

### Ownership-aware browsing

Query the indexer (or its diviner equivalent). The indexer's `artifacts` map is the read model — expose it via a query interface that returns `ArtifactRecord[]` filtered by `owner`, by `creator`, or by ID.

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

---

## What This Pattern Enables

The inscription substrate is general-purpose. Specific application protocols layer on top by defining additional event schemas under `network.xyo.ordinal.*` whose content carries application semantics:

- **[Fungible Tokens](fungible-tokens.md)** — BRC-20-style deploy/mint/transfer, where deploys are inscriptions claiming a ticker and mints/transfers are events
- **Collections / parent-child inscriptions** — an inscription whose content references another inscription's ID, with the indexer materializing the relationship
- **Delegations / leases** — an event schema that grants a third party authority to transfer on the owner's behalf for a bounded time

Each higher layer is a new pair of (artifact schema, event schemas) plus rules in the indexer. The substrate stays unchanged.
