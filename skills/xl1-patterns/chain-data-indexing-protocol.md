# Chain Data Indexing — Protocol

Conceptual rules for retrieving, filtering, and watching application-specific data on the XL1 chain. This is the protocol-level companion to two role-specific files:

- [Chain Data Indexing — Client](chain-data-indexing-client.md) — browser-side consumption of indexed data (React hooks, polling intervals)
- [Chain Data Indexing — Service](chain-data-indexing-service.md) — long-running operator-side indexer (process model, persistence, restart, exposing results)

This file is environment-agnostic. It documents schemas, anchoring choices, and scan strategies that both clients and services rely on. The two role files apply these rules to their respective deployment contexts.

**Builds on:**
- [Datalakes](../xl1-knowledge/datalakes.md) — DataLakeViewer, schema filtering, `/chain` endpoint
- [Gateway](../xl1-knowledge/gateway.md) — RPC viewer methods, transports
- [Protocol Primitives](../xyo-knowledge/primitives.md) — payloads, schemas, hashing
- [Gateway](../xl1-knowledge/gateway.md) — env-agnostic gateway reference + recipes (viewer API, transactions, datalake access)

---

## The Problem

An application submits payloads (game moves, attestations, predictions) as off-chain data via `addPayloadsToChain`. Later, the application needs to retrieve them — filtered by schema, scoped to specific addresses, or paginated for display. The chain stores everything; your app only cares about its own data.

---

## Pattern Overview

```
Submit                          Query
  │                               │
  ▼                               ▼
addPayloadsToChain([], payloads)  gateway RPC / datalake
  │                               │
  ▼                               ▼
tx recorded on chain ──────────► schema-filtered retrieval
                                  │
                                  ▼
                                application read model
```

1. **Define application schemas** — one per payload type, hierarchical naming
2. **Submit payloads** — via `addPayloadsToChain` (off-chain parameter)
3. **Query by schema** — use datalake schema filtering or RPC viewer methods
4. **Build a read model** — transform raw payloads into application state

---

## Step 1: Define Application Schemas

Follow the schema naming conventions from [XYO Best Practices](../xyo-knowledge/best-practices.md). Use a shared namespace for your app:

```ts
import { asSchema } from '@xyo-network/sdk-js'

// Application schema namespace: com.<your-org>.<app>.<entity>
// (This doc uses com.example.rps.* as a placeholder — replace with your reverse-DNS namespace.)
const GameSchema = asSchema('com.example.rps.game', true)
const MoveSchema = asSchema('com.example.rps.move', true)
const ResultSchema = asSchema('com.example.rps.result', true)
```

Define payload types using the [Zod-first pattern](../xl1-knowledge/development.md):

```ts
import { zodIsFactory, zodAsFactory, zodToFactory } from '@xylabs/sdk-js'
import { z } from 'zod'

export const MovePayloadZod = z.object({
  schema: z.literal('com.example.rps.move'),
  gameId: z.string(),
  move: z.enum(['rock', 'paper', 'scissors']),
})

export type MovePayload = z.infer<typeof MovePayloadZod>
export const isMovePayload = zodIsFactory(MovePayloadZod)
export const asMovePayload = zodAsFactory(MovePayloadZod, 'asMovePayload')
export const toMovePayload = zodToFactory(MovePayloadZod, 'toMovePayload')
```

---

## Step 2: Submit Application Data

Application data goes in the `offChain` parameter of `addPayloadsToChain`, but **the wallet does not persist off-chain payloads to the dApp's datalake automatically** (see [Datalakes — Two Independent Datalake Clients](../xl1-knowledge/datalakes.md)). The dApp must insert payloads into its own datalake before submitting the transaction:

```ts
import { PayloadBuilder } from '@xyo-network/sdk-js'
import { createRestDataLakeRunner } from '@xyo-network/xl1-sdk'

// See Gateway — Accessing the Datalake for full setup details
const datalakeRunner = await createRestDataLakeRunner('https://api.archivist.xyo.network/dataLake')

const movePayload: MovePayload = asMovePayload(
  new PayloadBuilder({ schema: MoveSchema })
    .fields({ gameId: 'abc123', move: 'rock' })
    .build(),
  true,
)

// 1. Insert into the dApp's datalake first — this makes the payload queryable
await datalakeRunner.insert([movePayload])

// 2. Then submit the transaction — the BoundWitness references the payload by hash
const [txHash, signedTx] = await gateway.addPayloadsToChain([], [movePayload])
```

After both steps, the payload is:
- **Referenced by hash** in the on-chain transaction's BoundWitness
- **Stored in the datalake** and queryable by schema or hash

If you skip the datalake insert, the transaction still records on-chain but the payload data is lost — only the hash remains.

---

## Destination as Protocol — A Native XL1 Pattern

A transfer's destination address can carry semantic meaning beyond "where the money goes." It can identify a protocol, mark an operation, hold an escrow, or burn dust at a payload-bound address. XL1 uses this pattern natively in its block-reward machinery, and applications can adopt the same construction to make their off-chain data discoverable through the chain's address-scoped APIs.

### Native examples in the chain

The chain already uses deterministic no-private-key addresses for its own machinery:

**Block-reward step escrow.** Rewards accumulate at a deterministic address mid-block, then transfer to recipients at block close.

- Helper: `completedStepRewardAddress({ block, step })`
- File: `/packages/protocol/packages/protocol/src/step/completedStepRewardAddress.ts`
- Construction: `keccak256(utf8(`${block}|${stepSize}`)).slice(-40)`
- Release validation: `CompletedStepRewardAddressValidatorFactory`

