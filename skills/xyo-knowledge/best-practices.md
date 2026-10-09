# Protocol Best Practices

## Root Barrel Import

**Start from `@xyo-network/sdk`** — the root barrel package for the XYO SDK. It re-exports all of `@xyo-network/sdk-protocol` (payloads, bound witnesses, accounts, schemas, the boundwitness validators) plus the generic module groups bundled with it. Tree shaking eliminates what you don't use.

```ts
// Good — single root barrel import
import {
  Payload, PayloadBuilder, asSchema,
  BoundWitnessBuilder,
  Account, HDWallet,
  MemoryArchivist, MemoryNode,
} from '@xyo-network/sdk'

// Avoid — the pre-July-2026 names. All are deprecated compatibility shims that
// now resolve to subpaths of the two monoliths, and they pin an older SDK.
import { Payload } from '@xyo-network/payload-model'      // → @xyo-network/sdk
import { Account } from '@xyo-network/account'            // → @xyo-network/sdk
import { MemoryArchivist } from '@xyo-network/archivist-memory' // → @xyo-network/sdk
```

**The barrel is not exhaustive.** It does not carry every published `@xyo-network/*` package — specific diviner, witness, and archivist *implementations* ship on their own and are imported by name:

```ts
import { StorageArchivist } from '@xyo-network/archivist-storage'
import { IndexedDbArchivist } from '@xyo-network/archivist-indexeddb'
import { ArchivistPayloadDiviner } from '@xyo-network/diviner-archivist'
import { TimestampWitness } from '@xyo-network/witness-timestamp'
```

Reach for the barrel first; add a named package only when the symbol genuinely is not on it.

This applies to all XYO protocol development.

Building on XL1? See [Development on XL1](../xl1-knowledge/development.md) for the XL1 root barrels and the chain-specific rules layered on these practices.

---

## SDK-First: Protocol Compliance

**When an SDK construct exists for an operation, always use it instead of a native primitive.** SDK classes encode canonical serialization, transport contracts, and type safety that the protocol requires. Reinventing them doesn't just duplicate effort — it produces output that is likely **protocol-incompatible**.

### Why this matters

The XYO protocol defines precise rules for how data is serialized, hashed, signed, and transported. SDK classes implement these rules. Native browser or Node.js APIs do not:

