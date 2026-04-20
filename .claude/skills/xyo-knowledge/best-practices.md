# Protocol Best Practices

## Barrel Package Imports

Use barrel (aggregate) packages rather than importing from granular sub-packages. This follows the general principle from [Layer 1](../development/typescript.md) and enables tree shaking.

### XYO Barrel Package Hierarchy

```
@xyo-network/sdk-js              ← Top-level: re-exports everything
├── @xyo-network/protocol        ← All protocol types and builders
│   ├── @xyo-network/payload         (payload-model, payload-builder, payload-validator, payload-wrapper, huri)
│   ├── @xyo-network/boundwitness    (boundwitness-model, boundwitness-builder, boundwitness-validator, boundwitness-wrapper)
│   ├── @xyo-network/crypto          (account, account-model, wallet, wallet-model, elliptic, key-model)
│   └── @xyo-network/core            (hash, data, object, wasm)
├── @xyo-network/modules         ← All module implementations
│   ├── @xyo-network/archivist
│   ├── @xyo-network/diviner
│   ├── @xyo-network/witness
│   ├── @xyo-network/sentinel
│   ├── @xyo-network/node
│   ├── @xyo-network/bridge
│   └── @xyo-network/module
├── @xyo-network/manifest
├── @xyo-network/core-payload-plugins
└── @xyo-network/sdk-utils
```

**Import from the highest barrel that contains what you need:**

```ts
// Good — barrel imports
import { Payload, PayloadBuilder, asSchema } from '@xyo-network/payload'
import { BoundWitnessBuilder } from '@xyo-network/boundwitness'
import { Account } from '@xyo-network/crypto'
import { MemoryArchivist } from '@xyo-network/archivist'

// Avoid — granular sub-packages
import { Payload } from '@xyo-network/payload-model'
import { PayloadBuilder } from '@xyo-network/payload-builder'
import { Account } from '@xyo-network/account'
```

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