**Generic derived-receive escrow.** A general-purpose helper for any scoped derived address.

- Helper: `derivedReceiveAddress(address, scope?)`
- File: `/packages/protocol/packages/protocol/src/step/derivedReceiveAddress.ts`
- Construction: `keccak256(utf8(scope ? `${scope}|${address}` : address)).slice(-40)`
- Release validation: `DerivedReceiveAddressValidatorFactory`

The chain has first-class awareness of these derived addresses — they have their own validator factories — so the pattern isn't a hack overlaid on the chain; it *is* a chain primitive.

### The construction

Every no-private-key address in XL1 follows the same shape:

```
address = keccak256(utf8(seed)).slice(-40)
```

The seed is whatever's deterministic about the situation. Block + step size for reward escrow. Address + scope for derived receive. Protocol name for application sentinels. Payload hash for per-payload burn destinations. 20 bytes of Keccak output produces an address with no associated private key (with overwhelming probability — keyspace is 2^160).

### Always derive via the helper

The construction above is a **spec**, not a recipe to retype. Application code should call `sentinelAddressFromSchema(schema, payloadHash?)` from `@xyo-network/xl1-sdk`:

```ts
import { sentinelAddressFromSchema } from '@xyo-network/xl1-sdk'

const sentinel = sentinelAddressFromSchema('network.xyo.ordinal')
const burn     = sentinelAddressFromSchema('network.xyo.ordinal', payload._hash)
```

The helper centralizes encoding, prefix, and casing conventions so future tweaks propagate uniformly. Reaching for `keccak256` from ethers directly is an anti-pattern — the spec is published so independent implementations and out-of-band auditors can verify the helper's output, not so that callers re-implement it.

### Application uses

Two complementary patterns. Use either or both.

**Static protocol sentinel** — derived from the protocol's identifier string. Every transaction in the protocol includes a transfer to this fixed address. Anyone can then query `accountBalanceHistory(SENTINEL)` for a chain-native list of every protocol invocation — no global indexer required.

```ts
import { sentinelAddressFromSchema } from '@xyo-network/xl1-sdk'

const ORDINAL_SENTINEL = sentinelAddressFromSchema('network.xyo.ordinal')
// → 4b210503f8caa8e82d38617997f2eaf612c0ec04
```

**Per-payload derived sentinel** — derived from each payload's hash. The dust transferred there is verifiably burned (no key, address-bound to that specific payload). Strong "real cost" semantic — every inscription costs something irrecoverable.

```ts
const burnAddress = sentinelAddressFromSchema('network.xyo.ordinal', payload._hash)
```

For protocols that want both — free chain-native indexing *and* per-payload burn — include both addresses as recipients in a single `Transfer` payload (the `transfers` field is a map; one extra payload, two recipients).

### Pinned addresses for ordinal protocols

The ordinal substrate and XRC-20 reserve these sentinels. They are deterministic outputs of the construction above and are reproducible by anyone:

| Protocol | Seed | Pinned address |
|---|---|---|
| Ordinal substrate | `network.xyo.ordinal` | `4b210503f8caa8e82d38617997f2eaf612c0ec04` |
| XRC-20 fungible tokens | `network.xyo.ordinal.token` | `c17df06bc481b090f7a0e03639fca786df6e8e65` |

Verify locally before relying:

```ts
import { sentinelAddressFromSchema } from '@xyo-network/xl1-sdk'
console.log(sentinelAddressFromSchema('network.xyo.ordinal'))
```

### What not to use as a sentinel

| Anti-pattern | Why |
|---|---|
| **Zero address** (`0x0000…0000`) | This is the source of all native XL1 minting. Its `accountBalanceHistory` is enormous, dominated by chain-internal mint events. Application activity is unfindable in the noise. |
| **Self-transfer** (signer → signer) | The chain may filter signer-to-signer transfers as no-ops at validation. Even if accepted in some path today, the behavior is fragile and not safe to depend on. |
| **A known-key address published as a sentinel** | Defeats the burn semantic. If the holder of the key changes their mind, accumulated dust becomes spendable, breaking the "verifiably burned" property. Always derive sentinels from the construction so no key exists. |

### Note on `accountBalanceHistory` semantics

`accountBalanceHistory(address)` returns history entries for transactions containing a `Transfer` payload involving the address. Gas fees are believed to be computed at validation rather than emitted as Transfer payloads, so fee-only debits do not appear in the history. **Verify this assumption before relying on it for production audit tooling** — if fees do produce Transfer records, every transaction the address signed would appear, expanding what address-scoped scanning catches for free.

---

## Choosing a Carrier — How to Anchor Off-Chain Data On-Chain

There are four mechanically distinct ways to put a payload's hash on chain. They differ in how the hash is structured into the block, what they cost, and how indexers can find them later.

### Overview

| Path | Hash visibility at block level | Gas cost | Multi-party attestation | Protocol change |
|---|---|---|---|---|
| **A** TransactionBoundWitness reference | Inside a TransactionBoundWitness's `payload_hashes` | 1 payload | No | No |
| **B** HashPayload commitment | First-class block-level HashPayload | 2 payloads | No | No |
| **C** BoundWitness commitment | First-class block-level BoundWitness with co-signers | 2+ payloads | **Yes** | No |
| **D** Custom block-level schema | First-class block-level payload of custom schema | 1 payload | Depends | **Yes — consensus upgrade** |

Quick decision guide:

- **Single-author, simple, lowest gas** → Path A
- **Self-identifying hash commitment (commit now, reveal later or never)** → Path B
- **Multi-party attestation as part of the artifact's identity** → Path C
- **Building protocol primitives that justify a consensus upgrade** → Path D (out of application-layer scope)

