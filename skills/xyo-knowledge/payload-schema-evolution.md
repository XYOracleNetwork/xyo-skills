# Payload Schema Evolution and Identity

Read this before authoring a payload, changing a field, selecting a hash, or
building a validator/cache/indexer. The [core SDK payload contract](https://github.com/XYOracleNetwork/sdk-protocol-js/blob/main/packages/sdk-protocol-core/README.md#payload-schema-contracts)
owns the wire rules. Check the installed SDK's exports before using new helpers;
an older installed package or deployed network does not gain support from a skill
update. Do not invent a parallel encoder or claim a protocol migration happened.

## Identifier: stable, ASCII, and owned

The entire `schema` string must match `[a-z0-9]+(?:\.[a-z0-9]+)*`: ASCII lowercase
letters and digits in nonempty segments, with single dots between them. No `-`,
`_`, Unicode, capitals, whitespace, URL escaping, empty segments, or edge dots.
Use `asSchema(name, true)`; never brand an invalid string with a cast. Prefer
`com.example.market.results` to `com.example.market.results-view`.

The name identifies a type family. **Do not add a structural version suffix**
(`.v1`, `.v01`, `.1`, etc.) to a new schema. Put the structure revision in
`$version`; put a subject/API version in a descriptive data field such as
`apiVersion`. Do not silently rename existing published identifiers, even when
they violate today's design guidance.

Namespace ownership is separate from syntax. Use a reverse-domain namespace you
control; `network.xyo.*` is reserved for XYO protocol authors, `com.example.*` for
examples. Domain-authority lookup requires at least three levels although base
syntax does not. The existing `SchemaNameValidator` and default `PayloadValidator`
also retain their three-segment minimum: successful `asSchema('local', true)` does
not imply acceptance by default payload validation. Do not strip hyphens from a
real domain: `my-org.com` does not control `myorg.com`. Use a valid namespace you actually control; no implicit URL,
DNS, IDNA, or percent-encoding conversion is defined.

## `$version`: the structure contract

```text
major * 1_000_000 + minor * 1_000 + patch
```

Components are integers `0..999`; the encoded range is `0..999_999_999`.
`1.2.3` is `1_002_003`. Absence in the original payload means `1.0.0`
(`DefaultPayloadVersion = 1_000_000`), permanently. Reject `null`, strings,
fractions, negatives, non-finite numbers, and out-of-range values. This is a
three-component numeric format without prerelease/build strings, not radix 10,000.

Use SDK `encodePayloadVersion({ major, minor, patch })`, `decodePayloadVersion`,
and `getPayloadVersion(payload)`. The latter validates and reads the effective
version without mutation. Reading a default must not insert a field: explicit and
omitted `1.0.0` have equal effective revisions but different root hashes.

`network.xyo.schema` already has an ordinary `version` field with radix 1,000.
That field versions the described `definition.$id` contract; the envelope's
`$version` versions the structure of `network.xyo.schema` itself. Never copy one
into the other. Existing `SchemaCache` and domain maps remain name-keyed, not
`(schema, version)` selectors. Retain/pin exact historical definitions and select
trusted validators explicitly; the current cache is not a version-aware registry.

## Freeze the definition; choose object closure separately

Each published `(schema, effectiveVersion)` definition is immutable:
fields, requiredness, types, constraints, meanings, and unknown-field policy.
Freezing is a publication rule, not a sender-controlled `$frozen`/`$locked` flag.

- **Closed:** reject undeclared fields. Enumerate accepted metadata and define
  closure for nested objects explicitly.
- **Open:** allow extra fields under the definition's extension policy; preserve
  them when forwarding/hashing. They may be ignored only where the contract says
  they have no unknown operational effect.

Use JSON Schema `additionalProperties` or explicit strict/loose Zod objects.
Default `z.object` parsing strips unknown fields; do not mistake that for strict
rejection or for an open payload round-trip.

An extra ignorable field already allowed by an open contract need not change its
version. Editing a published definition requires a new revision. Adding required
fields or widening an existing type is **not automatically compatible**:

| Change | New readers reading old data | Old readers reading new data |
|---|---|---|
| Optional field added | Check old unknown values do not conflict | Requires open/ignorable extension policy |
| Required field added | Fails if old data lacks it | Depends on closure and semantics |
| Existing type widened | Accepts old values | May reject new alternatives |
| Existing type narrowed | May reject history | Accepts the retained values |
| Field removed | Depends on requiredness/closure | May require the missing field |

Major revisions mark breaks in promised compatibility; minor revisions compatible
additions; patch revisions compatible clarifications/corrections. Version names do
not prove a change is compatible. Test both reader directions and historical
replay. Keep meanings explicit and stable: use `dollarCost` versus `centsCost`,
not an unchanged `cost` field whose units change with the version. Changed defaults
or effects also change semantics even if JSON shapes are unchanged.

## Validate identifier, supported version, and shape together

Author the type as in [Authoring a payload type](primitives.md#authoring-a-payload-type).
The envelope factory is what binds schema name and `$version` to the field shape:

```ts
import * as z from 'zod/mini'
import { asSchema, PayloadZodOfSchema } from '@xyo-network/sdk'

const ReadingSchema = asSchema('com.example.sensor.reading', true)
const ReadingFieldsZod = z.object({ temperatureCelsius: z.number() })
const ReadingZod = z.extend(PayloadZodOfSchema(ReadingSchema), ReadingFieldsZod.shape)
```

That uses the default envelope (`PayloadZodOfSchema`, extra keys stripped,
effective `$version` `1.0.0`). Swap in `PayloadZodStrictOfSchema` when the
definition is closed, or `PayloadZodLooseOfSchema` when extra keys must
round-trip. All three default to supporting only effective `1.0.0`; the second
argument accepts a version or a version array. A shared validator may list several
revisions only if its full shape/semantics apply to all of them. Otherwise select
the exact definition explicitly. `PayloadVersionZodForVersions` supports a custom
shape, and `isPayloadVersionSupported` supports a separate version gate.

A bare `schema === X` or `z.literal(X)` does not check version or shape — and it
does not produce a payload envelope. `isPayloadOfSchemaType` checks the tag and
supported version but not the custom fields. Use the complete typed guard on
chain/datalake reads. Do not retry failed parsing with an older version, infer
the revision from whatever shape passes, or accept unsupported versions merely
because an object is open.

Verify the original object's hash before projection. **Preserve `$version` before
validation**: `omitMeta` and `omitClientMeta` delete it. If a shipped parser needs
a body projection, check version/authority on the original, then explicitly
project and retain that provenance. A stripped copy is not evidence of an omitted
original field. Avoid parser defaults/transforms when verifying identity.

## Root hash for virtually all application uses

**Default to `PayloadBuilder.hash(payload)`**, the root hash (`_hash`), for new
application identity, `$sources`, references, signing commitments, validation
caches, and deduplication. It includes client metadata (`$version`, `$sources`,
`$signatures`) and excludes storage metadata (`_*`). Do not substitute native
hashing of `JSON.stringify`.

`PayloadBuilder.dataHash` (`_dataHash`) strips all metadata. It can intentionally
group distinct versioned representations, so it is a rare choice for explicit
protocol requirements, not the general content-addressing default. Root and data
hashes can match on metadata-free examples; they are not interchangeable.

BoundWitnesses sign their own data hash to avoid signing their own signatures.
Normally attached children are root-hash committed in `payload_hashes`, which can
authenticate their `$version`. Data-hash-only references do not bind it. A
standalone BoundWitness's own `$version` is not authenticated by its own
signatures: only verified outer root-hash commitments or independently trusted
protocol context can make it authoritative. Never let an unbound version select
weaker authentication, authorization, closure, or consensus rules.

Cache schema definitions by `(schema, effectiveVersion)`. Cache validation by root
hash **and** applicable validator/authorization policy. A data-hash lookup may
group variants but must not silently replace one representation with another.
Check actual archivist lookup/dedup behavior; a generic data-hash-based store does
not become representation-safe through a new key in application code alone.

## Existing protocol exceptions and migration

Keep the hash algorithm prescribed by a shipped protocol. BoundWitness signing,
Statement Graph object references, ordinal/inscription IDs and burn derivation,
exchange commitments, and Event Kit contracts may intentionally use data hashes.
Import their builders/validators and preserve their current algorithms and names.
Do not globally replace `dataHash` calls or label a skill/example edit a deployed
migration. A change needs versioned definitions, compatibility/activation rules,
historical replay handling, and verification in that protocol and its consumers.

For new applications that are not bound to one of those contracts, use root hashes
and explicit supported-version/shape validation from the start.
