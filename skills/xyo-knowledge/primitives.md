# Protocol Primitives

**Root barrel package:** `@xyo-network/sdk-js` — import everything from here. Tree shaking eliminates unused exports.

For full type details, read the `.d.ts` files at `dist/neutral/index.d.ts` in each package.

---

## Payloads

The **payload** is the fundamental data unit in XYO. It's a JSON object with a required `schema` field that identifies its type.

### Type Definition

```ts
// Payload<T, S> — T = custom fields, S = schema string
type MovePayload = Payload<{ move: 'rock' | 'paper' | 'scissors' }, 'com.example.rps.move'>
```

The `schema` field is a branded string created via `asSchema()`:

```ts
import { asSchema } from '@xyo-network/sdk-js'

const MoveSchema = asSchema('com.example.rps.move', true)
```

Schema format: lowercase, dot-separated, alphanumeric — validated by `/^(?:[a-z0-9]+\.)*[a-z0-9]+$/`.

### Meta Field Conventions

Payload fields use prefix conventions to distinguish data from metadata:

| Prefix | Type | Examples | Purpose |
|--------|------|----------|---------|
| _(none)_ | Data fields | `move`, `player`, `score` | Application data — included in data hash |
| `_*` | Storage metadata | `_hash`, `_dataHash`, `_sequence` | Computed by infrastructure, not part of the payload's identity |
| `$*` | Client metadata | `$sources`, `$signatures` | Transaction/state data - included in hash |

**Never use `_` or `$` prefixes for your own custom fields.** These are reserved.

Type helpers for working with meta:
- `WithStorageMeta<T>` — payload with `_hash`, `_dataHash`, `_sequence`
- `WithHashMeta<T>` — payload with `_hash` and `_dataHash`
- `WithoutMeta<T>` — strips all `_*` and `$*` fields

### PayloadBuilder

Use `PayloadBuilder` to construct payloads — don't create raw object literals:

```ts
import { PayloadBuilder } from '@xyo-network/sdk-js'

const payload = new PayloadBuilder({ schema: MoveSchema })
  .fields({ move: 'rock' })
  .build()
```

#### Narrowing the built payload

`.build()` is typed to return the generic `Payload<AnyObject>` — it does **not** narrow to `MovePayload` automatically. Two paths fail:

1. `new PayloadBuilder({ schema: MoveSchema }).build() as MovePayload` — TypeScript rejects it because the destination type is too narrow for a one-step assertion.
2. `new PayloadBuilder<MovePayload>({ schema: MoveSchema }).build()` — the generic slot exists, but `PayloadBuilder<T extends Payload>` requires `T`'s `schema` field to be the branded `Schema` type. A Zod-inferred type with `schema: z.literal('…')` holds a plain string literal, so it fails the `extends Payload` constraint.

Do not reach for `as unknown as MovePayload` — it compiles, but it silences both the type system and the branded-schema guarantee.

The right pattern: pair `PayloadBuilder.build()` with the asserting parser produced by `zodAsFactory` (see [Zod-First Type Pattern](../xl1-knowledge/development.md)):

```ts
const move: MovePayload = asMovePayload(
  new PayloadBuilder({ schema: MoveSchema })
    .fields({ move: 'rock' })
    .build(),
  true, // assert mode — throws on validation failure
)
```

`asMovePayload` is typed `<T>(value: T, assert): T & MovePayload`, so the return value structurally narrows to `MovePayload` with no cast, and the runtime Zod check guarantees the declared type. Use this pattern wherever you assign `PayloadBuilder.build()`'s result to a typed variable.

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

Schemas act as TypeScript discriminated union tags. The canonical guard is the **Zod-factory** generated alongside each payload type — it validates schema name *and* payload shape in one call, which is what you need for any chain or datalake read.

```ts
import { zodIsFactory } from '@xylabs/sdk-js'

const isMove = zodIsFactory(MovePayloadZod)

// Filter a mixed payload array — typed as MovePayload[] AND validated
const moves = allPayloads.filter(isMove)
```

The SDK also exports `isPayloadOfSchemaType<T>(schema)` and `isPayloadOfZodType<T>(zod, schema)`. The first is a tag check only — it inspects `.schema` and trusts the rest. The second is equivalent to the Zod-factory above. Prefer the Zod-factory: one canonical pattern, no temptation to reach for the tag-only variant by accident.

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
import { Account, BoundWitnessBuilder } from '@xyo-network/sdk-js'

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

### Multi-Signer (Co-Witnessed) BoundWitnesses

A single bound witness can be co-signed by multiple parties. Each signer contributes their address and signature to the same witness, producing a single artifact that proves *joint* attestation:

```ts
const [bw, payloads] = await new BoundWitnessBuilder()
  .signers([accountA, accountB, accountC])
  .payload(jointPayload)
  .build()

// bw.addresses === [addrA, addrB, addrC]
// bw.$signatures contains one signature per signer, in the same order
```

This is the right shape for any "all parties agree to X" attestation — joint terms, multi-party releases, group commitments — where the proof must be a single co-signed object rather than three independent signatures.

#### Verifying multi-signer witnesses

`@xyo-network/boundwitness-validator` exposes two predicates:

```ts
import { addressesContainsAll, addressesContainsAny } from '@xyo-network/boundwitness-validator'

// All listed parties must have signed this BW
addressesContainsAll(bw, [addrA, addrB, addrC])

// At least one of the listed parties must have signed
addressesContainsAny(bw, authorityAddresses)
```

Use `addressesContainsAll` when every party's signature is required (joint commitment, atomic exchange). Use `addressesContainsAny` when any one of a set of authorized signers suffices (oracle attestation, authority signoff).

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
