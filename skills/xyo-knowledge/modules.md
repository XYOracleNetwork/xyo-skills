# Module System

**Root barrel package:** `@xyo-network/sdk-js` — import everything from here. Tree shaking eliminates unused exports.

For full type details, read the `.d.ts` files at `dist/neutral/index.d.ts` in each package.

---

## The Module Abstraction

Every component in XYO implements the `QueryableModule` interface. This is the universal contract:

- **`address`** — unique identifier (derived from the module's account)
- **`config`** — configuration with a schema
- **`queries`** — array of query schemas this module supports
- **`query(queryBoundWitness, payloads)`** — execute a query, returns `[BoundWitness, Payload[], ModuleError[]]`

Modules communicate via **signed queries**: the caller creates a `QueryBoundWitness` containing the query payload, and the module returns a response bound witness with result payloads.

---

## Module Types

### Archivist — Storage

Archivists store and retrieve payloads.

```ts
interface ArchivistFunctions {
  insert(payloads: Payload[]): Promise<Payload[]>
  get(hashes: Hash[]): Promise<Payload[]>
  next(options?: NextOptions): Promise<Payload[]>
  delete(hashes: Hash[]): Promise<Payload[]>
  clear(): Promise<void>
}
```

**Implementations:** MemoryArchivist, IndexedDbArchivist, StorageArchivist, LevelDB, LMDB, MongoDB, Cookie, Firebase

**`.next()` is implementation-dependent.** Local browser archivists (IndexedDbArchivist, MemoryArchivist) implement real cursor pagination. The XL1 remote datalake does not — for XL1 chain reads, iterate the chain to discover hashes, then fetch by hash via `get()`. See [Datalakes — How to read](../xl1-knowledge/datalakes.md).

#### Browser Archivist Selection

| Archivist | Backing Store | Capacity | Schema Filtering | Persistence | Best For |
|-----------|---------------|----------|-----------------|-------------|----------|
| **IndexedDbArchivist** | Browser IndexedDB | 50 MB+ | Yes (built-in schema index) | Survives refresh + tab close | Primary local payload store — game state, moves, market data |
| **StorageArchivist** | localStorage / sessionStorage / page memory | ~5–10 MB (localStorage) | No | localStorage: survives refresh; session: tab-scoped; page: ephemeral | Small critical data — commit-reveal secrets (salts, choices), user preferences |
| **MemoryArchivist** | In-process LRU cache | Configurable (default 10,000 entries) | No | None — lost on refresh | Hot cache, poll buffer, testing |

**Decision logic:**
- Storing dApp payloads locally? → **IndexedDbArchivist** (large capacity, schema-indexed querying, cursor pagination)
- Persisting secrets that must never go on-chain? → **StorageArchivist** with `type: 'local'` (namespace-isolated, cross-tab sync)
- Ephemeral in-memory cache or tests? → **MemoryArchivist** (fast LRU, automatic eviction)

#### Creation Examples

All browser archivists share the standard archivist interface (`insert`, `get`, `next`, `delete`, `clear`) with built-in deduplication by data hash.

```ts
import { MemoryArchivist, MemoryArchivistConfigSchema } from '@xyo-network/sdk-js'
import { IndexedDbArchivist, IndexedDbArchivistConfigSchema } from '@xyo-network/archivist-indexeddb'
import { StorageArchivist, StorageArchivistConfigSchema } from '@xyo-network/archivist-storage'

// IndexedDbArchivist — primary local store for dApp payloads
const localStore = await IndexedDbArchivist.create({
  account: 'random',
  config: {
    schema: IndexedDbArchivistConfigSchema,
    dbName: 'my-dapp',        // IndexedDB database name
    storeName: 'payloads',    // object store name
  },
})

// StorageArchivist — small persistent secrets (salts, choices)
const secretStore = await StorageArchivist.create({
  account: 'random',
  config: {
    schema: StorageArchivistConfigSchema,
    type: 'local',              // 'local' | 'session' | 'page'
    namespace: 'my-dapp-secrets', // isolates keys from other apps
    maxEntrySize: 16_000,       // bytes per payload (default)
  },
})

// MemoryArchivist — in-memory cache or testing
const cache = await MemoryArchivist.create({
  account: 'random',
  config: { schema: MemoryArchivistConfigSchema, max: 10_000 },
})
```

#### Events

All archivists emit `inserted`, `deleted`, and `cleared` events. Use these to drive React state updates:

```ts
localStore.on('inserted', ({ payloads }) => {
  // Update UI with newly stored payloads
  setPayloads(prev => [...prev, ...payloads])
})
```

### Witness — Observation/Attestation

Witnesses observe state and produce attestation payloads.

```ts
interface WitnessQueryFunctions<TIn, TOut> {
  observe(payloads?: TIn[]): Promise<TOut[]>
}
```

**Implementations:** AdhocWitness, TimestampWitness, BlockchainWitness, EvmWitness, EnvironmentWitness

Use witnesses to create payloads that attest to some observed state — a timestamp, a blockchain value, a sensor reading, or custom application data.

### Sentinel — Orchestration

Sentinels coordinate multiple witnesses and aggregate their observations.

```ts
interface SentinelFunctions<TIn, TOut> {
  report(payloads?: TIn[]): Promise<TOut[]>
}
```

A sentinel has a **job/task system** for parallel and sequential witness execution. It emits lifecycle events: `JobStart`, `JobEnd`, `TaskStart`, `TaskEnd`, `ReportStart`, `ReportEnd`.

Use sentinels when you need to orchestrate multiple witnesses into a single report.

### Diviner — Query/Analysis

Diviners query archived data and derive results.

```ts
interface DivinerQueryFunctions<TIn, TOut> {
  divine(payloads?: TIn[]): Promise<TOut[]>
}
```

Takes query payloads as input, returns result payloads. The SDK includes **30+ specialized diviner variants**: payload, boundwitness, address-chain, address-history, schema-list, schema-stats, forecasting, jsonpath, jsonpatch, hash, identity, range, transform, and more.

### Node — Container/Registry

Nodes manage a tree of modules with parent-child relationships.

```ts
interface NodeFunctions {
  register(module: ModuleInstance): void
  attach(address: Address, external?: boolean): Promise<Address>
  detach(address: Address): Promise<Address>
  registered(): Promise<Address[]>
  attached(): Promise<Address[]>
  resolve(filter, options?: ResolveOptions): Promise<ModuleInstance[]>
}
```

- `attach(address, true)` — public child (visible to parent nodes)
- `attach(address, false)` — private child (hidden from parent)
- `resolve(filter, { direction: 'up'|'down'|'all', maxDepth })` — traverse the module tree

### Bridge — Network Communication

Bridges connect modules across network boundaries.

**Implementations:** HTTP, WebSocket, Worker, PubSub

Use bridges when modules need to communicate across processes or machines.

---

## Module Composition

The standard pattern for wiring modules together:

```ts
import { MemoryNode, MemoryArchivist, MemoryArchivistConfigSchema } from '@xyo-network/sdk-js'

// 1. Create a node
const node = await MemoryNode.create({ account: 'random' })

// 2. Create modules
const archivist = await MemoryArchivist.create({
  account: 'random',
  config: { schema: MemoryArchivistConfigSchema, name: 'GameArchivist' },
})

// 3. Register and attach
await node.register(archivist)
await node.attach(archivist.address, true)  // true = public

// 4. Resolve and use
const found = await node.resolve(archivist.address)
```

### Composition with Multiple Modules

```ts
// Create diviner that references the archivist
const diviner = await ArchivistPayloadDiviner.create({
  account: 'random',
  config: {
    schema: ArchivistPayloadDivinerConfigSchema,
    archivist: archivist.address,  // reference by address
  },
})

await node.register(diviner)
await node.attach(diviner.address, true)

// Now: insert payloads into archivist, query them via diviner
await archivist.insert([gamePayload])
const results = await diviner.divine([queryPayload])
```

---

## Module Resolution

Modules discover each other through the node's resolution system:

- **Down** — search child modules
- **Up** — search parent modules
- **All** — search in both directions

```ts
// Find all archivists attached to this node
const archivists = await node.resolve('*', { direction: 'down' })

// Find a specific module by address
const module = await node.resolve(targetAddress, { direction: 'all', maxDepth: 5 })
```

Resolution enables loose coupling — modules reference each other by address in their config, and the node resolves those addresses at runtime.

---

## Module Factory & Registration

Modules are created via factories registered by config schema:

```ts
class ModuleFactoryLocator {
  register(factory: CreatableModuleFactory, labels?: Labels): void
  locate(schema: Schema, labels?: Labels): CreatableModuleFactory
}
```

This enables dynamic instantiation: a manifest declares modules by schema, and the factory locator creates the right implementation.

---

## Manifest System

Manifests provide a declarative way to define module trees:

```ts
interface AuthoredNodeManifest {
  config: {
    schema: 'network.xyo.node.config'
    name: string
  }
  modules?: {
    public?: AuthoredModuleManifest[]
    private?: AuthoredModuleManifest[]
  }
}
```

Schema: `'network.xyo.node.manifest'`

Use manifests for production deployments where the module tree should be declared as configuration rather than built imperatively.