### Path A: TransactionBoundWitness reference (default)

The standard `addPayloadsToChain` flow. The payload bytes live in the datalake; the wrapping TransactionBoundWitness's `payload_hashes` references them; the TransactionBoundWitness is included in the block (it's on `AllowedBlockPayloadSchemas`).

```ts
await datalakeRunner.insert([myPayload])
const [txHash] = await gateway.addPayloadsToChain([], [myPayload])
```

**Properties.** Hash on chain via `tx.payload_hashes[i]`, schema in `tx.payload_schemas[i]`. One payload of gas. The wrapping TransactionBoundWitness's `from` is the authorship anchor.

**Peculiarities.** Indexers must walk transactions and discriminate by inner schema (build a `hashToSigner` index per block — see [Inscription Substrate § Replay loop](inscription-substrate.md#replay-loop)). The hash is *not* visible at block level as a first-class entity; it lives inside the TransactionBoundWitness wrapper.

**When to use.** Any single-author application data that doesn't need multi-party attestation or independent block-level visibility. This is the substrate default.

### Path B: HashPayload commitment

A commit-then-reveal-style anchor. Submit a `HashPayload` (already on `AllowedBlockPayloadSchemas`) as an on-chain block payload. The hash is now a first-class block-level entity. Content can be revealed in the same transaction (off-chain), in a later transaction, or never.

```ts
const hashCommit = new PayloadBuilder({ schema: 'network.xyo.hash' })
  .fields({ hash: payload._hash, schema: payload.schema })
  .build()
await datalakeRunner.insert([payload])
const [txHash] = await gateway.addPayloadsToChain([hashCommit], [payload])
```

**Properties.** Hash visible at block level as a first-class HashPayload, separable from the wrapping transaction. Two payloads of gas. Indexers can scan block-level HashPayloads directly without resolving transactions.

**Peculiarities.** HashPayload doesn't self-identify as belonging to your application — indexers need a convention (e.g., the embedded `schema` field) to know which HashPayloads to interpret. Also, "commit but never reveal" is a real and useful state — the chain has a commitment, the content is private.

**When to use.**
- Sealed-bid mechanisms (commit hash now, reveal content after deadline)
- Proof-of-possession at a specific block height without revealing what is possessed
- Any pattern where the hash itself is the artifact and content reveal is optional or delayed

### Path C: BoundWitness commitment

Submit a multi-signer BoundWitness as an on-chain block payload. The artifact's identity includes its co-signers. Useful when "who agreed" is part of the artifact, not just "who paid gas to record it."

```ts
const witness = await new BoundWitnessBuilder()
  .signers([accountA, accountB])
  .payloads([content])
  .build()
await datalakeRunner.insert([content, witness[0]])
const [txHash] = await gateway.addPayloadsToChain([witness[0]], [content])
```

**Properties.** BoundWitness is first-class at block level, signed by all listed parties. 2+ payloads of gas. Co-signers' signatures are part of the on-chain commitment, separate from the gas payer's transaction signature.

**Peculiarities.** Loses content-addressed idempotency — different signer sets over the same content produce different BoundWitness hashes. Indexer logic must distinguish "the artifact" from "who attested to it" carefully.

**When to use.** When multi-party attestation is the point of the artifact. See [Co-Witnessed Inscriptions](inscription-substrate.md#extension-co-witnessed-inscriptions) for the full pattern, including bilateral agreements, notarized records, and joint statements.

### Path D: Custom block-level schema (deferred)

Add the application schema directly to `AllowedBlockPayloadSchemas` so it can appear at block level without wrapping. Cleanest semantic, smallest gas, native indexer support. **Requires a consensus upgrade — out of scope for application-layer patterns.** Listed for completeness; revisit if a protocol earns the upgrade through traction.

---

## Step 3: Query by Schema

### Via Viewer API — Transaction-Centric Queries

Chain state is read through sub-viewers on `gateway.connection.viewer`. `connection.viewer` is typed `XyoViewer | undefined` — always guard with `?.` or an explicit null check. See [Gateway — Viewer API](../xl1-knowledge/gateway.md) for the full method-by-method reference.

Use the transaction sub-viewer when you need full transaction context (who signed, when, block number):

```ts
const tx = await gateway.connection.viewer?.transaction.byHash(txHash)
// tx is SignedHydratedTransactionWithHashMeta | null
// tx[0] = TransactionBoundWitness, tx[1] = resolved payloads (including off-chain)
```

When called this way, the gateway's `ViewerWithDataLake` transparently resolves the transaction's off-chain payloads — you get a complete hydrated transaction in a single round-trip without querying the datalake separately. **This is specific to `transaction.byHash`** — block-level reads do not behave the same way; see below.

### Via Block Walk — Schema Discovery From the Chain

When you need to find all payloads of a given type regardless of which transaction included them, walk the chain and use a two-step pattern: each block read returns the on-chain `TransactionBoundWitness` instances, and you fetch the referenced off-chain payloads by hash in a follow-up call.

`viewer.block.blockByNumber(n)` returns the block's **on-chain payloads only** — `BlockBoundWitness`, `TransactionBoundWitness` instances, `transfer`, `time`. The off-chain payloads referenced in each `TransactionBoundWitness.payload_hashes[]` are **not** included, even with a datalake configured. See [Gateway — What `block.blockByNumber` returns](../xl1-knowledge/gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow) for why.

To find application-schema payloads from a block walk, scan each transaction's parallel `payload_hashes[]` / `payload_schemas[]` arrays for the schemas you care about, then fetch the matching hashes via `viewer.block.payloadsByHash(hashes)`:

```ts
import { isTransactionBoundWitness } from '@xyo-network/xl1-sdk'

const viewer = gateway.connection.viewer
if (!viewer) throw new Error('Gateway has no viewer attached')

const head = Number(await viewer.finalization.headNumber())
const moves: Payload[] = []
for (let n = lastSeenBlock + 1; n <= head; n++) {
  const hydrated = await viewer.block.blockByNumber(n)
  if (!hydrated) continue
  const [, payloads] = hydrated

  // Pass 1: scan TransactionBoundWitness instances for the target schema
  const moveHashes: Hash[] = []
  for (const p of payloads) {
    if (!isTransactionBoundWitness(p)) continue
    for (let i = 0; i < p.payload_hashes.length; i++) {
      if (p.payload_schemas[i] === MoveSchema) {
        moveHashes.push(p.payload_hashes[i])
      }
    }
  }
  if (moveHashes.length === 0) continue

  // Pass 2: fetch the off-chain payloads from the datalake by hash
  const fetched = await viewer.block.payloadsByHash(moveHashes)
  moves.push(...fetched)
}
```

This is the same engine that drives Strategy 1 below — see [Polling for New Data](#polling-for-new-data) for the React/incremental version. For multi-player dApps, combine the chain walk with a local payload store for immediate UI updates — see [In-Page Data Lakes — dApp State Management](in-page-datalakes.md).

**Why not `RestDataLakeViewer.next({ allowedSchemas })`?** The datalake is a content-addressed blob store, not a queryable index. Remote XL1 datalakes do not implement cursor pagination, so `.next()` returns an unbounded scan with no chain context (no block number, no signer, no finalization guarantee) and silently scales poorly. Iterate the chain to find what to look for, then read the datalake by hash — see [Datalakes — How to read](../xl1-knowledge/datalakes.md).

### Via Payload Hash — Direct Lookup

When you already have a hash (from a transaction's `payload_hashes`), retrieve the payload directly:

```ts
const payloads = await gateway.connection.viewer?.block.payloadsByHash(hashes)
```

---

## Step 4: Build an Application Read Model

Transform raw chain payloads into your application's domain model. Filter and narrow with the **Zod-factory guards from Step 1** — `isMovePayload`, `isResultPayload`, etc. — never `isPayloadOfSchemaType`. The Zod factories validate schema name *and* payload shape in one step; `isPayloadOfSchemaType` checks only the schema string and would let a malformed payload (right schema name, wrong fields) slip through.

```ts
// `isMovePayload` and `isResultPayload` are exported from Step 1 — Zod-factory
// guards derived from MovePayloadZod and ResultPayloadZod. Use them anywhere
// you read payloads from the chain or datalake. Never trust the schema field alone.

function buildGameState(payloads: Payload[]): GameState {
  const moves = payloads.filter(isMovePayload)
  const results = payloads.filter(isResultPayload)

  // Group by gameId, reconstruct game state
  return moves.reduce((state, move) => {
    const game = state[move.gameId] ?? { moves: [], result: undefined }
    game.moves.push(move)
    game.result = results.find(r => r.gameId === move.gameId)
    return { ...state, [move.gameId]: game }
  }, {} as GameState)
}
```

---

## Floor Block

Two orthogonal concerns shape every indexer:

- **Temporality** — does the indexer cover the entire chain, or only a subset of it? The *floor block* answers this.
- **Ordering** — must blocks be replayed in order to derive state? [Direction of Iteration](#direction-of-iteration) and [Strategy 1](#strategy-1-global-block-walk-forward-iteration) answer this.

A given indexer is some pair of these. A `txHash → blockNumber` lookup is unbounded but unordered. An RPS dApp's per-game state machine is bounded and ordered. The inscription substrate is unbounded *and* ordered, with an extra retroactivity property addressed below. This section is about the temporality axis.

### The honor question

The chain accepts arbitrary bytes for any schema, including before your application existed. Whether to *honor* pre-deployment matches isn't a chain decision — it's yours.

**Heuristic.** If your dApp invented the schema, data older than your dApp can't be your dApp's data. Whatever those bytes are — random collisions, independent dApps that picked the same schema name, accidental writes — they're not part of your application's state. Ignore them.

**The schema name is a tag, not a validator.** The `schema` field is a string the chain doesn't interpret. Older versions of your dApp can publish payloads that no longer match the current shape; malformed bytes can carry the right schema with the wrong fields; another party can independently use the same schema string. The structural discriminator is your dApp's Zod-factory guard — `isMovePayload` derived from `MovePayloadZod` validates name *and* shape in one step, and a well-defined Zod schema is usually sufficient on its own.

**Beyond shape: referential integrity.** Some checks Zod can't see — *"this payload references hash H — does H actually exist on chain?"*, *"this transfer claims a previous owner — does the ownership ledger agree?"* — belong in a sanity-check pass after Zod. Treat referential integrity as part of the read pipeline, not as ad-hoc assertions sprinkled into business logic.

**Authorship discriminators (last resort).** When a legitimate same-schema *and* same-shape collision is plausible — two real dApps that picked identical schemas, or a malicious party crafting payloads that pass your Zod — additional discriminators apply: per-dApp signer scoping, sentinel addresses (see [Destination as Protocol](#destination-as-protocol--a-native-xl1-pattern)), or per-app ID prefixes. Reach for these only when Zod can't tell the data apart on its own.

### Two postures — pick one for the dApp

**Bounded.** The dApp's data lives under schemas the dApp itself introduced. Floor: a chain block captured during development, recorded as `INDEXER_FLOOR_BLOCK`.

- Custom dApps with their own `com.<your-org>.<app>.*` namespace
- Games (an RPS dApp's `com.example.rps.*` schemas in this doc; your real app uses its own namespace)
- Any application that designed its own payload protocol from scratch

This is the default for new dApps. Reading from `INDEXER_FLOOR_BLOCK` forward is both *correct* (no honoring of pre-app data) and *fast* (no scanning of blocks that provably contain none of the dApp's data).

**Unbounded.** The indexer covers schemas (or chain properties) that predate its own code. Pre-deployment data is real and load-bearing. Recorded as `INDEXER_FLOOR_BLOCK=0`.

- A `network.xyo.transfer` indexer covering all XL1 history
- A `txHash → blockNumber` lookup service
- An XRC-20 ledger for an existing token
- Any indexer of the inscription substrate

Temporality (unbounded) is independent of ordering — some unbounded indexers are also ordered (the substrate, balance ledgers); others are not (the txHash lookup).

### The substrate's special property: floor is permanent

A few unbounded + ordered indexers have an additional constraint: their floor cannot be raised retroactively, even for performance. The inscription substrate is the canonical example. Canonical authorship — "the first finalized BoundWitness referencing this content hash wins" — is established by replay order, and "first" is observed only by walking from genesis. Skipping any block silently miscredits authorship to a later inscriber. So the substrate's floor is `0` forever; an operator standing up a substrate indexer in 2030 still must walk from genesis.

Most ordered + unbounded indexers don't have this property. An XL1 balance ledger derives state from `Transfer` payloads, and order matters for arithmetic correctness — but if you knew the balance at block N, you could resume from N+1 with no information loss. The substrate doesn't allow that snapshot trick because identity is established by *first appearance*, and you can't observe first appearance from a snapshot.

### The development-time capture step

When scaffolding a bounded dApp — the default for any application creating its own schemas — capture the chain's finalized head **during development**, as part of dApp creation, and record it in `.env` as `INDEXER_FLOOR_BLOCK`. The agent does this; the user never sees the step.

Anchor the capture to development time, not to first publish. Publish steps are often automated, skipped, or implicit, and an agent following an "after first publish" rule will frequently miss it. "Capture during development" is unambiguous and runs every time. Precision isn't the goal — *performance optimization* is. A few blocks of slack on either side don't matter; orders-of-magnitude reduction in cold-start scan time does.

```bash
# .env (recorded during scaffolding)
INDEXER_FLOOR_BLOCK=412847
VITE_INDEXER_FLOOR_BLOCK=412847   # only if there's a Vite-built browser package
```

```ts
// Service indexer (Node)
const floorBlock = Number(process.env.INDEXER_FLOOR_BLOCK)
let lastProcessedBlock = floorBlock - 1
// ...sync loop iterates from lastProcessedBlock + 1 to finalized head

// Browser dApp (Vite)
const floorBlock = Number(import.meta.env.VITE_INDEXER_FLOOR_BLOCK)
// ...backward walks bound at floorBlock instead of running unbounded toward genesis
```

For unbounded indexers, set `INDEXER_FLOOR_BLOCK=0` explicitly. The env var is *required* in either case — there is no silent default. An unbounded indexer with no floor declaration is an error: the operator must affirm "yes, walk from genesis" rather than slip into it by accident.

### Multi-chain and multi-operator

The floor block is **per chain** and **per dApp deployment moment**. Every operationally distinct indexer instance has its own `.env`:

- A dApp deployed to mainnet, sequence, and a local devnet has three different `.env` files with three different floors.
- A single indexer process should cover one chain. We do not currently support cross-chain indexers; if you need them, run separate processes.

For shared / canonical protocols (where many operators run their own indexer of the same dApp), the floor must be a *socialized* canonical value, not each operator's local capture time. Late operators read the published `INDEXER_FLOOR_BLOCK` — out-of-band (README, docs, bootstrap scripts) or via a chain-recorded `com.<your-org>.<app>.genesis` payload they can verify. This is a day-2 concern; day-1 scaffolding bootstraps the local operator, and a canonical floor can be agreed on later.

### Retrofitting an already-deployed dApp

If a dApp is already deployed and the floor was never captured, recover it after the fact:

- **Best-effort estimate.** Pick a recent block known to be after the first deployment — the deployer wallet's first relevant transaction, a known schema-introduction commit, a roughly-correct date-based estimate. Set `INDEXER_FLOOR_BLOCK` to that block and backfill from there.
- **Schema-discovery scan.** Walk backward from `finalization.headNumber()` and stop on the first block containing the target schema. See [Direction of Iteration § Cold-start backward](#direction-of-iteration). Bounded by the depth at which the schema first appeared.
- **Genesis payload sweep.** If the dApp ever published a `com.<your-org>.<app>.genesis` payload (recommended for shared protocols), find it via `accountBalanceHistory(deployer)` and use its block.

The retrofit doesn't need to be exact — the floor is a performance optimization, and a slightly-too-low floor just costs a one-time cold-start scan.

### Mixed indexers — the escape hatch

A dApp that genuinely indexes both its own schemas *and* a pre-existing schema (e.g., RPS that also tracks players' XL1 transfer history) needs per-schema floors. This is the escape hatch, not the canonical shape — most dApps fit cleanly into one of the two postures.

```ts
const FLOORS: Record<string, number> = {
  'com.example.rps.move':   floorBlock,  // self-authored, sourced from INDEXER_FLOOR_BLOCK
  'com.example.rps.result': floorBlock,  // self-authored
  'network.xyo.transfer':   0,           // pre-existing (SDK-shipped schema)
}

function shouldHonor(payload: Payload, blockNumber: number): boolean {
  const floor = FLOORS[payload.schema] ?? floorBlock
  return blockNumber >= floor
}
```

Default-when-absent is the dApp's `floorBlock`, not `0`. The safe choice is the default — adding a new self-authored schema can't accidentally open the indexer up to honoring pre-deployment matches. The scan iterates from `Math.min(...Object.values(FLOORS))` and each handler self-gates by its schema's floor.

**Performance consequence — and why this is the last resort.** As soon as one schema in the map has floor `0`, the scan must hydrate every block from genesis to find matches for it. The bounded handlers self-gate during that scan, but the indexer still pays the unbounded cost. Mixing temporalities loses the bounded performance benefit. If a dApp can split into two indexer processes — one bounded, one unbounded, each with its own `INDEXER_FLOOR_BLOCK` — that's strictly faster than mixing in one process.

### Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Cold-start defaulting `lastSeenBlock = 0` for a bounded dApp | Honors pre-deployment data that cannot be the dApp's; wastes hours scanning blocks that provably contain none of the app's data |
| Treating an unbounded indexer (transfers, substrate) as bounded | Misses real pre-deployment data; for substrate-shaped protocols, silently miscredits canonical first-author |
| Silent default when `INDEXER_FLOOR_BLOCK` is missing | Forces a choice the operator should make explicitly. Fail closed; require either the captured head or `0` |
| Per-schema floor map for a single-posture dApp | Adds ceremony with no benefit — every handler gates on the same value. Reach for the map only when temporalities genuinely differ |
| Mixing bounded and unbounded handlers in one indexer when they could be split | The mixed scan hydrates every block from genesis; two separate indexers (one bounded, one unbounded) is strictly faster |
| Asking the developer to "remember to capture the floor" | This is an agentic/scaffold concern. Capture during development and write to `.env` — the developer should never see this step |
| Reusing one `INDEXER_FLOOR_BLOCK` across mainnet, sequence, and devnet | Floor is per-chain. Each environment's `.env` carries its own captured value |

---

## Polling for New Data

XL1 does not provide push-based subscriptions. Poll for new data by tracking the last-seen block number.

### Finalized vs. latest — pick the right bound

Two sub-viewers expose the chain head, and the choice matters:

| Sub-viewer | Returns | Use when |
|---|---|---|
| `connection.viewer.block.currentBlockNumber()` | The latest block, which may not yet be finalized | Ephemeral display where transient data is acceptable (a tx-just-submitted toast, mempool insight, "live" feeds that can flicker) |
| `connection.viewer.finalization.headNumber()` | The latest **finalized** block — irreversible by chain consensus | Any indexer that derives durable state — balances, ownership ledgers, leaderboards, anything that must not silently roll back during a reorg |

**Default to `finalization` when in doubt.** Replaying state from unfinalized blocks means a reorg can erase transitions you've already shown to users. The cost of finalization-only replay is latency (state appears slightly later); the benefit is a deterministic, reorg-safe read model.

The example below uses `currentBlockNumber()` for simplicity (showing recent payloads in a feed). For state-derivation indexers — see [Inscription Substrate](inscription-substrate.md) — use `viewer.finalization.headNumber()` instead.



```ts
import type { XyoGateway, XyoGatewayRunner } from '@xyo-network/xl1-sdk'

// `gateway` is whatever your environment gives you — the React-context
// gateway in a browser dApp, the result of `new GatewayBuilder().rpcUrl(...).build()`
// in a Node service, or any other XyoGateway instance. Reach viewer methods
// via connection.viewer; never call RPC by hand.
async function pollForNewData(
  gateway: XyoGateway | XyoGatewayRunner,
  lastSeenBlock: number,
  schemas: Schema[],
): Promise<{ payloads: Payload[]; latestBlock: number }> {
  const viewer = gateway.connection.viewer
  if (!viewer) throw new Error('Gateway has no viewer attached')

  const currentBlock = Number(await viewer.block.currentBlockNumber())

  if (currentBlock <= lastSeenBlock) {
    return { payloads: [], latestBlock: lastSeenBlock }
  }

  // Query blocks from lastSeenBlock+1 to currentBlock
  const newPayloads: Payload[] = []
  for (let block = lastSeenBlock + 1; block <= currentBlock; block++) {
    const hydrated = await viewer.block.blockByNumber(block)
    if (hydrated) {
      const [, payloads] = hydrated
      const matching = payloads.filter(p => schemas.includes(p.schema as Schema))
      newPayloads.push(...matching)
    }
  }

  return { payloads: newPayloads, latestBlock: currentBlock }
}
```

The `pollForNewData` function above is environment-agnostic — it takes a gateway as a parameter and works equally in a browser, a Node service, or a CLI. For role-specific wrappers:

- **Browser clients** (React hooks with `setInterval`, capability detection, lifting state into context) → see [Chain Data Indexing — Client](chain-data-indexing-client.md)
- **Long-running indexers** (sync loop with checkpointing, finalized-only replay) → see [Chain Data Indexing — Service](chain-data-indexing-service.md)

---

## Direction of Iteration

The XL1 chain is a singly-linked list at the protocol level — each block holds its parent's hash, not its children's. The gateway's `blockByNumber(n)` hides that with random-access by number, so both directions are equally cheap from the consumer's POV. **Pick direction by purpose, not by what the chain "naturally" allows.**

Two regimes:

| Direction | When | Why |
|-----------|------|-----|
| **Forward** (`lastProcessed + 1 → head`, or `0 → head` for cold bootstrap) | Global state derivation, event replay, ledger / ownership / balance computation | Events must apply in order. You cannot compute "the balance after this transfer" without first applying every prior transfer in deterministic order. |
| **Backward** (`head → stop early`) | Recency-biased views — "my last N transactions," "10 most recent inscriptions," "recent activity feed," any UI that shows the latest matching things | You find what you need and stop. Walking forward from 0 to find the *latest* anything is wasteful and unbounded. |

**Forward iteration is required for state derivation.** A global indexer that builds derived state ([Strategy 1](#strategy-1-global-block-walk-forward-iteration)) cannot replay events out of order without losing determinism. This is non-negotiable for ledger correctness.

**Backward iteration is the right shape for recency-biased UIs.** A user staring at "show my last 10 moves" doesn't care about block 1 — they care about what just happened. Walk backward, accumulate matches, stop when you have N. The browser-side ephemeral case is overwhelmingly this shape.

**Cold-start backward** (`head → first app-schema occurrence`) is a specialized variant: retroactively discovering an indexer's floor for a third-party protocol with no documented birth block. Walk backward from `finalization.headNumber()`, stop on the first block containing the target schema, cache the result. Bounded by the depth at which the protocol first appeared. New dApps capture their birth block at scaffold time and skip this entirely — see [Floor Block](#floor-block).

The four scan strategies below are tagged with their natural direction. Some are bidirectional in principle but most have a clearly correct choice.

---

## Scan Strategies — Reading Indexed Data

Once data is anchored on chain, indexers and consumers need to read it. Four strategies with very different cost and coverage profiles.

### Decision matrix

| Need | Strategy |
|---|---|
| Global state for a protocol (ledger, supply, ownership map) | **Strategy 1** — Global block walk |
| dApp showing "my X" (my inscriptions, my XRC-20 balance, my transfers) | **Strategy 3** — Per-address side-index, populated during global walk |
| Audit XL1 movements for an address (transfers in/out) | **Strategy 2** — `accountBalanceHistory` |
| Free chain-native protocol-wide and per-user indexing without infrastructure | **Strategy 4** — Sentinel transfer (combines with Strategy 2) |

### Strategy 1: Global block walk (forward iteration)

**Natural direction: forward.** Required — state derivation depends on in-order replay.

The reference indexer pattern. Poll `viewer.finalization.headNumber()`, iterate every finalized block from `lastProcessed + 1` to head, dispatch each block's payloads through application handlers. Full coverage, deterministic state derivation across competing indexers. See [Inscription Substrate § Replay loop](inscription-substrate.md#replay-loop) for a worked example.

**When to use.** Any indexer that derives global state. Required for ledger correctness, ownership maps, supply tracking. The chain's authoritative indexing model.

**Cost.** Constant per-block work; storage scales with state, not with block count. The diviner this runs in is the protocol's reference implementation; competing implementations must agree on the same finalized stream.

### Strategy 2: Address-scoped via balance history (typically backward)

**Natural direction: backward** for recency-biased reads ("user's last N transfers"); forward (with a bounded `range`) for audit. The `range` parameter selects a block window; verify the return-order semantics against the current chain implementation if your code depends on it.

Use `viewer.account.balance.accountBalanceHistory(address, { range })`. Returns hydrated `[block, tx, transfer]` tuples for every transaction containing a `Transfer` payload involving the address.

```ts
const history = await gateway.connection.viewer?.account.balance
  .accountBalanceHistory(address, { range: [startBlock, endBlock] })

for (const [block, tx, transfer] of history ?? []) {
  // tx is the wrapping TransactionBoundWitness; walk tx.payload_hashes
  // and viewer.block.payloadsByHash(...) for any application payloads riding along.
}
```

**Critical limitation.** This indexes **only transactions that contain a `Transfer` payload involving the address**. Pure off-chain payload transactions (no Transfer) are invisible. Believed to apply to gas fees as well — if fees are computed at validation rather than emitted as Transfer payloads, fee-only debits do not appear here. Verify against current chain behavior before relying.

**When to use.**
- Auditing XL1 token flow for an address
- Indexing application protocols that intentionally ride alongside a Transfer (Strategy 4 — sentinel transfers)
- Any case where the off-chain payload coexists with a Transfer for legitimate reasons (paid services, escrow, sentinel mark)

### Strategy 3: Indexer-maintained per-address side-index (forward iteration)

**Natural direction: forward.** Inherits from Strategy 1 — the side-index is built during the same forward replay. There is no separate iteration; the side-index is a byproduct of the global walk.

Inside a global-walk indexer (Strategy 1), maintain a `Map<Address, ArtifactId[]>` (or analogous) as a side-index. Populate it as you replay events. Expose it as a query.

```ts
type IndexerState = {
  artifacts: Map<ArtifactId, ArtifactRecord>
  byOwner:   Map<Address, Set<ArtifactId>>     // ← side-index
  lastProcessedBlock: XL1BlockNumber
}

function applyOwnership(state: IndexerState, id: ArtifactId, owner: Address) {
  state.artifacts.get(id)!.owner = owner
  if (!state.byOwner.has(owner)) state.byOwner.set(owner, new Set())
  state.byOwner.get(owner)!.add(id)
}
```

**When to use.** Any dApp showing user-scoped views of chain data when those views can't be served by `accountBalanceHistory`. The primary pattern for inscriptions, NFT collections, and balance views derived from non-Transfer events.

**Cost.** Maintained alongside the global walk — no extra block reads, just additional state. Storage scales with the side-index's cardinality (number of unique owners × average artifacts per owner).

### Strategy 4: Sentinel transfer (typically backward)

**Natural direction: backward.** Inherits from Strategy 2 — querying `accountBalanceHistory(SENTINEL)` over a recent range is the right shape for "show me recent activity in this protocol." Use a bounded forward range only when auditing a specific historical window.

Inscribe a small `Transfer` alongside the application payload, with the destination set to a known sentinel address (see [Destination as Protocol](#destination-as-protocol--a-native-xl1-pattern)). This forces the transaction into `accountBalanceHistory` so Strategy 2 can scan for it — turning the chain's address-scoped APIs into a free indexer for the application protocol.

```ts
import { PayloadBuilder } from '@xyo-network/sdk-js'
import { sentinelAddressFromSchema } from '@xyo-network/xl1-sdk'

// Pinned: equals sentinelAddressFromSchema('network.xyo.ordinal')
const ORDINAL_SENTINEL = '4b210503f8caa8e82d38617997f2eaf612c0ec04' as Address
const burnAddress      = sentinelAddressFromSchema('network.xyo.ordinal', appPayload._hash)

const transfer = new PayloadBuilder({ schema: 'network.xyo.transfer' })
  .fields({
    from: walletAddress,
    epoch: Date.now(),
    transfers: {
      [ORDINAL_SENTINEL]: '1',  // chain stores addresses without the 0x prefix
      [burnAddress]:      '1',
    },
  })
  .build()

await datalakeRunner.insert([appPayload])
await gateway.addPayloadsToChain([transfer], [appPayload])
```

The single `Transfer` payload carries both recipients via the `transfers` map — only one extra payload of gas, two sentinel destinations covered.

**When to use.**
- Low-volume application protocols where running a global indexer is overkill
- Any protocol that wants free chain-native protocol-wide and per-user indexing without infrastructure
- As a complement to Strategies 1+3 — gives users a way to verify their own activity using the chain's own APIs without trusting any specific indexer

**Peculiarities.** The chain's `Transfer` schema requires `from`, `epoch`, and `transfers`. `epoch: Date.now()` mirrors the canonical `gateway.sendMany` implementation. Addresses inside the `transfers` map are stored *without* the `0x` prefix — slice it off when constructing the payload. The destination addresses are computed via the keccak truncation construction documented in [Destination as Protocol](#destination-as-protocol--a-native-xl1-pattern).

**`tx.from` vs `transfer.from` — which is the actor?** The wrapping `TransactionBoundWitness` has a `from` field, and so does the `Transfer` payload. The chain's balance validator enforces `transfer.from === tx.from`, so they're always equal in well-formed transactions. They surface in different scan strategies, though:

- **Strategy 1+3 indexers** read `tx.from` from the `TransactionBoundWitness` directly. This is the canonical authorship field and it works uniformly for *every* application payload in the transaction — payloads with sentinel transfers and payloads without.
- **Strategy 4 chain-native consumers** read `transfer.from` because that's what `accountBalanceHistory` returns directly in the `[block, tx, transfer]` tuple. They never construct a `hashToSigner` index.

Both arrive at the same minter address. The substrate's reference indexer prefers `tx.from` because authorship is structural to the BoundWitness, not declarative content of a payload field — see [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md). Don't read `transfer.from` from your global indexer just because it's there; reach for the BoundWitness signer.

---

## Key Decisions

| Decision | Guidance |
|----------|----------|
| Indexing your dApp's own schemas? | **Bounded** — capture `INDEXER_FLOOR_BLOCK` during development, iterate from there. See [Floor Block](#floor-block) |
| Indexing pre-existing schemas (transfers, substrate, older protocols)? | **Unbounded** — set `INDEXER_FLOOR_BLOCK=0`, iterate from genesis. Substrate-shaped protocols additionally require ordered replay and a permanently-zero floor |
| Transaction context needed? | Use `connection.viewer.transaction.*` — gives you signer addresses, block number, fees |
| Just need payloads by type? | Two-step walk: `viewer.block.blockByNumber()` returns on-chain `TransactionBoundWitness` instances; scan their `payload_schemas[]` for your schema, gather the parallel `payload_hashes[]`, then fetch via `viewer.block.payloadsByHash(hashes)`. Block reads do **not** auto-hydrate off-chain payloads — see [Via Block Walk](#via-block-walk--schema-discovery-from-the-chain) |
| Need a specific payload? | Use `connection.viewer.block.payloadsByHash(hashes)` (or `RestDataLakeViewer.get(hashes)` for hashes obtained outside the gateway path) |
| Real-time updates with transient OK? | Poll `connection.viewer.block.currentBlockNumber()` on an interval |
| Real-time updates that drive durable state? | Poll `connection.viewer.finalization.headNumber()` — never derive state from unfinalized blocks |
| Anchoring choice (Path A vs B vs C)? | Default to A (TransactionBoundWitness reference). Use B for commit-then-reveal. Use C for multi-party attestation |
| Indexing global protocol state? | Strategy 1 — global block walk in a diviner |
| Showing "my X" in a dApp? | Strategy 3 — per-address side-index inside the global indexer, OR Strategy 4 sentinel transfer + `accountBalanceHistory` |
| Want free protocol-wide indexing without running a global indexer? | Strategy 4 — sentinel transfers to the protocol's static sentinel address |
| Want verifiable burn semantics for inscriptions? | Strategy 4 with per-payload derived sentinel address |
| Large result sets? | Slice block ranges on the viewer and process incrementally. XL1 datalakes do not have cursor pagination, so `RestDataLakeViewer.next()` is not a paginated read — never use it to browse |
