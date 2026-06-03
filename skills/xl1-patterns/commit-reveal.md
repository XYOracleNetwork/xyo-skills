# Commit-Reveal Primitive

Read this pattern when building any feature where multiple parties make simultaneous, independent decisions and seeing another party's choice first would be unfair. Classic examples: Rock Paper Scissors, sealed-bid auctions, simultaneous voting, prediction markets.

**Builds on:**
- [Protocol Primitives](../xyo-knowledge/primitives.md) — payloads, PayloadBuilder, BoundWitnessBuilder, hashing
- [Identity & Signing](../xyo-knowledge/identity.md) — Account for signing commits and reveals
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `addPayloadsToChain` for on-chain recording via the wallet
- [Development on XL1](../xl1-knowledge/development.md) — Zod-first type pattern

---

## The Problem

When two players both need to choose "rock", "paper", or "scissors" simultaneously, a naive on-chain approach fails: the first player's move is visible on-chain before the second player submits. The second player can simply read it and always win.

**Commit-reveal** solves this by splitting the decision into two phases:

1. **Commit** — each party submits `hash(choice + salt)`, hiding their actual choice
2. **Reveal** — each party submits their actual `choice + salt`, which is verified against the commit

Neither party can change their choice after committing (the hash locks it in), and neither can see the other's choice until both have revealed.

---

## Schema Design

Define four schemas: the commit payload, the reveal payload, and their corresponding Zod types.

```ts
import { asSchema } from '@xyo-network/sdk-js'
import { zodIsFactory, zodAsFactory, zodToFactory } from '@xylabs/sdk-js'
import { z } from 'zod'

// --- Commit ---

export const CommitSchema = asSchema('com.example.rps.commit', true)

export const CommitPayloadZod = z.object({
  schema: z.literal('com.example.rps.commit'),
  /** Identifies the game/market/session this commit belongs to */
  topic: z.string(),
  /** hash(choice + salt) — the hidden commitment */
  commitment: z.string(),
})

export type CommitPayload = z.infer<typeof CommitPayloadZod>
export const isCommitPayload = zodIsFactory(CommitPayloadZod)
export const asCommitPayload = zodAsFactory(CommitPayloadZod, 'asCommitPayload')
export const toCommitPayload = zodToFactory(CommitPayloadZod, 'toCommitPayload')

// --- Reveal ---

export const RevealSchema = asSchema('com.example.rps.reveal', true)

export const RevealPayloadZod = z.object({
  schema: z.literal('com.example.rps.reveal'),
  /** Must match the commit's topic */
  topic: z.string(),
  /** The actual choice that was committed */
  choice: z.string(),
  /** The random salt used in the commitment hash */
  salt: z.string(),
})

export type RevealPayload = z.infer<typeof RevealPayloadZod>
export const isRevealPayload = zodIsFactory(RevealPayloadZod)
export const asRevealPayload = zodAsFactory(RevealPayloadZod, 'asRevealPayload')
export const toRevealPayload = zodToFactory(RevealPayloadZod, 'toRevealPayload')
```

**Naming note:** The protocol does not ship canonical `commit` / `reveal` schemas — each application names its own under its reverse-DNS namespace (e.g. `com.acme.auction.commit`, `com.partner.market.reveal`). This document uses `com.example.rps.*` as a placeholder; replace the namespace when adapting the pattern. See [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming) for the namespace tiers — application schemas MUST NOT be published under `network.xyo.*`.

> The `asCommitPayload(... .build(), true)` pattern used throughout this file narrows `PayloadBuilder.build()`'s result to the specific Zod-inferred type at runtime. See [PayloadBuilder — Narrowing the built payload](../xyo-knowledge/primitives.md#payloadbuilder) for the full rationale.

---

## Phase 1: Commit

The committing party generates a random salt, computes the commitment hash, and submits it on-chain.

### Generating the Commitment

```ts
import { PayloadBuilder } from '@xyo-network/sdk-js'

/**
 * Create a commitment hash from a choice and salt.
 * Uses PayloadBuilder.dataHash for deterministic, reproducible hashing.
 */
async function createCommitment(choice: string, salt: string): Promise<string> {
  // Hash a canonical payload so the hash is reproducible during verification
  const preimage = new PayloadBuilder({ schema: RevealSchema })
    .fields({ topic: '', choice, salt })
    .build()
  return await PayloadBuilder.dataHash(preimage)
}

/**
 * Generate a cryptographically random salt.
 * Note: crypto.getRandomValues is the correct native API here —
 * the SDK does not wrap generic random value generation.
 */
function generateSalt(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
```

