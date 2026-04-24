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

**The datalake is not a direct property on the gateway JS object.** The gateway RPC (`/rpc`) and the datalake (`/dataLake`) are separate services. Do not use `defaultGateway.datalake` (which does not exist). Note: `gateway.connection.storage` exists as a read-only `DataLakeViewer` when the connection is configured with a datalake endpoint, but it is not the recommended path for dApp code — it is read-only, and it may not point to the endpoint the dApp intends to use. Always create standalone datalake clients. See [Gateway Usage — Accessing the Datalake](../xl1-patterns/gateway-usage.md).

### Two Independent Datalake Clients

There are two actors that can read from and write to datalakes, each with its own configuration:

1. **The browser wallet** — the wallet extension has its own datalake configuration. When a transaction is submitted through the wallet, it can persist payloads to whichever datalake(s) it is configured for. The dApp does not control this.

2. **The dApp/page** — the application code sets up its own datalake connection(s) via `RestDataLakeRunner` (writes) and `RestDataLakeViewer` (reads) from `@xyo-network/xl1-sdk`, pointing at whatever endpoint(s) it chooses. This is plain HTTP, completely independent of the wallet.

These two configurations are **independent**. The relationship between them is a deployment choice:

| Scenario | Wallet datalake | dApp datalake | Effect |
|----------|----------------|---------------|--------|
| **Same** | `endpoint A` | `endpoint A` | Both write to the same store — payloads are visible regardless of which actor wrote them |
| **Different** | `endpoint A` | `endpoint B` | Each writes to its own store — a viewer on one won't see writes from the other |
| **One-sided** | configured | none (or vice versa) | Only one actor persists payload data |

**Do not assume one covers the other.** The wallet may or may not write to a datalake the dApp can see, and vice versa. If the dApp needs payload data to be available for querying, it must write to its own datalake — regardless of what the wallet does.

```ts
import {
  RestDataLakeRunner,
  RestDataLakeViewer,
  type RestDataLakeRunnerParams,
  type RestDataLakeViewerParams,
} from '@xyo-network/xl1-sdk'

// dApp-configured datalake — independent of the wallet's datalake config
const runner = await RestDataLakeRunner.create({
  context,
  endpoint: 'https://api.archivist.xyo.network/dataLake',
} satisfies RestDataLakeRunnerParams)
await runner.insert(payloads)

const viewer = await RestDataLakeViewer.create({
  context,
  endpoint: 'https://api.archivist.xyo.network/dataLake',
  allowedSchemas,
} satisfies RestDataLakeViewerParams)
const results = await viewer.next()
```

### Off-chain payload storage

The **dApp is responsible for persisting off-chain payloads to its own datalake.** The browser wallet's `addPayloadsToChain(onChain, offChain)` submits a transaction whose BoundWitness references off-chain payloads by hash — but the wallet only writes those payloads to whatever datalake the *wallet* is configured for (if any). The dApp cannot rely on the wallet's datalake being the same endpoint it reads from, or being configured at all.

The correct flow for application data:

1. **Build** the application payloads (game state, attestations, etc.)
2. **Insert** them into the dApp's datalake via `RestDataLakeRunner.insert()` — this is plain HTTP, no wallet needed. This ensures the dApp can read back its own data.
3. **Submit** the transaction via `addPayloadsToChain` — this requires the browser wallet. The transaction's BoundWitness references the payloads by hash, linking on-chain proof to off-chain data.

Custom payloads go in the `offChain` parameter because they are not `AllowedBlockPayload` system types. The chain stores the cryptographic reference (hash); the datalake stores the actual payload data.

When querying transactions later, the gateway's `ViewerWithDataLake` can transparently resolve off-chain payloads from the datalake — but only if someone (wallet or dApp) stored them in a datalake that the viewer is configured to read from.

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

For dApp development, use the gateway's viewer API (see [Gateway](gateway.md)) rather than querying the datalake directly. The `connection.viewer` sub-viewers provide typed, validated access to chain data.
