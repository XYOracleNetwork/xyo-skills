# Module System

**Root barrel package:** `@xyo-network/sdk` — start here for protocol primitives and generic modules; tree shaking eliminates unused exports. Specific diviner / witness / archivist *implementations* ship as their own packages and are imported by name (noted per example below).

For full type details, read the `.d.ts` files under `dist/neutral/modules/<name>/` in `@xyo-network/sdk` (e.g. `archivist-model`, `node-model`), or `dist/neutral/index.d.ts` in a standalone package.

---

**Versioned identity:** SDK archivists store and dedupe on the root hash
(`_hash`), so variants that share a data hash but differ in `$version` or other
client metadata are kept side by side. `get()` accepts a data hash too, but
answers it with a data-only view (`$*` removed, `_hash` set to the data hash),
not a stored representation — look up by root hash when the representation
matters. New application identity and validation caches should use root hashes
and applicable policy. See [Payload Schema Evolution and Identity](payload-schema-evolution.md).

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

Archivists store and retrieve payloads. An archivist is content-addressed storage constrained to payloads: every key is a hash cryptographically derivable from the stored value, so a reader can verify what came back without trusting the store — unlike a database, whose keys bear no relationship to its values.

The archivist surface is split by capability — there is no single
`ArchivistFunctions` interface. `archivist-model` defines four function groups;
the `Archivist` interface (and `ArchivistInstance`) combines them. Shown with
the payload types an archivist instance uses (`PromisableArray<T>` = `Promisable<T[]>`):

```ts
// ReadArchivistFunctions
get(hashes: Hash[]): PromisableArray<WithStorageMeta<Payload>>    // root or data hashes
next(options?: ArchivistNextOptions): PromisableArray<WithStorageMeta<Payload>>

// WriteArchivistFunctions
insert(payloads: Payload[]): PromisableArray<WithStorageMeta<Payload>>  // newly stored only
delete(hashes: Hash[]): PromisableArray<WithStorageMeta<Payload>>
clear(): Promisable<void>

// StashArchivistFunctions
commit(): PromisableArray<WithStorageMeta<Payload>>

// AllArchivistFunctions — NOT the combined interface; just these two
all(): PromisableArray<WithStorageMeta<Payload>>   // @deprecated — use next() or snapshot()
snapshot(): PromisableArray<PayloadHashMap<WithStorageMeta<Payload>>>
```

`insert` returns only the payloads it newly stored — one whose root hash is
already present is skipped and not returned.

**Implementations:**

- On the `@xyo-network/sdk` barrel: `MemoryArchivist`, `GenericArchivist` (backed by a pluggable `ArchivistDriver`), `ViewArchivist` (read-only view over an `originArchivist`)
- Standalone 8.0.x packages: `IndexedDbArchivist` (`@xyo-network/archivist-indexeddb`), `StorageArchivist` (`archivist-storage`), `CookieArchivist` (`archivist-cookie`), `FilesystemArchivist` (`archivist-filesystem`), `S3Archivist` (`archivist-s3`), `LevelDbArchivist` (`archivist-leveldb`), `LmdbArchivist` (`archivist-lmdb`), `MongoDBArchivist` (`archivist-mongodb`), `FirebaseArchivist` (`archivist-firebase`)
- `@xyo-network/archivist-express` is not an archivist: it exports `archivistRestMiddleware`, Express middleware that serves an archivist over REST

**`.next()` is implementation-dependent.** Local browser archivists (IndexedDbArchivist, MemoryArchivist) implement real cursor pagination. A remote, HTTP-backed store may not — confirm its implementation supports cursors before paging it. Otherwise discover the hashes you need from a structure you trust (such as the `payload_hashes` of validated bound witnesses) and fetch them by hash with `get()`.

