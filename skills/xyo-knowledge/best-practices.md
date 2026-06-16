# Protocol Best Practices

## Root Barrel Import

**Always import from `@xyo-network/sdk-js`** — the root barrel package for the XYO SDK. It re-exports everything from all ~200 sub-packages. Tree shaking eliminates what you don't use.

```ts
// Good — single root barrel import
import {
  Payload, PayloadBuilder, asSchema,
  BoundWitnessBuilder,
  Account, HDWallet,
  MemoryArchivist, MemoryNode,
} from '@xyo-network/sdk-js'

// Avoid — sub-package imports
import { Payload } from '@xyo-network/payload-model'
import { Account } from '@xyo-network/account'
import { MemoryArchivist } from '@xyo-network/archivist-memory'
```

This applies to all XYO protocol development. See also the [XL1 root barrel](../xl1-knowledge/development.md) for XL1-specific imports.

---

## SDK-First: Protocol Compliance

**When an SDK construct exists for an operation, always use it instead of a native primitive.** SDK classes encode canonical serialization, transport contracts, and type safety that the protocol requires. Reinventing them doesn't just duplicate effort — it produces output that is likely **protocol-incompatible**.

### Why this matters

The XYO/XL1 protocol defines precise rules for how data is serialized, hashed, signed, and transported. SDK classes implement these rules. Native browser or Node.js APIs do not:

- **Hashing:** `PayloadBuilder.dataHash` strips meta fields and uses deterministic field ordering before hashing. `crypto.subtle.digest('SHA-256', JSON.stringify(payload))` produces a *different hash* because `JSON.stringify` doesn't strip meta or guarantee field order. Other protocol participants will compute a different hash for the same payload.
- **Datalake access:** `RestDataLakeRunner` and `RestDataLakeViewer` implement the archivist HTTP contract (request format, hash-keyed reads, schema filtering on the request). Raw `fetch()` to the same endpoint may not match the expected request shape. Note: do not use `.next()` against a remote XL1 datalake — see [Datalakes — How to read](../xl1-knowledge/datalakes.md).
- **Chain queries:** The gateway from `useProvidedGateway()` is the correct client for reading chain state. Access viewer methods via `connection.viewer` sub-viewers. Raw `fetch` to the gateway endpoint loses type safety and provenance.
- **Payload construction:** `PayloadBuilder` manages schema validation and meta field conventions. Raw object literals (`{ schema: '...', field: value }`) skip this and may produce invalid payloads.
- **BoundWitness construction:** `BoundWitnessBuilder` computes parallel arrays (`addresses`, `payload_hashes`, `payload_schemas`, `previous_hashes`, `$signatures`) and maintains chain continuity. Manual construction risks breaking these invariants.

### Anti-pattern table

| Anti-Pattern | Protocol Risk | Use Instead |
|---|---|---|
| `crypto.subtle.digest` on `JSON.stringify(payload)` | Hash won't match canonical protocol hash | `PayloadBuilder.dataHash(payload)` |
| Raw `fetch()` to datalake endpoint | May not match archivist HTTP contract | `RestDataLakeRunner` / `RestDataLakeViewer` from `@xyo-network/xl1-sdk` |
| Calling gateway methods by string name or raw HTTP | The gateway has no `.call()` method — use the typed sub-viewer API | `defaultGateway.connection.viewer?.<sub-viewer>.<method>(...)` — see [Gateway](../xl1-knowledge/gateway.md) |
| Manual BoundWitness field construction | Parallel array invariants easily broken | `BoundWitnessBuilder` |
| Raw object literal `{ schema: '...', field: val }` | Skips meta field management and validation | `PayloadBuilder` |
| Using `datalakeRunner`/`datalakeViewer` without creating them | These are not globals — they must be instantiated | `createRestDataLakeRunner(endpoint)` / `createRestDataLakeViewer(endpoint)` from `@xyo-network/xl1-sdk` — see [Gateway](../xl1-knowledge/gateway.md) |

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

- Reverse-DNS, lowercase, dot-separated, alphanumeric — validated by `/^(?:[a-z0-9]+\.)*[a-z0-9]+$/`
- Specific and hierarchical: `com.example.rps.move`, not `com.example.data`

### Namespace tiers

| Tier | Namespace | Who authors it | Examples |
|---|---|---|---|
| 1. Protocol primitives | `network.xyo.*` | XYO Foundation, shipped in the SDK | `network.xyo.boundwitness`, `network.xyo.payload`, `network.xyo.node.manifest`, `network.xyo.transfer` |
| 2. Canonical substrates | `network.xyo.*` | XYO Foundation, shipped in the SDK | `network.xyo.ordinal.*` (inscription), `network.xyo.ordinal.token.*` (XRC-20), `network.xyo.exchange.*` |
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

// Tier 2 — canonical XYO Foundation substrates (shipped via @xyo-network/xl1-sdk)
'network.xyo.ordinal.inscription'
'network.xyo.ordinal.token.deploy'

// Tier 3 — what a real application looks like
'com.acme.auction.bid'           // Acme's sealed-bid auction app
'com.partner.market.position'    // Partner's market position payload

