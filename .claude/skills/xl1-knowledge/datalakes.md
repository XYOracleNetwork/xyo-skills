# Datalakes

**Key npm packages:**
- `@xyo-network/xl1-protocol-lib` — DataLakeViewer and DataLakeRunner interfaces

Note: Storage drivers (LMDB, MongoDB) are part of the `xyo-chain` runtime repo and not published as standalone npm packages. The interface above is what dApp developers interact with.

---

## What Are Datalakes

Datalakes are the structured data storage layer for the XL1 chain. They provide archival and querying capabilities for finalized chain data — blocks, transactions, and their payloads.

Datalakes build on XYO's **Archivist** module abstraction (see [XYO Knowledge — Modules](../xyo-knowledge/modules.md)). The chain's finalized data is served through a module identified as `Chain:Finalized`, accessible via the gateway's `/chain` endpoint.

### Off-chain payload storage

When a dApp submits a transaction via `gateway.addPayloadsToChain(onChain, offChain)`, the gateway automatically persists the off-chain payloads to the datalake. There is no separate submission step — off-chain payloads are immediately queryable from the datalake after the transaction is broadcast.

This is the primary mechanism for storing application data on XL1. Custom payloads (game results, attestations, etc.) go in the `offChain` parameter because they are not `AllowedBlockPayload` system types. The transaction's `BoundWitness` references them by hash, and the datalake stores the actual payload data.

When querying transactions later, the gateway's `ViewerWithDataLake` transparently resolves off-chain payloads from the datalake — so the application gets complete hydrated transactions without needing to query the datalake separately.

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