### Datalake Setup

The functions below use a `datalakeRunner` to persist payloads independently of the wallet. Create it once and share across your application. See [Gateway — Accessing the Datalake](../xl1-knowledge/gateway.md#accessing-the-datalake) for full details.

```ts
import { createRestDataLakeRunner } from '@xyo-network/xl1-sdk'

const datalakeRunner = await createRestDataLakeRunner('https://api.archivist.xyo.network/dataLake')
```

### Submitting the Commit

```ts
async function submitCommit(
  gateway: XyoGatewayRunner,
  topic: string,
  choice: string,
): Promise<{ txHash: Hash; salt: string }> {
  const salt = generateSalt()
  const commitment = await createCommitment(choice, salt)

  const commitPayload: CommitPayload = asCommitPayload(
    new PayloadBuilder({ schema: CommitSchema })
      .fields({ topic, commitment })
      .build(),
    true,
  )

  // Insert into the dApp's datalake first — the wallet does not do this automatically.
  await datalakeRunner.insert([commitPayload])

  const [txHash] = await gateway.addPayloadsToChain([], [commitPayload])

  // CRITICAL: The salt must be stored locally and kept secret until reveal.
  // If the salt is lost, the commit cannot be revealed.
  return { txHash, salt }
}
```

**Security invariant:** The `salt` and `choice` must never be submitted on-chain during the commit phase. Persist them locally using a `StorageArchivist` with `type: 'local'` and a namespace scoped to the application (e.g., `'my-dapp-secrets'`). This gives you archivist-interface access (`insert`, `get`) with built-in namespace isolation and cross-tab sync. If the user closes the browser, the salt survives in localStorage and can be retrieved for the reveal phase. See [Module System — Browser Archivist Selection](../xyo-knowledge/modules.md) for setup.

```ts
import { StorageArchivist, StorageArchivistConfigSchema } from '@xyo-network/archivist-storage'
import { PayloadBuilder } from '@xyo-network/sdk-js'

const secretStore = await StorageArchivist.create({
  account: 'random',
  config: {
    schema: StorageArchivistConfigSchema,
    type: 'local',
    namespace: 'my-dapp-secrets',
  },
})

// After commit — persist salt as a payload
const saltPayload = new PayloadBuilder({ schema: 'com.example.rps.commit.salt' })
  .fields({ topic, salt, choice })
  .build()
await secretStore.insert([saltPayload])

// Before reveal — retrieve the salt
const [stored] = await secretStore.get([await PayloadBuilder.dataHash(saltPayload)])
```

**Datalake note:** The browser wallet does not persist off-chain payloads to the datalake. The dApp must insert the commit payload into the datalake before submitting the transaction — otherwise the commit data is lost and only the hash reference remains on-chain. See [In-Page Data Lakes](in-page-datalakes.md) for the full pattern.

---

## Phase 2: Reveal

After all parties have committed, each party reveals their choice and salt. The reveal is verified against the stored commit.

### Submitting the Reveal

```ts
async function submitReveal(
  gateway: XyoGatewayRunner,
  topic: string,
  choice: string,
  salt: string,
): Promise<Hash> {
  const revealPayload: RevealPayload = asRevealPayload(
    new PayloadBuilder({ schema: RevealSchema })
      .fields({ topic, choice, salt })
      .build(),
    true,
  )

  await datalakeRunner.insert([revealPayload])
  const [txHash] = await gateway.addPayloadsToChain([], [revealPayload])
  return txHash
}
```

### Verifying a Reveal Against Its Commit

```ts
async function verifyReveal(
  commit: CommitPayload,
  reveal: RevealPayload,
): Promise<boolean> {
  if (commit.topic !== reveal.topic) return false

  // Recompute the commitment from the revealed values
  const expected = await createCommitment(reveal.choice, reveal.salt)
  return expected === commit.commitment
}
```

The verification is deterministic because `PayloadBuilder.dataHash` produces the same hash for the same input. No signing keys are needed — the hash itself is the proof.

---

## Lifecycle State Machine

A commit-reveal session moves through these states:

```
OPEN ──► COMMITTED ──► REVEALING ──► REVEALED ──► SETTLED
  │         │              │             │
  │         ▼              ▼             ▼
  │      (waiting for   (waiting for  (all reveals
  │       all commits)   all reveals)  verified)
  │
  └──► EXPIRED (deadline passed without all commits)
```

### Tracking State

Use a `topic` field to group commits and reveals into a session. The application determines when transitions occur:

| Transition | Condition |
|------------|-----------|
| OPEN → COMMITTED | All expected parties have submitted commits |
| COMMITTED → REVEALING | Application signals that commit phase is closed |
| REVEALING → REVEALED | All committed parties have submitted valid reveals |
| REVEALED → SETTLED | Application logic determines outcome from revealed choices |
| Any → EXPIRED | Deadline block reached without required actions |

---

## Validity Windows (nbf / exp)

Commit-reveal requires both phases to complete. Each phase needs an absolute window so the chain can decide when commits are still accepted, when reveals are open, and when the session has expired.

XL1 already standardizes this convention on `TransactionBoundWitness` itself — `nbf` (not-before, inclusive) and `exp` (expiration, exclusive), both `XL1BlockNumber`. Reuse the same field names and the same `BlockDurationZod` shape on commit-reveal session schemas:

```ts
import { BlockDurationZod, type XL1BlockNumber } from '@xyo-network/xl1-sdk'

export const SessionPayloadZod = z.object({
  schema: z.literal('com.example.rps.session'),
  sessionId: z.string(),
  /** Commit window — commits must arrive while current block ∈ [commit.nbf, commit.exp) */
  commit: BlockDurationZod,
  /** Reveal window — must satisfy reveal.nbf >= commit.exp */
  reveal: BlockDurationZod,
})
```

`BlockDurationZod` enforces three structural invariants (matching `TransactionDurationValidator`):

1. `nbf >= 0` and `exp >= 0`
2. `exp > nbf` (strictly — zero-length windows are invalid)
3. `exp - nbf <= 10000` (max session lifetime, mirroring transaction lifetime cap)

The protocol deliberately does **not** compare `nbf`/`exp` against the current block at structural-validation time — *the consumer is responsible for the "is now within window" check at the point of use* (commit submission, reveal submission, settlement). This matches how `TransactionBoundWitness` handles its own validity window.

```ts
async function windowState(
  gateway: XyoGateway | XyoGatewayRunner,
  window: { nbf: XL1BlockNumber; exp: XL1BlockNumber },
): Promise<'pending' | 'active' | 'expired'> {
  const viewer = gateway.connection.viewer
  if (!viewer) throw new Error('Gateway has no viewer attached')
  const current = Number(await viewer.block.currentBlockNumber())
  if (current < window.nbf) return 'pending'
  if (current >= window.exp) return 'expired'
  return 'active'
}
```

**What happens on expiration:**
- If a party fails to **commit** by `commit.exp`: they did not participate.
- If a party fails to **reveal** by `reveal.exp`: their commit is unrevealed. For game-theoretic / symmetric markets, treat unrevealed commits as forfeit and redistribute any stake to revealers. For atomic-exchange settlement, the session simply does not settle — see [Atomic Exchange](atomic-exchange.md).

**Anti-pattern — client-side processing buffer.** Do not pad the deadline check with an arbitrary client-side cushion (e.g. "treat expired as `current >= exp - 5`"). The protocol's structural validators have no buffer concept; tolerance is a chain-consensus concern, not a client one. A buffer added unilaterally by one client diverges from what every other consumer sees.

---

## Binding Commits to Identity

The commit transaction is signed by the committer's wallet account via `addPayloadsToChain`. The signer's address appears in the transaction's BoundWitness `addresses` array. This binds the commit to a specific identity without requiring any additional signature logic.

To verify who made a commit:

```ts
function getCommitter(tx: SignedHydratedTransactionWithHashMeta): Address {
  const [bw] = tx
  // The 'from' field on the TransactionBoundWitness identifies the sender
  return bw.from
}
```

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Do This Instead |
|--------------|-------------|-----------------|
| Storing salt on-chain during commit | Anyone can read it and compute the choice | Keep salt local until reveal phase |
| Using predictable salts (timestamp, counter) | Attacker can brute-force the choice | Use `crypto.getRandomValues` for 32+ bytes |
| Skipping the commit phase for "trusted" parties | Removes fairness guarantees entirely | Always use commit-reveal when order matters |
| Hashing choice without salt | Attacker can precompute hashes for all possible choices | Always include a random salt in the hash |
| Allowing reveals before all commits are in | Late committers can see early reveals | Enforce commit deadline before opening reveal phase |
