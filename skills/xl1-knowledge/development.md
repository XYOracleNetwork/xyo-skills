# Development on XL1

**Root barrel packages:**

| Repo | Root Barrel | Purpose |
|------|------------|---------|
| sdk-xyo-client-js | `@xyo-network/sdk` | XYO protocol (payloads, BW, modules, accounts) |
| xl1-protocol | `@xyo-network/xl1-sdk` | XL1 protocol (blocks, transactions, viewers, RPC) |
| xyo-chain | `@xyo-network/chain-sdk` | XL1 runtime (services, drivers, chain operations) |
| xl1-protocol (`packages/react/`) | `@xyo-network/xl1-react-client-sdk` | React dApp integration (GatewayProvider, WalletGatewayProvider, wallet connection, hooks) |
| xl1-protocol (`packages/browser-system/`) | `@xyo-network/xl1-browser-system` | Website integration for any browser realm — page, worker, service worker, extension background. The preferred substrate; React apps reach it through `xl1-react-client-sdk`. See [Browser Gateway](gateway-browser.md) |

**Always import from the root barrel.** Tree shaking eliminates unused exports.

```ts
// XYO primitives
import { Payload, PayloadBuilder, Account, BoundWitnessBuilder } from '@xyo-network/sdk'

// XL1 protocol types and SDK
import { BlockBoundWitnessZod, SimpleBlockViewer, BlockViewerMoniker } from '@xyo-network/xl1-sdk'

// XL1 chain runtime (services, drivers)
import { ... } from '@xyo-network/chain-sdk'

// React dApp — gateway providers, wallet connection, and gateway access
import { GatewayProvider, WalletGatewayProvider, ConnectAccountsStack, useProvidedGateway } from '@xyo-network/xl1-react-client-sdk'

// Non-React website, worker, service worker, or extension — launch a browser system directly
import { launchXl1BrowserGatewaySystem } from '@xyo-network/xl1-browser-system'

// Avoid — sub-package / subpath imports when the root barrel suffices
import { BlockBoundWitnessZod } from '@xyo-network/xl1-protocol/protocol-model'
import { Payload } from '@xyo-network/payload-model'
```

> The `@xyo-network/xl1-protocol` and `@xyo-network/xl1-sdk` packages are
> toolchain monoliths. The old standalone names (`@xyo-network/xl1-protocol-model`,
> `-protocol-lib`, `-validation`, `-providers`, `-protocol-sdk`, `-rpc`) no longer
> exist — they are now export subpaths of the two monoliths (e.g.
> `@xyo-network/xl1-sdk/protocol-sdk`). The `@xyo-network/xl1-sdk` root barrel
> re-exports all of them, so prefer it.

For full type details, read the `.d.ts` files at `dist/neutral/index.d.ts` in each root barrel package.

---

## Zod-First Type Pattern

**All XL1 protocol types follow a strict pattern where the Zod schema is the source of truth:**

```ts
import { zodAsFactory, zodIsFactory, zodToFactory } from '@ariestools/sdk'
import { z } from 'zod'

// 1. Zod schema (the single source of truth)
export const FooZod = z.object({ bar: z.string() })

// 2. Derive TypeScript type
export type Foo = z.infer<typeof FooZod>

// 3. Type guard (returns boolean)
export const isFoo = zodIsFactory(FooZod)

// 4. Asserting parse (throws on failure)
export const asFoo = zodAsFactory(FooZod, 'asFoo')

// 5. Safe parse (returns undefined on failure)
export const toFoo = zodToFactory(FooZod, 'toFoo')
```

This pattern is **mandatory** for all new types. Define the Zod schema first, derive everything else from it. See `@xyo-network/xl1-protocol/protocol-model` for canonical examples.

---

## Payload contracts are version-aware

