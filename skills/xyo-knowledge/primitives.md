# Protocol Primitives

**Root barrel package:** `@xyo-network/sdk` — start here for protocol primitives and generic modules; tree shaking eliminates unused exports. Specific diviner / witness / archivist *implementations* ship as their own packages and are imported by name.

For full type details, read the `.d.ts` files at `dist/neutral/index.d.ts` in each package.

---

## Payloads

The **payload** is the fundamental data unit in XYO. It's a JSON object with a required `schema` field that identifies its type.

### Authoring a payload type

The Zod schema is the source of truth for a payload. Derive the TypeScript type
and the `is` / `as` / `to` factories from it. Do not author a new payload as
`type Foo = Payload<Fields, Schema>` without a matching Zod definition.

Canonical in-tree example:
`plugins/packages/payload/src/modules/evm-nft-id/Payload/NftId/`. Copy that
shape, not a `Payload<Fields, Schema>` interface. Application schemas use a
namespace you control — see [Schema Naming](best-practices.md#schema-naming).

```text
Move/
  Schema.ts    // asSchema(...)
  Payload.ts   // FieldsZod + payload Zod + factories
  index.ts     // re-exports
```

Tiny payloads may colocate schema and payload in one file. Nested field objects
(`NftAttributeZod`, mime types, and similar) are **not** payloads — they stay
plain `z.object` / `z.enum` helpers and are composed into `FieldsZod`.

```ts
import { zodAsFactory, zodIsFactory, zodToFactory } from '@ariestools/sdk'
import { asSchema, PayloadZodOfSchema } from '@xyo-network/sdk'
import * as z from 'zod/mini'

export const MoveSchema = asSchema('com.example.rps.move', true)
export type MoveSchema = typeof MoveSchema

export const MoveFieldsZod = z.object({
  move: z.enum(['rock', 'paper', 'scissors']),
})
export type MoveFields = z.infer<typeof MoveFieldsZod>

export const MoveZod = z.extend(PayloadZodOfSchema(MoveSchema), MoveFieldsZod.shape)
export type MovePayload = z.infer<typeof MoveZod>

export const isMovePayload = zodIsFactory(MoveZod)
export const asMovePayload = zodAsFactory(MoveZod, 'asMovePayload')
export const toMovePayload = zodToFactory(MoveZod, 'toMovePayload')
```

Required pieces:

| Piece | Rule |
|---|---|
| Schema name | `asSchema('…', true)` — never a raw string or a cast |
| Zod import | `import * as z from 'zod/mini'` — not `zod` |
| Envelope | `z.extend(PayloadZodOfSchema(Schema), FieldsZod.shape)` |
| Type | `z.infer<typeof FooZod>` |
| Guards | `zodIsFactory` / `zodAsFactory` / `zodToFactory` from `@ariestools/sdk` |
| Imports | `@xyo-network/sdk` and `@ariestools/sdk` — not deprecated payload-model packages |

`PayloadZodOfSchema` is what binds the branded `schema` literal **and** the
supported `$version` (default effective `1.0.0`). A hand-written
`schema: z.literal(Schema)` skips that envelope. Choose the envelope factory
from unknown-field policy:

| Factory | Extra keys | When |
|---|---|---|
| `PayloadZodOfSchema` | stripped (same as `z.object`) | **Default** for new payloads |
| `PayloadZodStrictOfSchema` | rejected | Closed published definition |
| `PayloadZodLooseOfSchema` | preserved | Open definition that must round-trip extras |

Pass a version or version array as the second argument when the validator
accepts more than default `1.0.0`. Version, freeze, and hash rules:
[Payload Schema Evolution and Identity](payload-schema-evolution.md).

A one-field payload may inline the field object in `z.extend` instead of a
separate `FieldsZod`. Still use `PayloadZodOfSchema` and the factory trio.

**Module configs** are payloads too, but they extend an existing config Zod
(`WitnessConfigZod`, `ModuleConfigZod`, `DivinerConfigZod`) that already includes
the envelope, then override `schema` with `z.literal(ConfigSchema)`. Still emit
`is` / `as` / `to` from that result.

Do not:

- Write `z.object({ schema: z.literal(Schema), …fields })` or `z.strictObject({ schema: z.literal(Schema), … })`
- Use `isPayloadOfSchemaType` / `isPayloadOfZodType` / `AsObjectFactory` as the primary guard
- Import `z` from `'zod'` (full Zod) for payload definitions
- Hand-write `isFoo` via `.safeParse` instead of the factories

### Identifier

The `schema` field is a validated branded string. Use `asSchema(name, true)`;
never brand an invalid string with a cast.

Schema format: the entire string is nonempty ASCII lowercase letter/digit segments separated by single dots — `/^(?:[a-z0-9]+\.)*[a-z0-9]+$/`. Hyphens, underscores, Unicode, uppercase, whitespace, and empty segments are invalid. New schema names identify a stable type family: no structural `.v1`, `.1`, or similar suffix. Namespace ownership is separate from syntax. Read [Payload Schema Evolution and Identity](payload-schema-evolution.md) before creating or changing a contract.

### Meta Field Conventions

Payload fields use prefix conventions to distinguish data from metadata:

| Prefix | Type | Examples | Purpose |
|--------|------|----------|---------|
| _(none)_ | Data fields | `move`, `player`, `score` | Application data — included in data hash |
| `_*` | Storage metadata | `_hash`, `_dataHash`, `_sequence` | Computed by infrastructure, not part of the payload's identity |
| `$*` | Client metadata | `$version`, `$sources`, `$signatures` | Included in root hash; excluded from data hash |

**Never invent `_` or `$` fields for application data.** These prefixes are reserved. The standardized optional `$version` is a structure revision encoded in radix 1,000; absence means `1.0.0` (`1_000_000`). Use SDK version helpers, and never inject a default into an existing payload. Full rules: [Payload Schema Evolution and Identity](payload-schema-evolution.md).

Type helpers for working with meta:
- `WithStorageMeta<T>` — payload with `_hash`, `_dataHash`, `_sequence`
- `WithHashMeta<T>` — payload with `_hash` and `_dataHash`
- `WithoutMeta<T>` — strips all `_*` and `$*` fields

### PayloadBuilder

Use `PayloadBuilder` to construct payloads — don't create raw object literals:

```ts
import { PayloadBuilder } from '@xyo-network/sdk'

const payload = new PayloadBuilder({ schema: MoveSchema })
  .fields({ move: 'rock' })
  .build()
```

#### Narrowing the built payload

A TypeScript annotation, generic argument, or `as` cast does not validate custom
fields at runtime. Do not use `as unknown as MovePayload` to bypass the branded
schema or supported-version contract. Pair `PayloadBuilder.build()` with the
asserting parser from [Authoring a payload type](#authoring-a-payload-type):

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
- `PayloadBuilder.hash(payload)` — **default for application identity, references, commitments, cache keys, and deduplication**; includes client meta, excludes storage meta
- `PayloadBuilder.dataHash(payload)` — data projection excluding all meta, including `$version`; use only for an explicit protocol requirement, such as BoundWitness signing
- `PayloadBuilder.hashPairs(payloads)` — returns `[payload, hash][]` tuples
- `PayloadBuilder.toHashMap(payloads)` — returns `Record<Hash, Payload>`

Static meta manipulation:
- `PayloadBuilder.omitMeta(payload)` — remove all `_*` and `$*` fields
- `PayloadBuilder.omitStorageMeta(payload)` — remove `_*` fields only
- `PayloadBuilder.omitClientMeta(payload)` — remove `$*` fields only
- `PayloadBuilder.addStorageMeta(payloads)` — compute and attach `_hash`, `_dataHash`, `_sequence`

**Metadata stripping is not validation.** `omitMeta` / `omitClientMeta` remove `$version`; never strip it then infer that the original was version 1. Verify the original root hash, validate the original supported version and shape, and only then make an explicitly scoped projection.

### Schema-Based Type Discrimination

Schemas identify a type family, not a complete revision. The canonical guard is the **Zod-factory** generated alongside the payload type in [Authoring a payload type](#authoring-a-payload-type) — it checks schema name, supported effective `$version`, and shape together.

```ts
// Filter a mixed payload array — typed as MovePayload[] AND validated
const moves = allPayloads.filter(isMovePayload)
```

The SDK also exports `isPayloadOfSchemaType<T>(schema, supportedVersions?)` and `isPayloadOfZodType<T>(zod, schema?, supportedVersions?)`. The first checks the tag and supported version but trusts custom fields. The second also runs the supplied shape validator. Prefer a Zod-factory around a complete version-aware definition; never treat a tag/version check as full payload validation.

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
import { Account, BoundWitnessBuilder } from '@xyo-network/sdk'

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

`@xyo-network/sdk` exposes two predicates:

```ts
import { addressesContainsAll, addressesContainsAny } from '@xyo-network/sdk'

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
