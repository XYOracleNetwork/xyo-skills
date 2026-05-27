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

**The datalake is not a direct property on the gateway JS object.** The gateway RPC (`/rpc`) and the datalake (`/dataLake`) are separate services. Do not use `defaultGateway.datalake` (which does not exist). Note: `gateway.connection.storage` exists as a read-only `DataLakeViewer` when the connection is configured with a datalake endpoint, but it is not the recommended path for dApp code — it is read-only, and it may not point to the endpoint the dApp intends to use. Always create standalone datalake clients. See [Gateway — Accessing the Datalake](gateway.md#accessing-the-datalake).

### Two Independent Datalake Clients

There are two actors that can read from and write to datalakes, each with its own configuration:

1. **The browser wallet** — the wallet extension has its own datalake configuration. When a transaction is submitted through the wallet, it can persist payloads to whichever datalake(s) it is configured for. The dApp does not control this.

2. **The dApp/page** — the application code sets up its own datalake connection(s) via `createRestDataLakeRunner` (writes) and `createRestDataLakeViewer` (reads) from `@xyo-network/xl1-sdk`, pointing at whatever endpoint(s) it chooses. This is plain HTTP, completely independent of the wallet.

These two configurations are **independent**. The relationship between them is a deployment choice:

| Scenario | Wallet datalake | dApp datalake | Effect |
|----------|----------------|---------------|--------|
| **Same** | `endpoint A` | `endpoint A` | Both write to the same store — payloads are visible regardless of which actor wrote them |
| **Different** | `endpoint A` | `endpoint B` | Each writes to its own store — a viewer on one won't see writes from the other |
| **One-sided** | configured | none (or vice versa) | Only one actor persists payload data |

**Do not assume one covers the other.** The wallet may or may not write to a datalake the dApp can see, and vice versa. If the dApp needs payload data to be available for querying, it must write to its own datalake — regardless of what the wallet does.

**There is no public wallet permission for datalake access.** A dApp that needs to read or write the datalake does it directly over HTTP via the factories below — it does not request a permission from the wallet. The wallet does register internal `xyoDataLakes_get` / `xyoDataLakes_insert` methods, but they are gated behind a debug flag and are not granted on standard wallet builds. See [Wallet — Permissions](../xl1-patterns/wallet.md#permissions) for the full rule.

```ts
import { createRestDataLakeRunner, createRestDataLakeViewer } from '@xyo-network/xl1-sdk'

// dApp-configured datalake — independent of the wallet's datalake config
const runner = await createRestDataLakeRunner('https://api.archivist.xyo.network/dataLake')
await runner.insert(payloads)

const viewer = await createRestDataLakeViewer('https://api.archivist.xyo.network/dataLake')

// Read by hash. Hashes come from the chain — see Chain Data Indexing
// for how to discover them by walking blocks/transactions.
const results = await viewer.get(hashes)
```

The factory functions wrap a default `BaseConfig` provider context and return the `RestDataLakeRunner` / `RestDataLakeViewer` instance directly — dApp code no longer needs to construct a provider context manually.

### Off-chain payload storage

The **dApp is responsible for persisting off-chain payloads to its own datalake.** The browser wallet's `addPayloadsToChain(onChain, offChain)` submits a transaction whose BoundWitness references off-chain payloads by hash — but the wallet only writes those payloads to whatever datalake the *wallet* is configured for (if any). The dApp cannot rely on the wallet's datalake being the same endpoint it reads from, or being configured at all.

The correct flow for application data:

1. **Build** the application payloads (game state, attestations, etc.)
2. **Insert** them into the dApp's datalake via the runner's `.insert()` method — this is plain HTTP, no wallet needed. This ensures the dApp can read back its own data.
3. **Submit** the transaction via `addPayloadsToChain` — this requires the browser wallet. The transaction's BoundWitness references the payloads by hash, linking on-chain proof to off-chain data.

Custom payloads go in the `offChain` parameter because they are not `AllowedBlockPayload` system types. The chain stores the cryptographic reference (hash); the datalake stores the actual payload data.

When querying *that specific transaction* later via `viewer.transaction.byHash`, the gateway's `ViewerWithDataLake` transparently resolves the off-chain payloads from the datalake — but only if someone (wallet or dApp) stored them in a datalake that the viewer is configured to read from. Block-level reads do not do this; see [Gateway — What `block.blockByNumber` returns](gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow).

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

### How to read — iterate the chain, fetch by hash

The XL1 datalake is a content-addressed blob store. The chain is the index. The correct read pattern is:

1. **Iterate the chain** (via `gateway.connection.viewer.block.*` and `viewer.finalization.headNumber()`) to discover what payload hashes exist and in what order. The `TransactionBoundWitness.payload_hashes` on each transaction tells you which off-chain payloads the transaction references.
2. **Fetch payload bytes by hash** via `viewer.get(hashes)`.

The two-step pattern in practice splits across two viewer methods:

- **`viewer.block.blockByNumber(n)`** is the chain-iterate step — it returns the block's on-chain payloads (`BlockBoundWitness`, `TransactionBoundWitness` instances, `transfer`, `time`). It does **not** fetch the off-chain payloads referenced inside those nested transactions.
- **`viewer.block.payloadsByHash(hashes)`** is the hash-fetch step — it goes through `ViewerWithDataLake` and returns the off-chain payloads from the datalake.

Walk the chain to discover what hashes exist (read each `TransactionBoundWitness.payload_hashes[]` and the parallel `payload_schemas[]` to filter), then call `payloadsByHash` to fetch them. See [Gateway — What `block.blockByNumber` returns](gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow) for why the asymmetry exists and the canonical block-walk shape. Reach for `RestDataLakeViewer.get()` directly only when you have hashes from outside the gateway path (e.g., a hash you stored client-side or received out-of-band).

`viewer.transaction.byHash(txHash)` is the exception: it *does* hydrate its own off-chain payloads, because those hashes live in the transaction's own `payload_hashes[]` (which is what `addDataLakePayloads` actually inspects). Use it when you already have a tx hash and want everything that transaction wrapped in one round-trip.

**Do not use `.next()` to browse a remote XL1 datalake.** The method exists on the standard `ArchivistFunctions` interface, but remote XL1 datalakes do not implement cursor pagination — `.next()` against a `RestDataLakeViewer` returns an unbounded scan with no chain context (no block number, no signer, no finalization guarantee). It will appear to "work" on small datasets and silently scale poorly. See [Chain Data Indexing](../xl1-patterns/chain-data-indexing-protocol.md) for the chain-walk patterns that replace it.

`.next()` *is* still valid on **local browser archivists** (`IndexedDbArchivist`, `MemoryArchivist`) — they implement real cursor pagination and they are caches, not the chain-of-record. See [Module System — Browser Archivist Selection](../xyo-knowledge/modules.md).

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

The gateway exposes datalake data at the `/chain` endpoint using XYO archivist middleware. For dApp development, use the gateway's viewer API (see [Gateway](gateway.md)) rather than scanning the datalake with `.next()`. The `connection.viewer` sub-viewers provide typed, validated access to chain data — and `viewer.block.payloadsByHash(hashes)` goes through `ViewerWithDataLake` to fetch off-chain payloads from the datalake, so once you have hashes from a chain walk you do not have to touch the datalake client directly. Chain-side block reads (`viewer.block.blockByNumber(n)` and friends) return on-chain payloads only — see [Gateway — What `block.blockByNumber` returns](gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow) for the full hydration semantics.

When you do need to read the datalake directly, use `viewer.get(hashes)` with hashes you obtained from the chain. See [Chain Data Indexing](../xl1-patterns/chain-data-indexing-protocol.md) for the supported scan strategies.
