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
import { RestDataLakeRunner } from '@xyo-network/xl1-sdk'

const datalakeRunner = new RestDataLakeRunner({
  endpoint: 'https://api.archivist.xyo.network/dataLake',
})

const movePayload = new PayloadBuilder({ schema: MoveSchema })
  .fields({ gameId: 'abc123', move: 'rock' })
  .build()

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

## Step 3: Query by Schema

### Via RPC Viewer — Transaction-Centric Queries

Use `transactionViewer_*` methods via `defaultGateway` from `useProvidedGateway()` when you need full transaction context (who signed, when, block number):

```ts
// Get a specific transaction by hash — use defaultGateway, not a bare rpc variable
const tx = await defaultGateway.call('transactionViewer_byHash', [txHash])
// tx is SignedHydratedTransactionWithHashMeta | null
// tx[0] = TransactionBoundWitness, tx[1] = resolved payloads (including off-chain)
```

The gateway's `ViewerWithDataLake` transparently resolves off-chain payloads — you get complete hydrated transactions without querying the datalake separately.

### Via Datalake — Schema-Filtered Queries

When you need to find all payloads of a given type regardless of which transaction included them, use `RestDataLakeViewer` from `@xyo-network/xl1-sdk`. The datalake is a standalone HTTP archivist — not a property on the gateway JS object. See [Datalakes — HTTP Endpoints](../xl1-knowledge/datalakes.md) for the endpoint URLs.

```ts
import { RestDataLakeViewer } from '@xyo-network/xl1-sdk'

const viewer = new RestDataLakeViewer({
  endpoint: 'https://api.archivist.xyo.network/dataLake',
  allowedSchemas: [MoveSchema],
})

const moves = await viewer.next()
```

For multi-player dApps, combine this with a local payload store for immediate UI updates — see [In-Page Data Lakes — dApp State Management](in-page-datalakes.md).

### Via Payload Hash — Direct Lookup

When you already have a hash (from a transaction's `payload_hashes`), retrieve the payload directly:

```ts
const payloads = await defaultGateway.call('blockViewer_payloadsByHash', [hashes])
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

XL1 does not provide push-based subscriptions. Poll for new data by tracking the last-seen block number:

```ts
// Use defaultGateway from useProvidedGateway() — not a bare rpc variable.
// The gateway is the SDK's RPC client with the correct transport and provenance.
async function pollForNewData(
  gateway: ReturnType<typeof useProvidedGateway>['defaultGateway'],
  lastSeenBlock: number,
  schemas: Schema[],
): Promise<{ payloads: Payload[]; latestBlock: number }> {
  const currentBlock = await gateway.call('blockViewer_currentBlockNumber', [])

  if (currentBlock <= lastSeenBlock) {
    return { payloads: [], latestBlock: lastSeenBlock }
  }

  // Query blocks from lastSeenBlock+1 to currentBlock
  const newPayloads: Payload[] = []
  for (let block = lastSeenBlock + 1; block <= currentBlock; block++) {
    const hydrated = await gateway.call('blockViewer_blockByNumber', [block])
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

## Key Decisions

| Decision | Guidance |
|----------|----------|
| Transaction context needed? | Use `transactionViewer_*` RPC methods — gives you signer addresses, block number, fees |
| Just need payloads by type? | Use datalake schema filtering via `/chain` endpoint |
| Need a specific payload? | Use `blockViewer_payloadsByHash` with the hash |
| Real-time updates? | Poll `blockViewer_currentBlockNumber` on an interval |
| Large result sets? | Use cursor-based pagination via `next()` on the datalake |