// Tier 4 — what this documentation uses
'com.example.rps.move'           // A player's move (illustrative)
'com.example.rps.game'           // Game state (illustrative)
'com.example.rps.result'         // Game outcome (illustrative)
```

### Schema as Type Identity

Schemas drive TypeScript type narrowing, but the canonical guard is the **Zod-factory pair** generated alongside each payload type. `zodIsFactory(MovePayloadZod)` validates schema name *and* payload shape in one step — use it whenever you read payloads from the chain or datalake.

```ts
const isMovePayload = zodIsFactory(MovePayloadZod)
const moves = allPayloads.filter(isMovePayload)
```

`isPayloadOfSchemaType<T>()` exists and looks similar, but it checks only the `schema` field — a tag check, not a validator. Avoid it for trust-boundary reads. A payload carrying the right schema string with the wrong shape would slip through.

### Trust boundary on chain reads

The gateway's RPC surface returns block envelopes, transaction structures, and signatures the chain has already validated — those can be trusted as the SDK presents them. The **application-level payload content** riding inside, however, is fetched from the datalake, where anyone can write bytes (including bytes that match a schema name but not its shape). Trust but verify: Zod-validate every payload your code consumes, even when it came back through `connection.viewer`.

In practice: you can trust `tx.payload_hashes`, `tx.from`, block numbers, and signatures without re-checking. You should not trust the dereferenced payload bodies until they've passed your Zod guards.

---

## Payload Design

### Keep Payloads Focused
One concept per payload type. A `MovePayload` contains a move, not a move AND the game state AND the result. Compose larger structures from multiple focused payloads bound together in a bound witness.

### Reference by Hash, Don't Embed
Use `$sources` to reference related payloads by hash rather than nesting payloads inside payloads. This keeps payloads flat and hashable.

### Respect Reserved Prefixes
- `_*` fields are for storage infrastructure (hashes, sequences)
- `$*` fields are for client metadata (sources, signatures)
- Never use these prefixes for application data

### Use PayloadBuilder
Always construct payloads via `PayloadBuilder`, not raw object literals. The builder handles schema validation and meta field management correctly.

```ts
// Good
const payload = new PayloadBuilder({ schema: MoveSchema })
  .fields({ move: 'rock' })
  .build()

// Avoid
const payload = { schema: 'com.example.rps.move', move: 'rock' }
```

---

## Declarative Payloads, Structural Authorship

**Payloads are pure declarative content. Authorship, ownership, and identity are structural — they live on the BoundWitness, not in payload fields.**

This decomposition is foundational. Every protocol-correct application on XYO/XL1 obeys it, and most subtle bugs in higher-layer applications come from violating it.

### The decomposition

| Concern | Lives where | Why |
|---|---|---|
| What the data says (content) | Payload fields | Content is declarative — it describes the world |
| Who said it (authorship) | BoundWitness `addresses[]` + `$signatures[]` | Authorship is structural — it's the act of binding signed proof to that content |
| When it was said (ordering) | Block height + intra-block payload index | Ordering is structural — assigned by the chain at inclusion time |
| Whether it can be trusted | Signature verification on the BoundWitness | Trust is structural — derived from cryptographic proof, not from a self-declared field |

A payload that says `{ schema: '...', amount: 100, from: '0xABC...' }` mixes the two layers. The `from` field is *declarative* (anyone can write it) but is being asked to carry *structural* meaning (this came from 0xABC). The structural truth is that whoever signed the wrapping BoundWitness is the actor — and that's already cryptographically verifiable. The `from` field is at best redundant, at worst a footgun where an attacker writes a different address than the signer.

### The rule

When you find yourself reaching for a `from`, `signer`, `owner`, `author`, or `creator` field on a payload, **stop**. The information you need is already on the BoundWitness wrapping that payload:

```ts
// For a transaction-wrapped payload (most application data)
const signer = transactionBoundWitness.from

// For a generic block-level BoundWitness (multi-signer scenarios)
const signers = boundWitness.addresses // addresses[i] paired with $signatures[i]
```

If your indexer / read model needs the actor for a payload, it should retrieve the wrapping BoundWitness and read `from` (or `addresses[0]`) — not trust a field inside the payload.

### Why this matters in practice

- **Eliminates a class of bug.** A `from`-in-payload field can disagree with the BoundWitness signer. Now you have two sources of truth and must choose which one to trust. By keeping `from` exclusively structural, there is only one source of truth — the cryptographically verified signer.
- **Keeps payloads idempotent and content-addressable.** Two users submitting byte-identical declarative payloads naturally produce the same hash. That's a feature for artifacts (NFTs, deploys), and it composes cleanly with first-finalized-wins ownership semantics. Stuffing per-submitter fields into payloads breaks this.
- **Lets identical content be co-witnessed.** Multiple parties can co-sign the same payload (e.g., both players witnessing the same game outcome). If authorship were declarative, each party would need their own copy of the payload with their address baked in. Structural authorship lets one payload have many witnesses.
- **Makes ownership models composable.** Inscription substrates, ownable assets, and signed-event protocols all derive ownership from the BoundWitness chain — no schema-specific field plumbing.

### When a field that *looks* like authorship is actually content

Sometimes a payload legitimately has a field like `recipient`, `target`, or `delegate`. These are not authorship — they are part of the declarative content (what the actor is asserting). The test is: *would it make sense for someone other than the actor to write this field?* If yes, it's content. If no, it's authorship and belongs on the BoundWitness.

```ts
// Content — recipient is a fact the actor is declaring
{ schema: 'network.xyo.transfer', to: '0xRecipient...', amount: 100 }

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
Imperative composition (`create` → `register` → `attach`) is fine for testing and prototyping. For production, declare the module tree in a manifest for reproducibility and configuration management.

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
The `previous_hashes` array creates a tamper-evident, per-signer chain of bound witnesses. Don't use throwaway accounts where continuity matters — reuse the same account to build a meaningful chain.

### Multi-Party Signing
A bound witness with multiple signers proves that all parties agreed on the same data. For a game like Rock Paper Scissors, this is valuable: both players and a game arbiter can co-sign the outcome.

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
