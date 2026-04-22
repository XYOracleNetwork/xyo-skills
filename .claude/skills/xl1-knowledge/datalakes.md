# Datalakes

**Key npm packages:**
- `@xyo-network/xl1-protocol-lib` — DataLakeViewer and DataLakeRunner interfaces

Note: Storage drivers (LMDB, MongoDB) are part of the `xyo-chain` runtime repo and not published as standalone npm packages. The interface above is what dApp developers interact with.

---

## What Are Datalakes

Datalakes are the structured data storage layer for the XL1 chain. They provide archival and querying capabilities for finalized chain data — blocks, transactions, and their payloads.

Datalakes build on XYO's **Archivist** module abstraction (see [XYO Knowledge — Modules](../xyo-knowledge/modules.md)). The chain's finalized data is served through a module identified as `Chain:Finalized`, accessible via the gateway's `/chain` endpoint.

### Datalake HTTP Endpoints

Each network exposes its datalake as a standalone HTTP archivist endpoint, separate from the gateway RPC:

| Network | Datalake URL |
|---------|-------------|
| **Mainnet** | `https://api.archivist.xyo.network/dataLake` |
| **Sequence** (beta) | `https://beta.api.archivist.xyo.network/dataLake` |
| **Local** | `http://localhost:8080/dataLake` |

**The datalake is not a property on the gateway JS object.** Use `RestDataLakeRunner` (writes) and `RestDataLakeViewer` (reads) from `@xyo-network/xl1-sdk` — not `defaultGateway.datalake` (which does not exist). The gateway RPC (`/rpc`) and the datalake (`/dataLake`) are separate services.

```ts
import { RestDataLakeRunner, RestDataLakeViewer } from '@xyo-network/xl1-sdk'

// Write: insert payloads into the datalake
const runner = new RestDataLakeRunner({ endpoint: 'https://api.archivist.xyo.network/dataLake' })
await runner.insert(payloads)

// Read: query payloads by schema
const viewer = new RestDataLakeViewer({ endpoint: 'https://api.archivist.xyo.network/dataLake', allowedSchemas })
const results = await viewer.next()
```

### Off-chain payload storage

The **dApp is responsible for persisting off-chain payloads to the datalake.** The browser wallet's `addPayloadsToChain(onChain, offChain)` submits a transaction whose BoundWitness references off-chain payloads by hash, but does **not** automatically store those payloads in a datalake. If the dApp doesn't persist them separately, the payload data is lost — only the hashes remain on-chain.

The correct flow for application data:

1. **Build** the application payloads (game state, attestations, etc.)
2. **Insert** them into the datalake via its archivist `insert` interface
3. **Submit** the transaction via `addPayloadsToChain` — the transaction's BoundWitness references the payloads by hash, linking on-chain proof to off-chain data

Custom payloads go in the `offChain` parameter because they are not `AllowedBlockPayload` system types. The datalake stores the actual payload data, and the chain stores the cryptographic reference.

When querying transactions later, the gateway's `ViewerWithDataLake` can transparently resolve off-chain payloads from the datalake — but only if the dApp stored them there in the first place.

---

## DataLake Viewer

The DataLake viewer extends the XYO `ReadArchivistFunctions` with schema-based filtering:

```ts
interface DataLakeViewerMethods {
  // Standard archivist read operations
  get(hashes: Hash[]): Promise<Payload[]>
  next(options?: NextOptions): Promise<Payload[]>

  // Schema filtering
  allowedSchemas?: Schema[]      // Only return payloads matching these schemas
  disallowedSchemas?: Schema[]   // Exclude payloads matching these schemas
}
```

Use the DataLake viewer to query finalized chain data by hash or with pagination via `next()`.

## DataLake Runner

The DataLake runner provides write operations with schema validation:

```ts
interface DataLakeRunnerMethods {
  insert(payloads: Payload[]): Promise<Payload[]>
  delete(hashes: Hash[]): Promise<Payload[]>
  clear(): Promise<void>
}
```

---

## Configuration

Datalakes support multiple backend configurations:

### RestDataLakeConfig
For connecting to a remote datalake over HTTP:

```ts
interface RestDataLakeConfig {
  uri: string                    // HTTP endpoint
  // ... additional connection options
}
```

### RouterDataLakeConfig
For routing requests to multiple backends based on rules:

```ts
interface RouterDataLakeConfig {
  routes: DataLakeRouteConfig[]  // Routing rules
  // Supports lazy circular references between configs
}
```

---

## Storage Backends

### LMDB (Local)
- Fast, embedded key-value store
- Best for single-node deployments and development
- Part of the `xyo-chain` runtime repo (not a standalone npm package)
- Config: `XL1_STORAGE__ROOT` env var sets the data directory

### MongoDB (Distributed)
- Distributed document store for multi-node deployments
- Part of the `xyo-chain` runtime repo (not a standalone npm package)
- Config: `XL1_STORAGE__MONGO__*` env vars for connection settings

---

## Querying Datalake Data via Gateway

The gateway exposes datalake data at the `/chain` endpoint using XYO archivist middleware. This means standard XYO archivist query patterns work:

1. **By hash** — retrieve specific payloads by their hash
2. **Paginated** — iterate through data using cursor-based pagination via `next()`
3. **Schema-filtered** — limit results to specific payload schemas

For dApp development, use the gateway's RPC interface (see [Gateway](gateway.md)) rather than querying the datalake directly. The RPC viewer methods (`blockViewer_*`, `transactionViewer_*`, etc.) provide typed, validated access to chain data.
