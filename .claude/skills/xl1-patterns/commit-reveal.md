# Commit-Reveal Primitive

Read this pattern when building any feature where multiple parties make simultaneous, independent decisions and seeing another party's choice first would be unfair. Classic examples: Rock Paper Scissors, sealed-bid auctions, simultaneous voting, prediction markets.

**Builds on:**
- [Protocol Primitives](../xyo-knowledge/primitives.md) — payloads, PayloadBuilder, BoundWitnessBuilder, hashing
- [Identity & Signing](../xyo-knowledge/identity.md) — Account for signing commits and reveals
- [Browser Wallet](../xl1-knowledge/wallet.md) — `addPayloadsToChain` for on-chain recording
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

export const CommitSchema = asSchema('network.xyo.commit', true)

export const CommitPayloadZod = z.object({
  schema: z.literal('network.xyo.commit'),
  /** Identifies the game/market/session this commit belongs to */
  topic: z.string(),
  /** hash(choice + salt) — the hidden commitment */
  commitment: z.string(),
  /** Block number when this commit was recorded */
  commitBlock: z.number().int(),
})

export type CommitPayload = z.infer<typeof CommitPayloadZod>
export const isCommitPayload = zodIsFactory(CommitPayloadZod)
export const asCommitPayload = zodAsFactory(CommitPayloadZod, 'asCommitPayload')
export const toCommitPayload = zodToFactory(CommitPayloadZod, 'toCommitPayload')

// --- Reveal ---

export const RevealSchema = asSchema('network.xyo.reveal', true)

export const RevealPayloadZod = z.object({
  schema: z.literal('network.xyo.reveal'),
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

**Naming note:** These schemas use the generic `network.xyo.commit` / `network.xyo.reveal` namespace. For application-specific commits, use your app's namespace (e.g., `network.xyo.rps.commit`).

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
 */
function generateSalt(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
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

  const currentBlock = await rpc.call('blockViewer_currentBlockNumber', [])

  const commitPayload = new PayloadBuilder({ schema: CommitSchema })
    .fields({
      topic,
      commitment,
      commitBlock: currentBlock,
    })
    .build()

  const [txHash] = await gateway.addPayloadsToChain([], [commitPayload])

  // CRITICAL: The salt must be stored locally and kept secret until reveal.
  // If the salt is lost, the commit cannot be revealed.
  return { txHash, salt }
}
```

**Security invariant:** The `salt` and `choice` must never be submitted on-chain during the commit phase. Store them locally (e.g., `localStorage`, React state, or in-memory). If the user closes the browser, they lose the ability to reveal — this is an acceptable trade-off for trustlessness. Applications that need durability should persist the salt to encrypted local storage.

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
  const revealPayload = new PayloadBuilder({ schema: RevealSchema })
    .fields({ topic, choice, salt })
    .build()

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

## Timeout Handling

Commit-reveal requires both phases to complete. If a party commits but never reveals, the protocol stalls. Handle this with block-based deadlines:

```ts
interface CommitRevealConfig {
  /** Block number by which all commits must be submitted */
  commitDeadline: number
  /** Block number by which all reveals must be submitted */
  revealDeadline: number
}

async function checkDeadline(
  rpc: RpcClient,
  deadline: number,
): Promise<'active' | 'expired'> {
  const current = await rpc.call('blockViewer_currentBlockNumber', [])
  return current >= deadline ? 'expired' : 'active'
}
```

**What happens on timeout:**
- If a party fails to **commit** by the deadline: they forfeit (did not participate)
- If a party fails to **reveal** by the deadline: they forfeit (assumed to be hiding a losing choice). Any staked tokens can be redistributed to parties who did reveal.

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