The generic `FooZod` example above is not a complete payload definition. Author
an XYO payload as in [Authoring a payload type](../xyo-knowledge/primitives.md#authoring-a-payload-type):
`import * as z from 'zod/mini'`, a `FieldsZod`, `z.extend(PayloadZodOfSchema(Schema), FieldsZod.shape)`,
`z.infer`, and the `zodIsFactory` / `zodAsFactory` / `zodToFactory` trio. Swap
`PayloadZodOfSchema` for `PayloadZodLooseOfSchema` or `PayloadZodStrictOfSchema`
only when the unknown-field policy requires it. Those factories default to
supporting only effective `1.0.0`, not every structurally plausible version. A
receiver validates the original schema, `$version`, and shape before making
projections; never strip metadata then retry as version 1.

Follow [Payload Schema Evolution and Identity](../xyo-knowledge/payload-schema-evolution.md)
for ASCII naming, immutable definitions, compatibility, root-hash references, and
cache keys. Chain validation can enforce available primitive rules; it cannot
infer a third-party field's semantics, namespace ownership, or compatibility from
the label alone. A BoundWitness's own unbound `$version` cannot select weaker
signature/consensus rules. Adding SDK helpers does not deploy a network upgrade or
migrate existing Statement Graph/Event Kit data-hash contracts.

---

## Viewer / Runner Pattern

The protocol separates read and write operations:

- **Viewers** — read-only interfaces that query chain state
- **Runners** — write/mutation operations that change chain state

### Viewers (organized by domain)

The interface files live under `protocol-lib/viewers/` (~28 files, including the
`XyoViewer` aggregate). Read that directory for the authoritative list rather
than relying on a fixed count.

**Block:** BlockViewer, BlockValidation, BlockInvalidation, BlockReward, WindowedBlock, IndexViewer (block-index / `blocksByStep` summaries)
**Transaction:** TransactionViewer, TransactionValidation, TransactionInvalidation
**Account:** AccountBalanceViewer, TransferBalance
**Chain State:** ChainContract, ChainStateViewer, Fork, Finalization, TimeSync, Sync, EvmChain (canonical EVM source)
**Stake:** Stake, StakeTotals, StakeIntent, StakeEvents, ChainStakeViewer, StepStake, NetworkStakeStepReward, StepViewer
**Data:** DataLake, Mempool, DeadLetterQueue

### Runners

The four core write-path runners:

- **BlockRunner** — `produceNextBlock()`, `next()`
- **FinalizationRunner** — `finalizeBlocks()`, `finalizeBlock()`
- **MempoolRunner** — `submitBlocks()`, `submitTransactions()`, prune operations
- **DeadLetterQueueRunner** — `rejectBlock()`, `rejectTransaction()`, prune operations

Plus the publish-side runners under the same `protocol-lib/runners/` directory:
`BlockPublish`, `ChainStatePublish`, `DataLakePublish`, `EvmEventIndexPublish`,
`IndexPublish`, and `NetworkStakeRewardsIndexPublish`.

### Implementation Prefixes

| Prefix | Description | Example |
|--------|-------------|---------|
| `Simple*` | In-memory / direct implementation | `SimpleBlockViewer` |
| `Rest*` | REST API implementation | `RestDataLakeViewer` |
| `Abstract*` | Base class for extension | `AbstractCreatableProvider` |

---

## Provider / Service Locator

Viewers and runners are resolved via a service locator pattern:

```ts
// Each viewer/runner has a moniker (service identifier)
export const BlockViewerMoniker = 'BlockViewer' as const

// Register factory with the locator.
// Note: `factory()` takes dependencies only — the second `params` argument was
// removed in 5.0 (`X.factory(deps, params)` → `X.factory(deps)`).
locator.register(SimpleBlockViewer.factory(dependencies))

// Resolve an instance by moniker
const viewer = await locator.getInstance<BlockViewer>(BlockViewerMoniker)
```

**`CreatableProvider`** is the base abstraction:
- `static defaultMoniker` — service identifier
- `static dependencies` — required sibling monikers
- `static providerId` — stable implementation id that config pins match (see [Provider identity](#provider-identity))
- `static factory()` — creates a factory for registration
- `createHandler()` — post-creation async initialization

For the common case of getting a working gateway, you almost never construct a locator yourself — use `GatewayBuilder` from `@xyo-network/xl1-sdk` (see [Node Gateway](gateway-node.md)). The locator pattern shown here is the layer underneath; reach for it directly only when the builder cannot express what you need (custom provider graphs, instrumented transports, test harnesses).

### Provider identity

A provider implementation is identified by its class's own `static providerId`, never by its class name. That id is the candidate id a config pin (`providerBindings.<moniker>.provider`) matches. Bundlers rename classes: the `@xyo-network/xl1-cli` 5.5.0 bundle emits `SimpleChainContractViewer$1 = class …`, so a name-derived id broke the `"SimpleChainContractViewer"` pin with `UnknownProviderError`.

> **Changed after `@xyo-network/xl1-sdk` 5.7.1.** Every SDK provider declares `static readonly providerId: string = '<ClassName>'`, so pins written against class names keep working. `providerCandidateFromClass(cls)` and `providerCandidatesFromClasses(classes)` take each class's `providerId` and throw `MissingProviderIdError` when a class declares none. They never fall back to the constructor name. On 5.7.1 and earlier they silently use the constructor name, so pass an explicit id there.

Declare an id on every provider class you write:

```ts
export class SimpleMyIndexViewer extends AbstractCreatableProvider implements MyIndexViewer {
  static readonly defaultMoniker = MyIndexViewerMoniker
  static readonly monikers = [MyIndexViewerMoniker]
  static readonly providerId: string = 'com.example.my-index-viewer'
  // …
}

const candidate = providerCandidateFromClass(SimpleMyIndexViewer)
// For a class you do not own, pass the id explicitly:
const pinned = providerCandidateFromClass(TheirViewer, 'com.example.their-viewer')
```

- Only a class's **own** id counts. An id inherited from a base provider is ignored, because it would collide with the base. A subclass declares its own: `static override readonly providerId: string = '…'`. Type the id `string`, not a literal, so subclasses can override it.
- `ProviderFactory.providerName` (factory descriptions, registry entries, `--dump-providers`) reports the `providerId`. For a class without one it falls back to the constructor name, but only as a diagnostic label, never as a candidate id.
- When a pin matches no candidate, `UnknownProviderError` names the ids that do satisfy the moniker: `… does not satisfy capability "ChainContractViewer" (candidates that do: A, B)`, also exposed as `error.candidates`. Copy the pin from that list.

**Guard it in a spec.** `@xyo-network/xl1-sdk/protocol-sdk/test` (also on the root barrel) exports `providerIdIssues(namespaces)`, `exportedProviderClasses(namespaces)`, and `isCreatableProviderClass(value)`. `providerIdIssues` reports every exported provider class that has no id of its own, whose id differs from its export name, or whose id another class already uses:

```ts
expect(providerIdIssues([await import('../../index.ts')])).toEqual([])
```

The name-match rule is the SDK's own convention. If your ids are namespaced (`com.example.…`), assert own ids and uniqueness directly instead:

```ts
const classes = exportedProviderClasses([await import('../../index.ts')]).keys()
const ids = [...classes].map(cls => providerIdOf(cls)) // throws MissingProviderIdError
expect(new Set(ids).size).toBe(ids.length)
```

---

## Hydrated Types

Blocks and transactions are **tuples** pairing a BoundWitness with its resolved payloads:

```ts
type HydratedBlock = [BlockBoundWitness, Payload[]]
type HydratedTransaction = [TransactionBoundWitness, Payload[]]
```

Blocks and transactions each have several type variants combining signing state (`Signed` / `Unsigned` / default) with metadata (`WithHashMeta` / `WithStorageMeta` / `ToJson` / plain). The naming is predictable: `SignedHydratedBlockWithHashMeta`, `UnsignedHydratedTransactionWithStorageMeta`, etc. Gateway viewer methods typically return `SignedHydratedBlockWithHashMeta` and `SignedHydratedTransactionWithHashMeta`.

---

## Validation

Validators are composable pure functions that return error arrays (empty = valid). Transaction validators check chain ID, duration bounds, sender authorization, gas fees, elevation scripts, JSON schema, and transfer authorization. BoundWitness validators verify cryptographic signatures and payload hash/schema references. Block validators enforce cumulative balance constraints (outflow ≤ pre-block balance per address). Compose them as needed — grep the SDK source for the specific validator classes.

