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
- **Datalake access:** `RestDataLakeRunner` and `RestDataLakeViewer` implement the archivist HTTP contract (request format, pagination, schema filtering). Raw `fetch()` to the same endpoint may not match the expected request shape.
- **RPC calls:** The gateway from `useProvidedGateway()` is the correct RPC client. Using a generic `rpc` variable or raw `fetch` to `/rpc` loses type safety and provenance — you can't tell which gateway (wallet vs. in-page) is being called.
- **Payload construction:** `PayloadBuilder` manages schema validation and meta field conventions. Raw object literals (`{ schema: '...', field: value }`) skip this and may produce invalid payloads.
- **BoundWitness construction:** `BoundWitnessBuilder` computes parallel arrays (`addresses`, `payload_hashes`, `payload_schemas`, `previous_hashes`, `$signatures`) and maintains chain continuity. Manual construction risks breaking these invariants.

### Anti-pattern table

| Anti-Pattern | Protocol Risk | Use Instead |
|---|---|---|
| `crypto.subtle.digest` on `JSON.stringify(payload)` | Hash won't match canonical protocol hash | `PayloadBuilder.dataHash(payload)` |
| Raw `fetch()` to datalake endpoint | May not match archivist HTTP contract | `RestDataLakeRunner` / `RestDataLakeViewer` from `@xyo-network/xl1-sdk` |
| Calling `gateway.call('namespace_method', [...])` | `XyoGateway`/`XyoGatewayRunner` has no `.call()` — that string is the JSON-RPC *wire* method, not a TS API | `defaultGateway.connection.viewer?.<sub-viewer>.<method>(...)` (e.g. `connection.viewer.block.currentBlockNumber()`) |
| Manual BoundWitness field construction | Parallel array invariants easily broken | `BoundWitnessBuilder` |
| Raw object literal `{ schema: '...', field: val }` | Skips meta field management and validation | `PayloadBuilder` |

### When native constructs are acceptable

Use native APIs only when the SDK genuinely has no alternative:

- **`crypto.getRandomValues()`** — for cryptographic randomness (salts, nonces). The SDK doesn't wrap generic random value generation.
- **`crypto.randomUUID()`** — for generating unique identifiers. No SDK equivalent.
- **`localStorage` / `sessionStorage`** — only for non-payload data (e.g., UI preferences, feature flags) where the archivist interface adds no value. For payload storage, use an SDK browser archivist instead — see [Module System — Browser Archivist Selection](modules.md).

For payload persistence in the browser, the SDK provides three archivist implementations — `IndexedDbArchivist`, `StorageArchivist`, and `MemoryArchivist` — that share the standard archivist interface with built-in deduplication, events, and pagination. Prefer these over raw `localStorage` for payload data.

When using a native construct, add a brief comment noting why the SDK doesn't cover this case, so future readers don't mistake it for an oversight.

---

## Schema Naming

Schemas are the primary mechanism for type discrimination in XYO. Choose them carefully.

### Convention
- Use reverse domain notation: `network.xyo.*` for XYO system schemas, `com.yourorg.*` for custom
- Lowercase only, dot-separated, alphanumeric: validated by `/^(?:[a-z0-9]+\.)*[a-z0-9]+$/`
- Be specific and hierarchical: `network.xyo.rps.move` not `network.xyo.data`

### Examples

```ts
// System schemas (reserved)
'network.xyo.boundwitness'
'network.xyo.payload'
'network.xyo.payload.bundle'
'network.xyo.node.manifest'

// Application schemas
'network.xyo.rps.move'           // A player's move
'network.xyo.rps.game'           // Game state
'network.xyo.rps.result'         // Game outcome
```

### Schema as Type Identity

Schemas drive TypeScript type narrowing via `isPayloadOfSchemaType<T>()`. A well-chosen schema hierarchy makes payload filtering and discrimination ergonomic:

```ts
const isMovePayload = isPayloadOfSchemaType<MovePayload>('network.xyo.rps.move')
const moves = allPayloads.filter(isMovePayload)
```

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
const payload = { schema: 'network.xyo.rps.move', move: 'rock' }
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
