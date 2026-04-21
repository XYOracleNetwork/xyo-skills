# Development on XL1

**Root barrel packages:**

| Repo | Root Barrel | Purpose |
|------|------------|---------|
| sdk-xyo-client-js | `@xyo-network/sdk-js` | XYO protocol (payloads, BW, modules, accounts) |
| xl1-protocol | `@xyo-network/xl1-sdk` | XL1 protocol (blocks, transactions, viewers, RPC) |
| xyo-chain | `@xyo-network/chain-sdk` | XL1 runtime (services, drivers, chain operations) |
| react-chain | `@xyo-network/react-chain-provider` | React dApp integration (gateway, wallet, hooks) |

**Always import from the root barrel.** Tree shaking eliminates unused exports.

```ts
// XYO primitives
import { Payload, PayloadBuilder, Account, BoundWitnessBuilder } from '@xyo-network/sdk-js'

// XL1 protocol types and SDK
import { BlockBoundWitnessZod, SimpleBlockViewer, BlockViewerMoniker } from '@xyo-network/xl1-sdk'

// XL1 chain runtime (services, drivers)
import { ... } from '@xyo-network/chain-sdk'

// React dApp — gateway provider, wallet connection, and gateway access
import { GatewayProvider, InPageGatewaysProvider, ConnectAccountsStack, useProvidedGateway } from '@xyo-network/react-chain-provider'

// Avoid — sub-package imports
import { BlockBoundWitnessZod } from '@xyo-network/xl1-protocol-model'
import { Payload } from '@xyo-network/payload-model'
```

For full type details, read the `.d.ts` files at `dist/neutral/index.d.ts` in each root barrel package.

---

## Zod-First Type Pattern

**All XL1 protocol types follow a strict pattern where the Zod schema is the source of truth:**

```ts
import { zodAsFactory, zodIsFactory, zodToFactory } from '@xylabs/sdk-js'
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

This pattern is **mandatory** for all new types. Define the Zod schema first, derive everything else from it. See `@xyo-network/xl1-protocol-model` for canonical examples.

---

## Viewer / Runner Pattern

The protocol separates read and write operations:

- **Viewers** — read-only interfaces that query chain state
- **Runners** — write/mutation operations that change chain state

### 26 Viewers (organized by domain)

**Block:** BlockViewer, BlockValidation, BlockInvalidation, BlockReward, WindowedBlock
**Transaction:** TransactionViewer, TransactionValidation, TransactionInvalidation
**Account:** AccountBalanceViewer, TransferBalance
**Chain State:** ChainContract, Fork, Finalization, TimeSync
**Stake:** Stake, StakeTotals, StakeIntent, StakeEvents, ChainStakeViewer, StepStake, NetworkStake, NetworkStakeStepReward (5 sub-variants), StepViewer
**Data:** DataLake, Mempool, DeadLetterQueue

### 4 Runners

- **BlockRunner** — `produceNextBlock()`, `next()`
- **FinalizationRunner** — `finalizeBlocks()`, `finalizeBlock()`
- **MempoolRunner** — `submitBlocks()`, `submitTransactions()`, prune operations
- **DeadLetterQueueRunner** — `rejectBlock()`, `rejectTransaction()`, prune operations

### Implementation Prefixes

| Prefix | Description | Example |
|--------|-------------|---------|
| `Simple*` | In-memory / direct implementation | `SimpleBlockViewer` |
| `JsonRpc*` | Remote via JSON-RPC transport | `JsonRpcBlockViewer` |
| `Rest*` | REST API implementation | `RestDataLakeViewer` |
| `Abstract*` | Base class for extension | `AbstractCreatableProvider` |

---

## Provider / Service Locator

Viewers and runners are resolved via a service locator pattern:

```ts
// Each viewer/runner has a moniker (service identifier)
export const BlockViewerMoniker = 'BlockViewer' as const

// Register factory with the locator
locator.register(SimpleBlockViewer.factory(dependencies, params))

// Resolve an instance by moniker
const viewer = await locator.getInstance<BlockViewer>(BlockViewerMoniker)
```

**`CreatableProvider`** is the base abstraction:
- `static defaultMoniker` — service identifier
- `static dependencies` — required sibling monikers
- `static factory()` — creates a factory for registration
- `createHandler()` — post-creation async initialization

Use `buildProviderLocator()` from `@xyo-network/xl1-providers` to wire up standard provider trees.

---

## Hydrated Types

Blocks and transactions are **tuples** pairing a BoundWitness with its resolved payloads:

```ts
type HydratedBlock = [BlockBoundWitness, Payload[]]
type HydratedTransaction = [TransactionBoundWitness, Payload[]]
```

**9 variant combinations per type:**

| Signing | Metadata | Example Type |
|---------|----------|-------------|
| default | plain | `HydratedBlock` |
| default | WithHashMeta | `HydratedBlockWithHashMeta` |
| default | WithStorageMeta | `HydratedBlockWithStorageMeta` |
| Signed | plain | `SignedHydratedBlock` |
| Signed | WithHashMeta | `SignedHydratedBlockWithHashMeta` |
| Signed | WithStorageMeta | `SignedHydratedBlockWithStorageMeta` |
| Unsigned | plain | `UnsignedHydratedBlock` |
| Unsigned | WithHashMeta | `UnsignedHydratedBlockWithHashMeta` |
| Unsigned | WithStorageMeta | `UnsignedHydratedBlockWithStorageMeta` |

The same matrix applies to transactions.

---

## Validation

Validators are composable pure functions that return error arrays (empty = valid).

### Transaction Validators (7)
- **TransactionProtocolValidator** — chain ID matches
- **TransactionDurationValidator** — nbf/exp bounds, max span 10,000 blocks
- **TransactionFromValidator** — from address is valid and in addresses array
- **TransactionGasValidator** — fee fields meet minimums
- **TransactionElevationValidator** — required elevation scripts present
- **TransactionJsonSchemaValidator** — AJV JSON schema validation
- **TransactionTransfersValidator** — signer authorization for transfers

### BoundWitness Validators (2)
- **BoundWitnessSignaturesValidator** — ECDSA cryptographic validity
- **BoundWitnessReferencesValidator** — payload hashes/schemas match payloads

### Block Validators (1)
- **BlockCumulativeBalanceValidator** — outflow ≤ pre-block balance per address

---

## Viewer → RPC Pipeline

To expose a viewer via JSON-RPC, five files form the chain:

1. **Viewer interface** — defines `*Methods` (RPC-exposable) and full `*Viewer` (extends Methods + Provider)
2. **RPC types** — derives `namespace_methodName` RPC method names and handler types
3. **RPC schemas** — Zod `{ params: { to, from }, result: { to, from } }` for serialization
4. **Registration** — all schema maps aggregated into `AllRpcSchemas`
5. **Engine handler** — factory that delegates RPC calls to viewer methods
