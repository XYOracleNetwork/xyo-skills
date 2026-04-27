# Chain Data Indexing

Read this pattern when your dApp needs to retrieve, filter, or watch application-specific data from the XL1 chain.

**Builds on:**
- [Datalakes](../xl1-knowledge/datalakes.md) — DataLakeViewer, schema filtering, `/chain` endpoint
- [Gateway](../xl1-knowledge/gateway.md) — RPC viewer methods, transports
- [Protocol Primitives](../xyo-knowledge/primitives.md) — payloads, schemas, hashing
- [Browser Wallet](../xl1-knowledge/wallet.md) — `useProvidedGateway()` for gateway access

---

## The Problem

Your dApp submits application payloads (game moves, attestations, predictions) as off-chain data via `addPayloadsToChain`. Later, you need to retrieve them — filtered by schema, scoped to specific addresses, or paginated for display. The chain stores everything; your app only cares about its own data.

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

// Application schema namespace: network.xyo.<app>.<entity>
const GameSchema = asSchema('network.xyo.rps.game', true)
const MoveSchema = asSchema('network.xyo.rps.move', true)
const ResultSchema = asSchema('network.xyo.rps.result', true)
```

Define payload types using the [Zod-first pattern](../xl1-knowledge/development.md):

```ts
import { zodIsFactory, zodAsFactory, zodToFactory } from '@xylabs/sdk-js'
import { z } from 'zod'

