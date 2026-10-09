# Protocol Primitives

**Root barrel package:** `@xyo-network/sdk` — start here for protocol primitives and generic modules; tree shaking eliminates unused exports. Specific diviner / witness / archivist *implementations* ship as their own packages and are imported by name.

For full type details, read the `.d.ts` files under `dist/neutral/` — `modules/<name>/` in `@xyo-network/sdk-protocol-core` (re-exported through `@xyo-network/sdk-protocol` and the barrel) for the primitives on this page.

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
import { z } from 'zod/mini'

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
| Zod import | `import { z } from 'zod/mini'` — the `zod/mini` entry the SDK uses, not full `zod`; named `z`, not a namespace import |
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

`.fields()` takes data fields only: it **silently drops** any `$*` or `_*` key
(and `undefined` values), and each call replaces the previous field set. Set
client metadata such as `$version` or `$sources` through `.meta({ … })`, which
keeps only `$*` keys and throws on an invalid `$version`:

```ts
const sourced = new PayloadBuilder({ schema: MoveSchema })
  .fields({ move: 'rock' })
  .meta({ $sources: [gameHash] }) // `$version` belongs here too — never in .fields()
  .build()
```

The builder validates the schema name (`asSchema`) and nothing else — custom
fields are not checked. Narrow the result with the payload's Zod factory, as below.

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
  addresses: XyoAddress[]               // Signing parties
  payload_hashes: Hash[]                // Hashes of included payloads
  payload_schemas: Schema[]             // Schemas of included payloads
  previous_hashes: (Hash | null)[]      // Chain linking (per signer)
  $signatures: (Hex | null)[]           // Cryptographic signatures
}
```

`XyoAddress` is either a legacy 40-hex secp256k1 address or a bech32m
post-quantum address (`qm65…`, ML-DSA-65 — see
[Identity & Signing](identity.md#account)). Both kinds can sign the same bound
witness; validate with `isXyoAddress` rather than a hex regex.

### Invariants

These arrays are always parallel:
- `addresses.length === $signatures.length === previous_hashes.length`
- `payload_hashes.length === payload_schemas.length`

### Signed vs Unsigned

- `UnsignedBoundWitness` — `$signatures` contains all `null` values
- `SignedBoundWitness` — `$signatures` contains all non-null hex strings
- `PartiallySigned<T>` — some slots filled, some `null`: the intermediate state
  of [sequential cosigning](#parties-in-separate-processes-sequential-cosigning).
  `isPartiallySigned(bw)` / `isFullySigned(bw)` check the slots' shape only

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
- `.signer(account)` / `.signers([...])` — add parties whose keys are in this process; they sign at `build()`
- `.participant({ address, previousHash })` / `.participants([...])` — add address-only parties; their slots stay `null` until they [cosign](#parties-in-separate-processes-sequential-cosigning)
- `.payload(payload)` / `.payloads([...])` — add payloads to witness
- `.hashes(hashes, schemas)` — meant to reference payloads by hash, but in SDK 8.0.x it throws `Can not set hashes when payloads already set` on every call; attach the payloads instead
- `.sourceQuery(hash)` — set the source query hash
- `.build(sign?)` — returns `[BoundWitness, Payload[], ModuleError[]]`; `build(false)` leaves every slot `null`

Slot order follows the order in which signers and participants are added. The builder auto-generates `addresses`, `payload_hashes`, `payload_schemas`, and `previous_hashes` from the provided parties and payloads. These fields cannot be set manually.

### Multi-Signer (Co-Witnessed) BoundWitnesses

A single bound witness can be co-signed by multiple parties. Each signer contributes their address and signature to the same witness, producing a single artifact that proves *joint* attestation. When every signer's key is in one process, pass them all to `.signers()`:

```ts
const [bw, payloads] = await new BoundWitnessBuilder()
  .signers([accountA, accountB, accountC])
  .payload(jointPayload)
  .build()

// bw.addresses === [addrA, addrB, addrC]
// bw.$signatures contains one signature per signer, in the same order
```

This is the right shape for any "all parties agree to X" attestation — joint terms, multi-party releases, group commitments — where the proof must be a single co-signed object rather than three independent signatures.

#### Parties in separate processes (sequential cosigning)

Real counterparties rarely share a process. Reserve each remote party's slot by
address with `.participant()`, ship the partially signed BW, and let each party
fill its own slot with `cosignBoundWitness`:

```ts
import {
  BoundWitnessBuilder, BoundWitnessValidator, cosignBoundWitness, isFullySigned, PayloadBuilder,
} from '@xyo-network/sdk'

// Party A — holds only its own key; B shares its address and current previousHash
const [draft] = await new BoundWitnessBuilder()
  .signer(accountA)
  .participant({ address: addressB, previousHash: previousHashB ?? null })
  .payload(terms)
  .build()
// draft.$signatures → [sigA, null]; send draft + terms to B

// Party B — in its own process; check it is signing the terms it agreed to
if (!draft.payload_hashes.includes(await PayloadBuilder.hash(terms))) throw new Error('unexpected terms')
const cosigned = await cosignBoundWitness(draft, accountB)

if (!isFullySigned(cosigned)) throw new Error('missing signatures')
const errors = await new BoundWitnessValidator(cosigned).validate()
```

- `build()` is typed `Signed` even with participants — it is really partially
  signed. Narrow with `isFullySigned` before treating it as signed.
- `cosignBoundWitness(bw, account)` returns a new BW (the input is not mutated)
  with only that account's slot filled. Cosigning never changes the data hash,
  so parties can sign in any order.
- It throws if the account's address is not listed, the slot is already filled,
  or the recorded `previous_hashes` entry no longer matches the account's
  current `previousHash` — a party must not sign anything else between sharing
  its `previousHash` and cosigning.
- It signs whatever data hash the BW carries. Each party checks the BW's
  `payload_hashes` (root hashes) against the payloads it actually agreed to
  before cosigning.
- `isFullySigned` is a shape check; run `BoundWitnessValidator` on the final BW.

#### Verifying multi-signer witnesses

`addressesContainsAll` and `addressesContainsAny` check **membership** in
`addresses` only — they never read `$signatures`, so a BW with a `null` or
invalid signature in a listed slot still passes. Pair them with
`BoundWitnessValidator`, whose `validate()` verifies every `$signatures` entry
against the BW's data hash (plus the structural checks) and resolves to an
`Error[]` that is empty when the BW is valid:

```ts
import {
  addressesContainsAll, addressesContainsAny, BoundWitnessValidator,
} from '@xyo-network/sdk'

const errors = await new BoundWitnessValidator(bw).validate()
const isValid = errors.length === 0

// All listed parties signed this BW
const isJointlySigned = isValid && addressesContainsAll(bw, [addrA, addrB, addrC])

// At least one of the listed parties signed
const isAuthoritySigned = isValid && addressesContainsAny(bw, authorityAddresses)
```

`isFullySigned(bw)` (also from `@xyo-network/sdk`) is only a shape guard — every
address slot holds a signature string — and does not verify them. Use it to
narrow or reject early, never in place of `validate()`.

Use `addressesContainsAll` when every party's signature is required (joint commitment, atomic exchange). Use `addressesContainsAny` when any one of a set of authorized signers suffices (oracle attestation, authority signoff).

### Chain Continuity

Each signer tracks a `previousHash` that links bound witnesses into a tamper-evident chain. The `previous_hashes` array records each signer's last known hash at the time of signing. This creates an ordered, linked history of interactions per identity. The value lives in memory unless a previous-hash store is configured — see [Identity & Signing — Chain Continuity](identity.md#chain-continuity).

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
