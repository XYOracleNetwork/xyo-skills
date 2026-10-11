# Datalakes

**Key npm packages:**
- `@xyo-network/xl1-protocol/protocol-lib` — DataLakeViewer and DataLakeRunner interfaces (subpath of the `@xyo-network/xl1-protocol` monolith)
- `@xyo-network/xl1-sdk` — `createRestDataLakeRunner` / `createRestDataLakeViewer` and the `ConfigZod` connection schema (root barrel; also re-exports the interfaces above)

The interfaces and factories above are what dApp developers interact with. The
operator side — the stores behind a node and the publishers behind the static
REST layout — is a set of standalone packages published from the `xl1-protocol`
repo:

| Package | Role |
|---------|------|
| `@xyo-network/xl1-driver-lmdb` | LMDB backing store (`lmdb` connections) |
| `@xyo-network/xl1-driver-mongodb` | MongoDB backing store (`mongo` connections) |
| `@xyo-network/xl1-driver-s3` | S3-compatible object store — AWS S3, Cloudflare R2, MinIO (`s3` connections) |
| `@xyo-network/xl1-s3-providers` | `S3*` providers that publish and read the static REST layout: finalized blocks, index, chain state, chain params, datalake content, EVM event index |
| `@xyo-network/xl1-system-status` | System status publishers (console and HTTP health endpoints) |