Building on XL1? Its remote datalake has no cursor pagination — see [XL1 Datalakes — How to read](../xl1-knowledge/datalakes.md#how-to-read--iterate-the-chain-fetch-by-hash).

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

All browser archivists share the standard archivist interface (`insert`, `get`, `next`, `delete`, `clear`) with built-in deduplication by root hash (`_hash`). The data hash is only a lookup alias: `get()` accepts it but returns a data-only view without `$*` metadata.

```ts
import { MemoryArchivist, MemoryArchivistConfigSchema } from '@xyo-network/sdk'
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
  observe(payloads?: TIn[]): Promisable<WithoutPrivateStorageMeta<TOut>[]>
  observeQuery(payloads?: TIn[], account?: AccountInstance): Promisable<ModuleQueryResult<TOut>>
}
```

**Implementations:** `AdhocWitness` (on the root barrel), `TimestampWitness` (`@xyo-network/witness-timestamp`), `EnvironmentWitness` (`@xyo-network/witness-environment`). `@xyo-network/witness-evm` ships only an abstract base (`AbstractEvmWitness`), and `@xyo-network/witness-blockchain` only provider helpers (`getProviderFromEnv`, `checkIpfsUrl`, …) — neither has a ready-to-use concrete class, so don't assume a `BlockchainWitness` / `EvmWitness` export exists.

Use witnesses to create payloads that attest to some observed state — a timestamp, a blockchain value, a sensor reading, or custom application data.

### Sentinel — Orchestration

Sentinels coordinate multiple witnesses and aggregate their observations.

`report` lives on the `Sentinel` type itself (`sentinel-model`) — there is no
separate `SentinelFunctions` interface:

```ts
report(payloads?: TIn[]): Promisable<TOut[]>
reportQuery(payloads?: TIn[], account?: AccountInstance): Promisable<ModuleQueryResult<TOut>>
```

A sentinel has a **job/task system** for parallel and sequential witness execution (`MemorySentinel` is on the barrel). It emits camelCase lifecycle events: `jobStart`, `jobEnd`, `taskStart`, `taskEnd`, `reportStart`, `reportEnd` — e.g. `sentinel.on('reportEnd', …)`.

Use sentinels when you need to orchestrate multiple witnesses into a single report.

### Diviner — Query/Analysis

Diviners query archived data and derive results.

```ts
interface DivinerQueryFunctions<TIn, TOut> {
  divine(payloads?: TIn[], retry?: RetryConfig): Promise<WithoutPrivateStorageMeta<TOut>[]>
  divineQuery(payloads?: TIn[], account?: AccountInstance, retry?: RetryConfig): Promise<ModuleQueryResult<TOut>>
}
```

Takes query payloads as input, returns result payloads. The payload, boundwitness, and identity diviners are on the `@xyo-network/sdk` barrel — `GenericPayloadDiviner`, `MemoryBoundWitnessDiviner` (abstract base `BoundWitnessDiviner`), and `IdentityDiviner`. Their old standalone packages (`@xyo-network/diviner-payload`, `diviner-payload-generic`, `diviner-payload-abstract`, `diviner-payload-model`, `diviner-boundwitness`, `diviner-identity`, plus `diviner`, `diviner-abstract`, `diviner-model`) are deprecated re-export shims — don't install them. The specialized diviners remain individual 8.0.x packages imported as `@xyo-network/diviner-<name>`: archivist, address-chain, address-history, schema-list, schema-stats, forecasting, jsonpath, jsonpatch, hash-lease, range, transform.

### Node — Container/Registry

Nodes manage a tree of modules with parent-child relationships.

```ts
// Split across NodeRegistrationFunctions and NodeQueryFunctions
// (node-model) — there is no single `NodeFunctions` interface.
register(mod: AttachableModuleInstance): Promise<void>      // async — await it
attach(id: ModuleIdentifier, external?: boolean): Promise<XyoAddress | undefined>
detach(id: ModuleIdentifier): Promise<XyoAddress | undefined>
registered(): Promise<XyoAddress[]>
attached(): Promise<XyoAddress[]>

// On every ModuleInstance (not node-specific)
resolve('*', options?: ObjectFilterOptions): Promise<ModuleInstance[]>
resolve(id: ModuleIdentifier, options?: ObjectFilterOptions): Promise<ModuleInstance | undefined>
```

`ModuleIdentifier` is an address, a module name, or a colon-joined path of them
(`'ChildNode:GameArchivist'`). The query functions (`attach`, `detach`,
`registered`, `attached`) each have a `…Query` variant (e.g. `attachQuery`) that
returns the raw `ModuleQueryResult`.

- `attach(id, true)` — public child (visible to parent nodes)
- `attach(id, false)` — private child (hidden from parent)
- `resolve(id, { direction: 'up'|'down'|'all', maxDepth, identity })` — traverse the module tree

### Bridge — Network Communication (deprecated)

Bridges connected modules across process or machine boundaries. The Bridge
module concept is **deprecated and will be removed in the next major SDK
version** — its barrel exports are marked `@deprecated`, and the
`@xyo-network/bridge-*` packages are deprecated on npm. Don't use bridges in new
work.

---

## Module Composition

The standard pattern for wiring modules together:

```ts
import { MemoryNode, MemoryArchivist, MemoryArchivistConfigSchema } from '@xyo-network/sdk'

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
// ArchivistPayloadDiviner is NOT on the root barrel — it ships separately:
import { ArchivistPayloadDiviner, ArchivistPayloadDivinerConfigSchema } from '@xyo-network/diviner-archivist'

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
import { isArchivistInstance } from '@xyo-network/sdk'

// '*' returns every module reachable in that direction — including the node itself
const all = await node.resolve('*', { direction: 'down' })
const archivists = all.filter(isArchivistInstance)

// A specific module by address or name; `identity` narrows the result type
const module = await node.resolve(targetAddress, { direction: 'all', maxDepth: 5 })
const gameArchivist = await node.resolve('GameArchivist', { identity: isArchivistInstance })
```

Filter `'*'` results yourself: in SDK 8.0.x, passing `identity` together with
`'*'` returns an array of booleans (the check's results) instead of the matching
modules. `identity` works as expected on a single-id resolve.

Resolution enables loose coupling — modules reference each other by address in their config, and the node resolves those addresses at runtime.

---

## Module Factory & Registration

Modules are created via factories registered by config schema:

```ts
class ModuleFactoryLocator {
  static standard(): ModuleFactoryLocator  // barrel modules: Memory*, View*, AdhocWitness, generic diviners
  static empty(): ModuleFactoryLocator
  register(factory: CreatableModuleFactory, labels?: Labels, primary?: boolean | Schema | Schema[]): this
  registerMany(factories: CreatableModuleFactory[]): this
  locate(schema: Schema, labels?: Labels): CreatableModuleFactory | LabeledCreatableModuleFactory
  freeze(): void
}

// Add a standalone backend: locator.register(IndexedDbArchivist.factory())
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
    accountPath?: string   // HD path below the loader's wallet
  }
  modules?: {
    public?: AuthoredModuleManifest[]
    private?: AuthoredModuleManifest[]
  }
}
```

Schemas: a package manifest (one or more nodes) is `'network.xyo.manifest.package'`
(`PackageManifestPayloadSchema`); a single node manifest is `'network.xyo.node.manifest'`.

Load one with `ManifestWrapper`, a wallet, and a factory locator that knows every
config schema the manifest uses:

```ts
import {
  HDWallet, isArchivistInstance, ManifestWrapper, MemoryArchivistConfigSchema,
  ModuleFactoryLocator, NodeConfigSchema, PackageManifestPayloadSchema,
} from '@xyo-network/sdk'
import type { PackageManifestPayload } from '@xyo-network/sdk'

const manifest: PackageManifestPayload = {
  schema: PackageManifestPayloadSchema,
  nodes: [{
    config: { accountPath: "0'", name: 'GameNode', schema: NodeConfigSchema },
    modules: {
      private: [{ config: { name: 'SecretArchivist', schema: MemoryArchivistConfigSchema } }],
      public: [{ config: { name: 'GameArchivist', schema: MemoryArchivistConfigSchema } }],
    },
  }],
}

const wallet = await HDWallet.fromPhrase(phrase)
const node = await new ManifestWrapper(manifest, wallet, ModuleFactoryLocator.standard()).loadNodeFromIndex(0)
const archivist = await node.resolve('GameArchivist', { identity: isArchivistInstance })
```

Each node's account is derived from `wallet` at its `accountPath` (default
`"<index>'"`). A module gets a derived account only when its own config sets
`accountPath`; otherwise it is random — set it wherever an address must stay
stable across restarts. `loadNodes()` loads every node in the package.

Use manifests for production deployments where the module tree should be declared as configuration rather than built imperatively.