export const MovePayloadZod = z.object({
  schema: z.literal('network.xyo.rps.move'),
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
import { RestDataLakeRunner, type RestDataLakeRunnerParams } from '@xyo-network/xl1-sdk'
import { getTestProviderContext } from '@xyo-network/xl1-protocol-sdk/test'

// See Gateway Usage — Accessing the Datalake for full setup details
const context = getTestProviderContext()
const datalakeRunner = await RestDataLakeRunner.create({
  context,
  endpoint: 'https://api.archivist.xyo.network/dataLake',
} satisfies RestDataLakeRunnerParams)

const movePayload: MovePayload = asMovePayload(
  new PayloadBuilder({ schema: MoveSchema })
    .fields({ gameId: 'abc123', move: 'rock' })
    .build(),
  true,
)

// 1. Insert into the dApp's datalake first — this makes the payload queryable
await datalakeRunner.insert([movePayload])

// 2. Then submit the transaction — the BoundWitness references the payload by hash
const [txHash, signedTx] = await defaultGateway.addPayloadsToChain([], [movePayload])
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

### Application uses

Two complementary patterns. Use either or both.

**Static protocol sentinel** — derived from the protocol's identifier string. Every transaction in the protocol includes a transfer to this fixed address. Anyone can then query `accountBalanceHistory(SENTINEL)` for a chain-native list of every protocol invocation — no global indexer required.

```ts
import { keccak256, toUtf8Bytes } from 'ethers'

const ORDINAL_SENTINEL = '0x' + keccak256(toUtf8Bytes('network.xyo.ordinal')).slice(-40)
// → 0x4b210503f8caa8e82d38617997f2eaf612c0ec04
```

**Per-payload derived sentinel** — derived from each payload's hash. The dust transferred there is verifiably burned (no key, address-bound to that specific payload). Strong "real cost" semantic — every inscription costs something irrecoverable.

```ts
// Following the chain's idiom:
const burnAddress = '0x' + keccak256(toUtf8Bytes(`network.xyo.ordinal|${payload._hash}`)).slice(-40)

// Or via the SDK helper (if/when extended to accept Hash inputs):
// const burnAddress = derivedReceiveAddress(payload._hash, 'network.xyo.ordinal')
```

For protocols that want both — free chain-native indexing *and* per-payload burn — include both addresses as recipients in a single `Transfer` payload (the `transfers` field is a map; one extra payload, two recipients).

### Pinned addresses for ordinal protocols

The ordinal substrate and XRC-20 reserve these sentinels. They are deterministic outputs of the construction above and are reproducible by anyone:

| Protocol | Seed | Pinned address |
|---|---|---|
| Ordinal substrate | `network.xyo.ordinal` | `0x4b210503f8caa8e82d38617997f2eaf612c0ec04` |
| XRC-20 fungible tokens | `network.xyo.ordinal.token` | `0xc17df06bc481b090f7a0e03639fca786df6e8e65` |

Verify locally before relying:

```ts
import { keccak256, toUtf8Bytes } from 'ethers'
console.log('0x' + keccak256(toUtf8Bytes('network.xyo.ordinal')).slice(-40))
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
const [txHash] = await defaultGateway.addPayloadsToChain([], [myPayload])
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
const [txHash] = await defaultGateway.addPayloadsToChain([hashCommit], [payload])
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
const [txHash] = await defaultGateway.addPayloadsToChain([witness[0]], [content])
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
const tx = await defaultGateway.connection.viewer?.transaction.byHash(txHash)
// tx is SignedHydratedTransactionWithHashMeta | null
// tx[0] = TransactionBoundWitness, tx[1] = resolved payloads (including off-chain)
```

The gateway's `ViewerWithDataLake` transparently resolves off-chain payloads — you get complete hydrated transactions without querying the datalake separately.

### Via Datalake — Schema-Filtered Queries

When you need to find all payloads of a given type regardless of which transaction included them, use `RestDataLakeViewer` from `@xyo-network/xl1-sdk`. The datalake is a standalone HTTP archivist — not a property on the gateway JS object. See [Datalakes — HTTP Endpoints](../xl1-knowledge/datalakes.md) for the endpoint URLs.

```ts
import { RestDataLakeViewer, type RestDataLakeViewerParams } from '@xyo-network/xl1-sdk'
import { getTestProviderContext } from '@xyo-network/xl1-protocol-sdk/test'

const context = getTestProviderContext()
const viewer = await RestDataLakeViewer.create({
  context,
  endpoint: 'https://api.archivist.xyo.network/dataLake',
  allowedSchemas: [MoveSchema],
} satisfies RestDataLakeViewerParams)

const moves = await viewer.next()
```

For multi-player dApps, combine this with a local payload store for immediate UI updates — see [In-Page Data Lakes — dApp State Management](in-page-datalakes.md).

### Via Payload Hash — Direct Lookup

When you already have a hash (from a transaction's `payload_hashes`), retrieve the payload directly:

```ts
const payloads = await defaultGateway.connection.viewer?.block.payloadsByHash(hashes)
```

---

## Step 4: Build an Application Read Model

Transform raw chain payloads into your application's domain model. Use schema-based type guards to filter and narrow:

```ts
import { isPayloadOfSchemaType } from '@xyo-network/sdk-js'

const isMovePayload = isPayloadOfSchemaType<MovePayload>('network.xyo.rps.move')
const isResultPayload = isPayloadOfSchemaType<ResultPayload>('network.xyo.rps.result')

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

// Use defaultGateway from useProvidedGateway() — not a bare rpc variable.
// The gateway is the SDK's typed client; reach RPC viewers via connection.viewer.
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

For React dApps, wrap this in a hook with an interval:

```ts
function useChainData(schemas: Schema[], intervalMs = 5000) {
  const { defaultGateway } = useProvidedGateway()
  const [data, setData] = useState<Payload[]>([])
  const lastBlockRef = useRef(0)

  useEffect(() => {
    if (!defaultGateway) return

    const poll = async () => {
      const { payloads, latestBlock } = await pollForNewData(
        defaultGateway,
        lastBlockRef.current,
        schemas,
      )
      if (payloads.length > 0) {
        setData(prev => [...prev, ...payloads])
      }
      lastBlockRef.current = latestBlock
    }

    const id = setInterval(poll, intervalMs)
    poll() // initial fetch
    return () => clearInterval(id)
  }, [defaultGateway, schemas, intervalMs])

  return data
}
```

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

### Strategy 1: Global block walk

The reference indexer pattern. Poll `viewer.finalization.headNumber()`, iterate every finalized block from `lastProcessed + 1` to head, dispatch each block's payloads through application handlers. Full coverage, deterministic state derivation across competing indexers. See [Inscription Substrate § Replay loop](inscription-substrate.md#replay-loop) for a worked example.

**When to use.** Any indexer that derives global state. Required for ledger correctness, ownership maps, supply tracking. The chain's authoritative indexing model.

**Cost.** Constant per-block work; storage scales with state, not with block count. The diviner this runs in is the protocol's reference implementation; competing implementations must agree on the same finalized stream.

### Strategy 2: Address-scoped via balance history

Use `viewer.account.balance.accountBalanceHistory(address, { range })`. Returns hydrated `[block, tx, transfer]` tuples for every transaction containing a `Transfer` payload involving the address.

```ts
const history = await defaultGateway.connection.viewer?.account.balance
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

### Strategy 3: Indexer-maintained per-address side-index

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

### Strategy 4: Sentinel transfer

Inscribe a small `Transfer` alongside the application payload, with the destination set to a known sentinel address (see [Destination as Protocol](#destination-as-protocol--a-native-xl1-pattern)). This forces the transaction into `accountBalanceHistory` so Strategy 2 can scan for it — turning the chain's address-scoped APIs into a free indexer for the application protocol.

```ts
import { PayloadBuilder } from '@xyo-network/sdk-js'
import { keccak256, toUtf8Bytes } from 'ethers'

const ORDINAL_SENTINEL = '0x4b210503f8caa8e82d38617997f2eaf612c0ec04' as Address
const burnAddress      = ('0x' + keccak256(toUtf8Bytes(`network.xyo.ordinal|${appPayload._hash}`)).slice(-40)) as Address

const transfer = new PayloadBuilder({ schema: 'network.xyo.transfer' })
  .fields({
    from: walletAddress,
    epoch: Date.now(),
    transfers: {
      [ORDINAL_SENTINEL.slice(2)]: '1',  // chain stores addresses without the 0x prefix
      [burnAddress.slice(2)]:      '1',
    },
  })
  .build()

await datalakeRunner.insert([appPayload])
await defaultGateway.addPayloadsToChain([transfer], [appPayload])
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
| Transaction context needed? | Use `connection.viewer.transaction.*` — gives you signer addresses, block number, fees |
| Just need payloads by type? | Use `RestDataLakeViewer` with `allowedSchemas` filtering |
| Need a specific payload? | Use `connection.viewer.block.payloadsByHash(hashes)` |
| Real-time updates with transient OK? | Poll `connection.viewer.block.currentBlockNumber()` on an interval |
| Real-time updates that drive durable state? | Poll `connection.viewer.finalization.headNumber()` — never derive state from unfinalized blocks |
| Anchoring choice (Path A vs B vs C)? | Default to A (TransactionBoundWitness reference). Use B for commit-then-reveal. Use C for multi-party attestation |
| Indexing global protocol state? | Strategy 1 — global block walk in a diviner |
| Showing "my X" in a dApp? | Strategy 3 — per-address side-index inside the global indexer, OR Strategy 4 sentinel transfer + `accountBalanceHistory` |
| Want free protocol-wide indexing without running a global indexer? | Strategy 4 — sentinel transfers to the protocol's static sentinel address |
| Want verifiable burn semantics for inscriptions? | Strategy 4 with per-payload derived sentinel address |
| Large result sets from datalake? | Use block-range slicing on the viewer; XL1 datalakes do not have cursor pagination |