The in-process `memory` connection type needs nothing beyond `@xyo-network/xl1-sdk`
(see [Memory](#memory-ephemeral)). Deprecated
re-export shims — do not add them to new work: `@xyo-network/xl1-driver-cloudflare-r2`
(→ `xl1-driver-s3`, with `R2Map` aliased to `S3Map`), and
`@xyo-network/xl1-s3-publishers` / `@xyo-network/xl1-rest-block-publisher`
(→ `xl1-s3-providers`).

---

## What Are Datalakes

Datalakes are the structured data storage layer for the XL1 chain. They provide archival and querying capabilities for finalized chain data — blocks, transactions, and their payloads.

Datalakes build on XYO's **Archivist** module abstraction (see [XYO Knowledge — Modules](../xyo-knowledge/modules.md)). A datalake is a standalone REST service on its own host — it is not an endpoint on the gateway, and there is no `Chain:Finalized` module or `/chain` route on the current node.

### Tiered Data Storage: Database vs Datalake vs Archivist

Three storage tiers, each adding a constraint to the one before it:

| Tier | Stores | Keys |
|------|--------|------|
| **Database** | Data | Arbitrarily derived |
| **Datalake** | Data | Cryptographically derivable from the values |
| **Archivist** | Payloads | Cryptographically derivable from the values |

A database imposes no relationship between a key and its value — retrieval means trusting the store. A datalake is content-addressed: keys are cryptographically derivable from the values (e.g., a hash), so any reader can verify that what came back is what was stored, without trusting the store. An archivist keeps that key guarantee and further constrains the *values* to payloads — structured, schema-bearing data.

**When to use which:** a database when only the operator needs to trust the data; a datalake when untrusted parties must be able to verify what they retrieve; an archivist when that verifiable data must also be payloads the network can validate and reference on chain.

### Datalake HTTP Endpoints

Each network exposes its datalake as a standalone HTTP archivist endpoint, separate from the gateway RPC:

| Network | Datalake URL |
|---------|-------------|
| **Mainnet** | `https://api.archivist.xyo.network/dataLake` |
| **Sequence** (beta) | `https://beta.api.archivist.xyo.network/dataLake` |
| **Local** | `http://localhost:8080/dataLake` — carried by `NetworkDataLakeUrls`, but a plain `xl1 start` does not serve this route (the local `api` actor mounts only `/rpc`, `/rpc/indexed`, and probe routes). A local datalake is not part of the node; composing one beside a local chain is a test-stack concern |

**The datalake is not a direct property on the gateway JS object.** The gateway RPC (`/rpc`) and the datalake (`/dataLake`) are separate services. Do not use `defaultGateway.datalake` (which does not exist). Note: `gateway.connection.storage` exists when the connection is configured with a datalake endpoint — a `DataLakeRunner` on a write-capable gateway, a read-only `DataLakeViewer` otherwise — but it is not the recommended path for dApp code: what it can do depends on how the gateway was built, and it may not point to the endpoint the dApp intends to use. Always create standalone datalake clients. See [Gateway — Accessing the Datalake](gateway.md#accessing-the-datalake).

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

**There is no public wallet permission for datalake access.** A dApp that needs to read or write the datalake does it directly over HTTP via the factories below — it does not request a permission from the wallet. The wallet does have a typed, internal datalake surface: a `DataLakesClient` (`requestAccess` / `list` / `lakes` / `get` / `insert`) injected as `xyo.dataLakes`, whose `lakes()` hands back `DataLakePageViewer` / `DataLakePageRunner` providers over the wallet's `xyoDataLakes_get` / `xyoDataLakes_insert` methods. Lakes only exist there once the user adds them in the wallet's Data Lakes settings page, which appears only after the **Enable Data Lakes** debug setting is switched on — and the Debug page itself is only reachable in development or debug builds. It is not for dApps, whatever the types suggest: a dApp requests only `xyoWallet_getAccounts` from the wallet (that grant also covers `xyoSigner_address`) and never puts `xyoDataLakes_get` or `xyoDataLakes_insert` in a permission request. See also [Wallet — Permissions](../xl1-patterns/wallet.md#permissions) for the rest of the wallet's permission surface.

```ts
import { createRestDataLakeRunner, createRestDataLakeViewer } from '@xyo-network/xl1-sdk'

// dApp-configured datalake — independent of the wallet's datalake config
const runner = await createRestDataLakeRunner('https://api.archivist.xyo.network/dataLake')
await runner.insert(payloads)

const viewer = await createRestDataLakeViewer('https://api.archivist.xyo.network/dataLake')

// Read by hash. Hashes come from the chain — see "How to read" below
// for how to discover them by walking blocks/transactions.
const results = await viewer.get(hashes)
```

The factory functions wrap a default `BaseConfig` provider context and return the `RestDataLakeRunner` / `RestDataLakeViewer` instance directly — dApp code no longer needs to construct a provider context manually.

Use them rather than raw `fetch()` to the endpoint: `RestDataLakeRunner` and `RestDataLakeViewer` implement the archivist HTTP contract (request format, hash-keyed reads, schema filtering on the request), which a hand-rolled request may not match.

### Off-chain payload storage

The chain stores only the hash of each off-chain payload, so **the payload body must land in a datalake the dApp reads from.** Who writes it depends on the gateway that submits:

- **A runner gateway whose locator binds `DataLakeRunner`** (build the lake with `createRestDataLakeRunner(url)` and `createRestDataLakeViewer(url)`, then bind both monikers to that `rest` connection) registers a `RestDataLakeRunner`, and `addPayloadsToChain` / `addTransactionToChain` write the transaction's full content — the bound witness plus every `onChain` and `offChain` payload — to that datalake *before* broadcasting. No separate insert is needed when that is the datalake the dApp reads from. `dataLakeEndpoint` on `GatewayBuilder`, REST gateway config, and `launchXl1BrowserGatewaySystem` is a 5.x adapter for that same binding and is removed in 6.0.
- **A runner with no dApp-side datalake** — e.g. the browser wallet gateway — writes nothing to the dApp's datalake. The wallet's `addPayloadsToChain(onChain, offChain)` writes those payloads only to whatever datalake the *wallet* is configured for (if any); the dApp cannot rely on that being the endpoint it reads from, or being configured at all.

In the second case (or when the content must also land in a different datalake), the flow for application data is:

1. **Build** the application payloads (game state, attestations, etc.)
2. **Insert** them into the dApp's datalake via the runner's `.insert()` method — this is plain HTTP, no wallet needed. This ensures the dApp can read back its own data.
3. **Submit** the transaction via `addPayloadsToChain` — with the wallet gateway this triggers the wallet. The transaction's BoundWitness references the payloads by hash, linking on-chain proof to off-chain data.

Custom payloads go in the `offChain` parameter because they are not `AllowedBlockPayload` system types. The chain stores the cryptographic reference (hash); the datalake stores the actual payload data.

Reading them back is always by hash from that datalake (`viewer.get(hashes)` on a `RestDataLakeViewer`). Gateway reads — `viewer.transaction.byHash`, `viewer.block.payloadsByHash`, block reads — return only what the gateway's own payload store holds, which is the on-chain payloads, not the off-chain bodies; see [Gateway — What `block.blockByNumber` returns](gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow).

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

The two-step pattern in practice splits across the gateway and the datalake client:

- **`gateway.connection.viewer.block.blockByNumber(n)`** is the chain-iterate step — it returns the block's on-chain payloads (`BlockBoundWitness`, `TransactionBoundWitness` instances, `transfer`, `time`). It does **not** include the off-chain payloads referenced inside those nested transactions.
- **`RestDataLakeViewer.get(hashes)`** (from `createRestDataLakeViewer(endpoint)`) is the hash-fetch step — it returns the off-chain payloads from the datalake they were written to.

Walk the chain to discover what hashes exist (read each `TransactionBoundWitness.payload_hashes[]` and the parallel `payload_schemas[]` to filter), then fetch them from the datalake by hash. See [Gateway — What `block.blockByNumber` returns](gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow) for the gateway read semantics and the canonical block-walk shape.

`viewer.block.payloadsByHash(hashes)` and `viewer.transaction.byHash(txHash)` are not substitutes for the datalake fetch: both read the gateway's own payload store, which holds the on-chain payloads, not off-chain bodies. `transaction.byHash` returns the transaction bound witness plus whichever of its payloads that store holds; take its `payload_hashes[]` to the datalake for the rest.

**Trust boundary.** What the gateway's viewers return — block envelopes, `TransactionBoundWitness` fields (`from`, `payload_hashes`, `payload_schemas`), block numbers, signatures — the chain has already validated; trust it as the SDK presents it. A body fetched from a datalake has not been: anyone can write bytes there, including bytes that carry a schema name without its shape. Keep a body only if it hashes back (`PayloadBuilder.hash`) to the hash the transaction lists and passes the payload's Zod guard.

**Do not use `.next()` to browse a remote XL1 datalake.** The method exists on the standard `ArchivistFunctions` interface, but remote XL1 datalakes do not implement cursor pagination — `.next()` against a `RestDataLakeViewer` returns an unbounded scan with no chain context (no block number, no signer, no finalization guarantee). It will appear to "work" on small datasets and silently scale poorly. The two-step read above — walk blocks, collect `payload_hashes` filtered by `payload_schemas`, `get()` the bodies by hash — replaces it. See also [Chain Data Indexing](../xl1-patterns/chain-data-indexing-protocol.md) for the full block-walk recipe and scan strategies.

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

A remote datalake is a **named `rest` connection** (`{ type: 'rest', baseUrl }`) plus `providerBindings` that point the `DataLakeViewer` / `DataLakeRunner` monikers at it. That is the model. `createRestDataLakeViewer(url)` and `createRestDataLakeRunner(url)` build one such lake. Bind those monikers through the locator when a gateway should use it. `GatewayBuilder().dataLakeEndpoint(url)` (and the REST and browser `dataLakeEndpoint` options) still write this same binding through 5.x and are removed in 6.0:

```ts
import { ConfigZod } from '@xyo-network/xl1-sdk'

const config = ConfigZod.parse({
  connections: {
    'rest-data-lake': { type: 'rest', baseUrl: 'https://api.archivist.xyo.network/dataLake' },
  },
  providerBindings: {
    DataLakeViewer: { connection: 'rest-data-lake' },
    DataLakeRunner: { connection: 'rest-data-lake' }, // omit for read-only access
  },
})
```

The connection name is arbitrary. The pre-migration `RestDataLakeConfig` (`uri`), `RouterDataLakeConfig`, and `DataLakeRouteConfig` types no longer exist — there is no datalake router config.

---

## Storage Backends

Backing stores are declared as **named connections**. Since XL1 3.0 the pre-3.0
`storage`, `remote`, `transports`, and `evm.jsonRpc` / `evm.infura` config fields
are gone — every backing store, RPC endpoint, EVM RPC, and S3 bucket lives under
`connections`, addressed by name.

### LMDB (Local)
- Fast, embedded key-value store
- Best for single-node deployments and development
- Standalone package: `@xyo-network/xl1-driver-lmdb`, published from `xl1-protocol`
- Config: a named connection, e.g. `XL1_CONNECTIONS__LOCAL_STORE__TYPE=lmdb` plus `XL1_CONNECTIONS__LOCAL_STORE__ROOT=.store`

### MongoDB (Distributed)
- Distributed document store for multi-node deployments
- Standalone package: `@xyo-network/xl1-driver-mongodb`, published from `xl1-protocol`
- Config: a named connection, e.g. `XL1_CONNECTIONS__CHAIN_MONGO__TYPE=mongo` plus `__CONNECTION_STRING` and `__DATABASE`

### S3 / object store
- Standalone package: `@xyo-network/xl1-driver-s3` — covers AWS S3, Cloudflare R2, and MinIO. `@xyo-network/xl1-driver-cloudflare-r2` is only a deprecated re-export of it
- Config: a named connection of type `s3`

### Memory (ephemeral)
- In-process shared memory backed by a `MemoryArchivist` — for tests and throwaway nodes; nothing survives a restart
- No separate package; the in-memory maps ship in the `@xyo-network/xl1-sdk/driver-memory` subpath
- Config: a named connection of type `memory`, e.g. `XL1_CONNECTIONS__SCRATCH__TYPE=memory`

---

## Querying Datalake Data via Gateway

For dApp development, use the gateway's viewer API (see [Gateway](gateway.md)) to discover hashes rather than scanning the datalake with `.next()`. The `connection.viewer` sub-viewers provide typed, validated access to chain data, but they never read from a datalake — block reads, `viewer.transaction.byHash`, and `viewer.block.payloadsByHash` return only what the gateway's own payload store holds (the on-chain payloads). See [Gateway — What `block.blockByNumber` returns](gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow) for the full read semantics.

To read off-chain payloads, use the datalake viewer's `get(hashes)` with hashes you obtained from the chain — each `TransactionBoundWitness.payload_hashes[]`, filtered by the parallel `payload_schemas[]` (see [How to read](#how-to-read--iterate-the-chain-fetch-by-hash)). For scan strategies beyond a forward block walk, see also [Chain Data Indexing](../xl1-patterns/chain-data-indexing-protocol.md#scan-strategies--reading-indexed-data).
