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
> `-protocol-lib`, `-validation`, `-providers`, `-protocol-sdk`, `-rpc`,
> `-driver-memory`) are now export subpaths of the two monoliths (e.g.
> `@xyo-network/xl1-sdk/protocol-sdk`). On npm the old names survive only as
> deprecated 4.0.12 compatibility shims that will not be updated — never add
> them. The `@xyo-network/xl1-sdk` root barrel re-exports its subpaths, so
> prefer it. Two subpaths are not on it: `./rest-block-viewer`
> (`RestBlockViewer` and friends, normally reached through `getRestGateway`) and
> `./test`; import those from the subpath when you need them.

For full type details, read the `.d.ts` files at `dist/neutral/index.d.ts` in each root barrel package.

---

## Zod-First Type Pattern

**All XL1 protocol types follow a strict pattern where the Zod schema is the source of truth:**

```ts
import { zodAsFactory, zodIsFactory, zodToFactory } from '@ariestools/sdk'
import { z } from 'zod/mini'

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
`import { z } from 'zod/mini'`, a `FieldsZod`, `z.extend(PayloadZodOfSchema(Schema), FieldsZod.shape)`,
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
signature/consensus rules.

XL1-layer protocols that intentionally use data hashes keep them: Statement
Graph object references, ordinal/inscription IDs and burn derivation, exchange
commitments, and Event Kit contracts. Import their builders/validators and
preserve their algorithms rather than switching them to root hashes. Adding SDK
helpers does not deploy a network upgrade or migrate those contracts.

### XL1's `network.xyo.*` schemas

XL1 ships XYO Foundation–owned schemas under the reserved `network.xyo.*`
namespace (see [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming)),
defined in `@xyo-network/xl1-protocol/protocol-model` and re-exported by the
`@xyo-network/xl1-sdk` root barrel:

- **Chain system payloads** — `network.xyo.transfer` (`TransferSchema`) and
  `network.xyo.time` (`TimeSchema`), among the `AllowedBlockPayload` types
- **Canonical substrates** (Tier 2) — `network.xyo.ordinal.*` (inscription),
  `network.xyo.ordinal.token.*` (XRC-20), and `network.xyo.exchange.*`

Import these; never redefine them. Schemas your application builds on top of
them belong under your own `com.<your-org>.<app>.*` namespace.

---

## Viewer / Runner Pattern

The protocol separates read and write operations:

- **Viewers** — read-only interfaces that query chain state
- **Runners** — write/mutation operations that change chain state

### Viewers (organized by domain)

The interface files live under `protocol-lib/viewers/` (~30 files plus the
`NetworkStake/` directory, including the `XyoViewer` aggregate). Read that
directory for the authoritative list rather than relying on a fixed count.

**Block:** BlockViewer, BlockValidation, BlockInvalidation, BlockReward, WindowedBlock, IndexViewer (block-index / `blocksByStep` summaries)
**Transaction:** TransactionViewer, TransactionValidation, TransactionInvalidation
**Account:** AccountBalanceViewer, TransferBalance
**Chain State:** ChainContract, ChainParams (`ChainParamsViewer` — the chain parameter register: `currentParams()`, `tryCurrentParams()`, `paramsByVersion(v)`), ChainStateViewer, Fork, Finalization, TimeSync, Sync, EvmChain (canonical EVM source)
**Stake:** Stake, StakeTotals, StakeIntent, StakeEvents, StakeSnapshot (`StakeSnapshotViewer` — active, at-risk, seasoned, and self-bonded stake as of an EVM block height), ChainStakeViewer, StepStake, NetworkStakeStepReward, StepViewer
**Evidence:** Evidence (`EvidenceViewer` — same-height candidate pairs, i.e. the equivocation feed, plus raw entries and observer-signed rejections; `EvidenceProtectionViewer` — evidence retention protections)
**Data:** DataLake, Mempool, DeadLetterQueue

### Runners

The four core write-path runners:

- **BlockRunner** — `produceNextBlock()`, `next()`
- **FinalizationRunner** — `finalizeBlocks()`, `finalizeBlock()`
- **MempoolRunner** — `submitBlocks()`, `submitTransactions()`, prune operations
- **DeadLetterQueueRunner** — `rejectBlock()`, `rejectTransaction()`, prune operations

Plus the publish-side runners under the same `protocol-lib/runners/` directory:
`BlockPublish`, `ChainStatePublish`, `DataLakePublish`, `EvmEventIndexPublish`,
`IndexPublish`, and `NetworkStakeRewardsIndexPublish`, and the evidence runner
**EvidenceStoreRunner** — `noteCandidates()` (records candidates and returns
newly detected same-height pairs), `recordRejection()`, `archiveCandidates()`.

### Implementation Prefixes

| Prefix | Description | Example |
|--------|-------------|---------|
| `Simple*` | In-memory / direct implementation | `SimpleBlockViewer` |
| `JsonRpc*` | Client that calls a remote gateway's JSON-RPC methods (what `GatewayBuilder` wires up) | `JsonRpcBlockViewer`, `JsonRpcXyoRunner` |
| `Rest*` | REST API implementation — reads the static REST layout or a datalake over HTTP | `RestDataLakeViewer`, `RestChainParamsViewer` |
| `S3*` | Publishes or reads the static REST layout in an S3-compatible bucket (`@xyo-network/xl1-s3-providers`, operator side) | `S3BlockPublishRunner`, `S3ChainStateViewer` |
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

Every SDK provider declares `static readonly providerId: string = '<ClassName>'`, so pins written against class names keep working. `providerCandidateFromClass(cls)` and `providerCandidatesFromClasses(classes)` take each class's `providerId` and throw `MissingProviderIdError` when a class declares none — they never fall back to the constructor name. Current releases all resolve pins this way: `@xyo-network/chain-sdk` 5.6.1 peers `@xyo-network/xl1-sdk ^5.8`, and `@xyo-network/xl1-cli` 5.6.1 bundles xl1-sdk 5.8. On xl1-cli 5.6.x a dev chain that publishes chain state to S3 still needs the explicit `SimpleChainContractViewer` pin — see [Gateway — Configuration](gateway.md#configuration).

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

Transactions have 9 type variants, combining signing state (`Signed` / `Unsigned` / default) with metadata (`WithHashMeta` / `WithStorageMeta` / plain): `SignedHydratedTransactionWithHashMeta`, `UnsignedHydratedTransactionWithStorageMeta`, etc. Blocks have 7: default and `Signed` (no `Unsigned`) with the same three metadata forms, plus the JSON wire form `SignedHydratedBlockToJson`. Gateway viewer methods typically return `SignedHydratedBlockWithHashMeta` and `SignedHydratedTransactionWithHashMeta`. Hydration is shallow: a viewer fills `Payload[]` only from the gateway's own payload store — a block's transaction bound witnesses and on-chain payloads — never with the off-chain bodies those transactions reference, which come from a datalake by hash (see [Gateway — What `block.blockByNumber` returns](gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow)).

---

## Validation

Validators are composable pure functions that return error arrays (empty = valid). Transaction validators check chain ID, duration bounds, sender authorization, gas fees, elevation scripts, JSON schema, and transfer authorization. BoundWitness validators verify cryptographic signatures and payload hash/schema references. Block validators enforce cumulative balance constraints (outflow ≤ pre-block balance per address). Compose them as needed — grep the SDK source for the specific validator classes.