- **Hashing:** `PayloadBuilder.hash` is the default for application identity, references, commitments, caches, and deduplication: it includes client metadata and uses canonical serialization. Native `JSON.stringify` plus a digest is not the protocol algorithm. `PayloadBuilder.dataHash` additionally strips all client metadata, including `$version`; use it only where a specific protocol requires that projection. See [hash and version rules](payload-schema-evolution.md#root-hash-for-virtually-all-application-uses).
- **Payload construction:** `PayloadBuilder` validates the schema name and keeps meta fields in their lanes (`.fields()` drops `$*` / `_*` keys; client metadata goes through `.meta()`). It does **not** validate custom fields — pair `build()` with the payload's Zod `as…` factory ([Narrowing the built payload](primitives.md#narrowing-the-built-payload)). Raw object literals (`{ schema: '...', field: value }`) skip all of this and may produce invalid payloads.
- **BoundWitness construction:** `BoundWitnessBuilder` computes parallel arrays (`addresses`, `payload_hashes`, `payload_schemas`, `previous_hashes`, `$signatures`) and maintains chain continuity. Manual construction risks breaking these invariants.

### Anti-pattern table

| Anti-Pattern | Protocol Risk | Use Instead |
|---|---|---|
| `crypto.subtle.digest` on `JSON.stringify(payload)` | Hash will not match canonical protocol serialization | `PayloadBuilder.hash(payload)`; retain `dataHash` only for an explicit protocol contract |
| Manual BoundWitness field construction | Parallel array invariants easily broken | `BoundWitnessBuilder` |
| Raw object literal `{ schema: '...', field: val }` | Skips schema-name and meta field handling | `PayloadBuilder`, narrowed with the payload's Zod factory |

### When native constructs are acceptable

Use native APIs only when the SDK genuinely has no alternative:

- **`crypto.getRandomValues()`** — for cryptographic randomness (salts, nonces). The SDK doesn't wrap generic random value generation.
- **`crypto.randomUUID()`** — for generating unique identifiers. No SDK equivalent.
- **`localStorage` / `sessionStorage`** — only for non-payload data (e.g., UI preferences, feature flags) where the archivist interface adds no value. For payload storage, use an SDK browser archivist instead — see [Module System — Browser Archivist Selection](modules.md).

For payload persistence in the browser, the SDK provides three archivist implementations — `IndexedDbArchivist`, `StorageArchivist`, and `MemoryArchivist` — that share the standard archivist interface with built-in deduplication, events, and pagination. Prefer these over raw `localStorage` for payload data.

When using a native construct, add a brief comment noting why the SDK doesn't cover this case, so future readers don't mistake it for an oversight.

---

## Schema Naming

Schemas are the primary mechanism for type discrimination in XYO. Choose them carefully — the namespace they live under is a contract about who owns the name.

### Format

- Exact syntax: nonempty ASCII `[a-z0-9]` segments separated by single dots — `/^(?:[a-z0-9]+\.)*[a-z0-9]+$/`. No hyphens, underscores, Unicode, capitals, whitespace, URL escaping, or empty segments.
- Specific and hierarchical: `com.example.rps.move`, not `com.example.data`.
- Keep new type-family names stable; structural `.v1`, `.v01`, `.1`, etc. are anti-patterns. Use standardized `$version`; preserve historical identifiers pending an explicit migration.
- Reverse-domain ownership is additional policy, not something the syntax establishes. Domain authority lookup requires ≥3 levels; base syntax does not. Never strip a real domain's hyphens to make it fit: that names a different owner.

Read [Payload Schema Evolution and Identity](payload-schema-evolution.md) for the full naming, numeric version, frozen-definition, open/closed object, compatibility, and hash rules.

### Namespace tiers

| Tier | Namespace | Who authors it | Examples |
|---|---|---|---|
| 1. Protocol primitives | `network.xyo.*` | XYO Foundation, shipped in the SDK | `network.xyo.boundwitness`, `network.xyo.payload`, `network.xyo.payload.bundle`, `network.xyo.node.manifest` |
| 2. Canonical substrates | `network.xyo.*` | XYO Foundation, shipped in a Foundation SDK | Foundation-blessed schema families layered on the primitives — token, inscription, and exchange standards, for example. Import them from the SDK that ships them; never redefine them |
| 3. Application schemas | `com.<your-org>.<app>.*` | The application author | `com.acme.auction.bid`, `com.partner.market.position` |
| 4. Documentation examples | `com.example.*` | Tutorials, skill examples, scaffolds | `com.example.rps.move`, `com.example.market.commit` |

**`network.xyo.*` is reserved.** Application authors MUST NOT publish schemas under `network.xyo.*` — the namespace belongs to XYO Foundation and identifies primitives the protocol itself defines. Authoring there silently squats a slot that XYO Foundation may later claim, and trains downstream tooling to trust your payload shape as protocol-canonical.

`com.example.*` is reserved by RFC 2606 for example/placeholder use, which makes it the right namespace for docs and scaffold templates — readers see `com.example.*` and know to replace it with their own reverse-DNS namespace before shipping.

### Decision tree

When you need a new schema:

1. *Is this a payload the XYO SDK already defines, or one XYO Foundation intends to bless as a protocol-level primitive?* → `network.xyo.*` — and you are not the one authoring it; coordinate with XYO Foundation.
2. *Am I building a real application?* → `com.<your-org>.<app>.*`. If you don't own a domain, use a namespace you control (e.g. `io.github.<user>.<app>`).
3. *Am I writing docs, a tutorial, a scaffold template, or a skill example?* → `com.example.<app>.*`. The placeholder framing is intentional.

### Examples

```ts
// Tier 1 — protocol primitives (SDK-owned)
'network.xyo.boundwitness'
'network.xyo.payload'
'network.xyo.payload.bundle'
'network.xyo.node.manifest'

// Tier 2 — canonical XYO Foundation substrates: also network.xyo.*, imported
// from the Foundation SDK that ships them, never redefined

// Tier 3 — what a real application looks like
'com.acme.auction.bid'           // Acme's sealed-bid auction app
'com.partner.market.position'    // Partner's market position payload

// Tier 4 — what this documentation uses
'com.example.rps.move'           // A player's move (illustrative)
'com.example.rps.game'           // Game state (illustrative)
'com.example.rps.result'         // Game outcome (illustrative)
```

### Schema as Type Identity

The canonical guard is the **Zod-factory pair** generated from each version-aware payload definition, as in [Authoring a payload type](primitives.md#authoring-a-payload-type). `zodIsFactory(MoveZod)` must validate schema name, supported effective `$version`, and shape together. Start from `PayloadZodOfSchema` (or `PayloadZodLooseOfSchema` / `PayloadZodStrictOfSchema` when the unknown-field policy requires it); a bare `z.literal(schema)` is not a payload envelope and does not check a revision. Use the complete guard whenever you read payloads from an archivist, a remote store, or another party.

```ts
const moves = allPayloads.filter(isMovePayload)
```

`isPayloadOfSchemaType<T>()` checks the schema and supported version but not custom fields. Avoid treating it as a full validator at trust boundaries: the right tag/version with the wrong shape still passes that limited check.

### Trust boundary on reads

A bound witness that passes `BoundWitnessValidator` is trustworthy structure: its `addresses`, `$signatures`, `payload_hashes`, and `payload_schemas` are what its signers committed to. The **payload bodies** those hashes point at are a separate read, usually from a store where anyone can write bytes — including bytes that carry a schema name but not its shape. Trust but verify: keep a body only if it hashes back (`PayloadBuilder.hash`) to the hash the bound witness lists, and Zod-validate every payload your code consumes, whichever store it came back from.

In practice: once the bound witness has validated, trust its signers and its hash list without re-checking. Do not trust a dereferenced body until it has matched its committed hash and passed your Zod guard.

---

## Payload Design

### Keep Payloads Focused
One concept per payload type. A `MovePayload` contains a move, not a move AND the game state AND the result. Compose larger structures from multiple focused payloads bound together in a bound witness.

### Reference by Hash, Don't Embed
Use `$sources` to reference related payloads by **root hash** (`PayloadBuilder.hash`) rather than nesting payloads. This commits to their client metadata, including `$version`. Retain another hash only where a shipped protocol explicitly prescribes it; do not rewrite that contract implicitly.

### Respect Reserved Prefixes
- `_*` fields are for storage infrastructure (hashes, sequences)
- `$*` fields are for standardized client metadata (`$version`, sources, signatures)
- Never use these prefixes for application data

### Use PayloadBuilder
Always construct payloads via `PayloadBuilder`, not raw object literals. The builder checks the schema name and manages meta fields — `$version` / `$sources` set through `.fields()` are silently dropped, so use `.meta()`. It does not check your fields; the Zod factory does.

```ts
// Good
const payload = asMovePayload(
  new PayloadBuilder({ schema: MoveSchema })
    .fields({ move: 'rock' })
    .build(),
  true,
)

// Avoid
const payload = { schema: 'com.example.rps.move', move: 'rock' }
```

---

## Declarative Payloads, Structural Authorship

**Payloads are pure declarative content. Authorship, ownership, and identity are structural — they live on the BoundWitness, not in payload fields.**

This decomposition is foundational. Every protocol-correct application on XYO obeys it, and most subtle bugs in higher-layer applications come from violating it.

### The decomposition

| Concern | Lives where | Why |
|---|---|---|
| What the data says (content) | Payload fields | Content is declarative — it describes the world |
| Who said it (authorship) | BoundWitness `addresses[]` + `$signatures[]` | Authorship is structural — it's the act of binding signed proof to that content |
| When it was said (ordering) | The signer's `previous_hashes` chain, plus the inclusion position of whatever ledger records the BoundWitness | Ordering is structural — assigned by signing and by inclusion, not declared in the payload |
| Whether it can be trusted | Signature verification on the BoundWitness | Trust is structural — derived from cryptographic proof, not from a self-declared field |

A payload that says `{ schema: '...', amount: 100, from: '0xABC...' }` mixes the two layers. The `from` field is *declarative* (anyone can write it) but is being asked to carry *structural* meaning (this came from 0xABC). The structural truth is that whoever signed the wrapping BoundWitness is the actor — and that's already cryptographically verifiable. The `from` field is at best redundant, at worst a footgun where an attacker writes a different address than the signer.

### The rule

When you find yourself reaching for a `from`, `signer`, `owner`, `author`, or `creator` field on a payload, **stop**. The information you need is already on the BoundWitness wrapping that payload:

```ts
// The signers of the wrapping BoundWitness are the authors
const signers = boundWitness.addresses // addresses[i] paired with $signatures[i]
```

If your indexer / read model needs the actor for a payload, it should retrieve the wrapping BoundWitness, validate it, and read the signer from its `addresses` — not trust a field inside the payload. A protocol built on XYO may designate one signer as the sender of a wrapping BoundWitness; that designation is still structural, so read it from the BoundWitness, never from a payload field.

### Why this matters in practice

- **Eliminates a class of bug.** A `from`-in-payload field can disagree with the BoundWitness signer. Now you have two sources of truth and must choose which one to trust. By keeping `from` exclusively structural, there is only one source of truth — the cryptographically verified signer.
- **Keeps payloads idempotent and content-addressable.** Two users submitting byte-identical declarative payloads naturally produce the same hash. That's a feature for artifacts (NFTs, deploys), and it composes cleanly with first-recorded-wins ownership semantics. Stuffing per-submitter fields into payloads breaks this.
- **Lets identical content be co-witnessed.** Multiple parties can co-sign the same payload (e.g., both players witnessing the same game outcome). If authorship were declarative, each party would need their own copy of the payload with their address baked in. Structural authorship lets one payload have many witnesses.
- **Makes ownership models composable.** Inscriptions, ownable assets, and signed-event protocols can all derive ownership from the BoundWitness chain — no schema-specific field plumbing.

### When a field that *looks* like authorship is actually content

Sometimes a payload legitimately has a field like `recipient`, `target`, or `delegate`. These are not authorship — they are part of the declarative content (what the actor is asserting). The test is: *would it make sense for someone other than the actor to write this field?* If yes, it's content. If no, it's authorship and belongs on the BoundWitness.

```ts
// Content — recipient is a fact the actor is declaring
{ schema: 'com.example.market.payout', recipient: '0xRecipient...', amount: 100 }

// Authorship — never in the payload
{ schema: '...', from: '0xSelf...' }  // Wrong — derive from BoundWitness signer
```

---

## Module Composition

### Prefer Composition Over Custom Implementations
The SDK provides many module implementations. Before writing a custom module, check if an existing one can be configured or composed to do what you need.

### Wire Modules Through Nodes
Don't create direct dependencies between modules. Register them with a node and use address-based resolution:

```ts
// Good — loose coupling via node resolution
const diviner = await MyDiviner.create({
  config: { archivist: archivist.address, ... }
})
await node.register(diviner)

// Avoid — direct reference
const diviner = new MyDiviner(archivist)
```

### Visibility Is Intentional
- `attach(address, true)` — public, visible to parent nodes and external queries
- `attach(address, false)` — private, only visible within this node
- Default to private unless the module needs to be discoverable from outside

### Use Manifests for Production
Imperative composition (`create` → `register` → `attach`) is fine for testing and prototyping. For production, declare the module tree in a manifest for reproducibility and configuration management — see [Manifest System](modules.md#manifest-system) for the loader.

### Account Strategy
- **Testing:** `{ account: 'random' }` — quick, no key management needed
- **Production:** deterministic accounts from wallets or phrases for recoverability and identity persistence

---

## Bound Witness Discipline

### Witness Significant State Changes
Every significant state change in your application should be captured in a bound witness. This creates a cryptographic audit trail. For a game, this means witnessing: game creation, move submissions, and outcome determination.

### Never Construct Fields Manually
Always use `BoundWitnessBuilder`. The builder computes `addresses`, `payload_hashes`, `payload_schemas`, and `previous_hashes` from the provided signers and payloads. Manual construction risks breaking invariants.

### Preserve Chain Continuity
The `previous_hashes` array creates a tamper-evident, per-signer chain of bound witnesses. Don't use throwaway accounts where continuity matters — reuse the same account to build a meaningful chain. An account's `previousHash` is held in memory only, so persist it with `Account.previousHashStore` (`IndexedDbPreviousHashStore` / `StoragePreviousHashStore`) or every reload restarts the chain; with a store, a concurrent sign from another tab throws rather than forking it. See [Identity & Signing — Chain Continuity](identity.md#chain-continuity).

### Multi-Party Signing
A bound witness with multiple signers proves that all parties agreed on the same data. For a game like Rock Paper Scissors, this is valuable: both players and a game arbiter can co-sign the outcome. Players do not share keys: reserve the other parties' slots with `.participant({ address, previousHash })`, pass the partially signed BW along, have each party fill its slot with `cosignBoundWitness`, then check `isFullySigned` (shape only) and validate with `BoundWitnessValidator`. See [sequential cosigning](primitives.md#parties-in-separate-processes-sequential-cosigning).

---

## Error Handling

### Module Errors Are Payloads
Module queries return `[BoundWitness, Payload[], ModuleError[]]`. The third element is an array of errors. **Always check it:**

```ts
const [bw, results, errors] = await module.query(queryBw, queryPayloads)

if (errors.length > 0) {
  // Handle errors — they are payloads with their own schema
  console.error('Query errors:', errors)
}
```

Errors are structured data (payloads with schemas), not thrown exceptions. This keeps the query interface consistent and composable.
