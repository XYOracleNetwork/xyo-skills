# Protocol Primitives

**Key npm packages:**
- `@xyo-network/payload-model` — Payload types, Schema, meta types, type guards
- `@xyo-network/payload-builder` — PayloadBuilder class
- `@xyo-network/boundwitness-model` — BoundWitness types, signed/unsigned variants
- `@xyo-network/boundwitness-builder` — BoundWitnessBuilder class

For full type details, read the `.d.ts` files at `dist/neutral/index.d.ts` in each package.

---

## Payloads

The **payload** is the fundamental data unit in XYO. It's a JSON object with a required `schema` field that identifies its type.

### Type Definition

```ts
// Payload<T, S> — T = custom fields, S = schema string
type MovePayload = Payload<{ move: 'rock' | 'paper' | 'scissors' }, 'network.xyo.rps.move'>
```

The `schema` field is a branded string created via `asSchema()`:

```ts
import { asSchema } from '@xyo-network/payload-model'

const MoveSchema = asSchema('network.xyo.rps.move', true)
```

Schema format: lowercase, dot-separated, alphanumeric — validated by `/^(?:[a-z0-9]+\.)*[a-z0-9]+$/`.

### Meta Field Conventions

Payload fields use prefix conventions to distinguish data from metadata:

| Prefix | Type | Examples | Purpose |
|--------|------|----------|---------|
| _(none)_ | Data fields | `move`, `player`, `score` | Application data — included in data hash |
| `_*` | Storage metadata | `_hash`, `_dataHash`, `_sequence` | Computed by infrastructure, not part of the payload's identity |
| `$*` | Client metadata | `$sources`, `$signatures` | Transaction/state data attached by the client |

**Never use `_` or `$` prefixes for your own custom fields.** These are reserved.

Type helpers for working with meta:
- `WithStorageMeta<T>` — payload with `_hash`, `_dataHash`, `_sequence`
- `WithHashMeta<T>` — payload with `_hash` and `_dataHash`
- `WithoutMeta<T>` — strips all `_*` and `$*` fields

### PayloadBuilder

Use `PayloadBuilder` to construct payloads — don't create raw object literals:

```ts
import { PayloadBuilder } from '@xyo-network/payload-builder'

const payload = new PayloadBuilder({ schema: MoveSchema })
  .fields({ move: 'rock' })
  .build()
```

Static hash methods:
- `PayloadBuilder.hash(payload)` — hash excluding storage meta
- `PayloadBuilder.dataHash(payload)` — hash of data fields only (excludes all meta)
- `PayloadBuilder.hashPairs(payloads)` — returns `[payload, hash][]` tuples
- `PayloadBuilder.toHashMap(payloads)` — returns `Record<Hash, Payload>`

Static meta manipulation:
- `PayloadBuilder.omitMeta(payload)` — remove all `_*` and `$*` fields
- `PayloadBuilder.omitStorageMeta(payload)` — remove `_*` fields only
- `PayloadBuilder.omitClientMeta(payload)` — remove `$*` fields only
- `PayloadBuilder.addStorageMeta(payloads)` — compute and attach `_hash`, `_dataHash`, `_sequence`

### Schema-Based Type Discrimination

Schemas act as TypeScript discriminated union tags. Use type guards for narrowing:

```ts
import { isPayloadOfSchemaType } from '@xyo-network/payload-model'

const isMove = isPayloadOfSchemaType<MovePayload>('network.xyo.rps.move')

// Filter a mixed payload array
const moves = allPayloads.filter(isMove) // typed as MovePayload[]
```

For runtime validation with Zod:

```ts
import { isPayloadOfZodType } from '@xyo-network/payload-model'

const isMove = isPayloadOfZodType<MovePayload>(MovePayloadZod, 'network.xyo.rps.move')
```

---

## Bound Witnesses

A **bound witness** is a cryptographic co-signing event. Multiple parties sign the same set of payloads, creating proof that they all agreed on the data at a point in time.

### Structure

A bound witness is itself a payload with schema `'network.xyo.boundwitness'`:

```ts
interface BoundWitness extends Payload {
  schema: 'network.xyo.boundwitness'
  addresses: Address[]                  // Signing parties
  payload_hashes: Hash[]                // Hashes of included payloads
  payload_schemas: Schema[]             // Schemas of included payloads
  previous_hashes: (Hash | null)[]      // Chain linking (per signer)
  $signatures: (Hex | null)[]           // Cryptographic signatures
}
```

### Invariants

These arrays are always parallel:
- `addresses.length === $signatures.length === previous_hashes.length`
- `payload_hashes.length === payload_schemas.length`

### Signed vs Unsigned

- `UnsignedBoundWitness` — `$signatures` contains all `null` values
- `SignedBoundWitness` — `$signatures` contains all non-null hex strings

### BoundWitnessBuilder

Always use the builder — never construct bound witness fields manually:

```ts
import { BoundWitnessBuilder } from '@xyo-network/boundwitness-builder'
import { Account } from '@xyo-network/account'

const account = await Account.random()

const [boundWitness, payloads, errors] = await new BoundWitnessBuilder()
  .signer(account)
  .payload(movePayload)
  .build()
```

Builder methods:
- `.signer(account)` / `.signers([...])` — add signing parties
- `.payload(payload)` / `.payloads([...])` — add payloads to witness
- `.hashes(hashes, schemas)` — alternative: reference payloads by hash
- `.sourceQuery(hash)` — set the source query hash
- `.build(sign?)` — returns `[BoundWitness, Payload[], ModuleError[]]`

The builder auto-generates `addresses`, `payload_hashes`, `payload_schemas`, and `previous_hashes` from the provided signers and payloads. These fields cannot be set manually.

### Chain Continuity

Each signer tracks a `previousHash` that links bound witnesses into a tamper-evident chain. The `previous_hashes` array records each signer's last known hash at the time of signing. This creates an ordered, linked history of interactions per identity.

---

## Payload Bundles

A `PayloadBundle` wraps a bound witness together with its referenced payloads for atomic storage or transmission:

```ts
interface PayloadBundle extends Payload {
  schema: 'network.xyo.payload.bundle'
  payloads: Payload[]
  root: Hash
}
```

Use bundles when a bound witness and its payloads must travel or be stored as a single unit.
