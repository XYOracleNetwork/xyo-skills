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

1. **Commit** — each party submits `hash(committer + topic + choice + salt)`, hiding their actual choice
2. **Reveal** — each party submits their actual `choice + salt` from the same account, which is verified against the commit

Neither party can change their choice after committing (the hash locks it in), and neither can see the other's choice until both have revealed. Binding the committer and topic into the hash stops a copycat from committing someone else's commitment and replaying their reveal — see [Binding Commits to Identity](#binding-commits-to-identity).

---

## Schema Design

These are illustrative **new application** contracts: open objects, supported
effective version `1.0.0` through `PayloadZodLooseOfSchema`, and root hashes for
references/commitments. See [Payload Schema Evolution and Identity](../xyo-knowledge/payload-schema-evolution.md).
Do not change a deployed application's preimages, names, or hash algorithm without
an explicit migration. Preserve the agreed omission/metadata representation when
recreating a commitment; do not hash a stripped or default-injected substitute.

Define two payload identifiers, one for commits and one for reveals, with corresponding version-aware Zod definitions.

```ts
import { asSchema, PayloadZodLooseOfSchema } from '@xyo-network/sdk'
import { zodIsFactory, zodAsFactory, zodToFactory } from '@ariestools/sdk'
import { z } from 'zod/mini'

// --- Commit ---

export const CommitSchema = asSchema('com.example.rps.commit', true)

export const CommitPayloadZod = z.extend(PayloadZodLooseOfSchema(CommitSchema), {
  /** Identifies the game/market/session this commit belongs to */
  topic: z.string(),
  /** hash(committer + topic + choice + salt) — the hidden commitment */
  commitment: z.string(),
})

export type CommitPayload = z.infer<typeof CommitPayloadZod>
export const isCommitPayload = zodIsFactory(CommitPayloadZod)
export const asCommitPayload = zodAsFactory(CommitPayloadZod, 'asCommitPayload')
export const toCommitPayload = zodToFactory(CommitPayloadZod, 'toCommitPayload')

// --- Reveal ---

export const RevealSchema = asSchema('com.example.rps.reveal', true)

export const RevealPayloadZod = z.extend(PayloadZodLooseOfSchema(RevealSchema), {
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

The preimage binds the committer's address and the session `topic` along with the choice and salt. The committer is the commit transaction's signer — the same address a verifier later reads from the transaction's `from` — so neither the commit nor the reveal payload carries an address. The preimage is built locally on both sides and never submitted; its `committer` field exists only inside the hash.

```ts
import { asSchema, PayloadBuilder } from '@xyo-network/sdk'
import type { XyoAddress } from '@xyo-network/sdk'

/** Local-only schema for the hashed preimage — never submitted on-chain */
const CommitmentPreimageSchema = asSchema('com.example.rps.commit.preimage', true)

interface CommitmentInput {
  /** The commit transaction's signer (`tx.from`) — never read from a payload field */
  committer: XyoAddress
  /** The session this commitment is valid in */
  topic: string
  choice: string
  salt: string
}

/**
 * Create a commitment hash that binds the committer, topic, choice, and salt.
 * Uses PayloadBuilder.hash (root hash) for deterministic, reproducible hashing.
 */
async function createCommitment({
  committer, topic, choice, salt,
}: CommitmentInput): Promise<string> {
  // Hash a canonical payload so the hash is reproducible during verification.
  // Binding the committer means a copied commitment never verifies for another
  // account; binding the topic means it never verifies in another session.
  const preimage = new PayloadBuilder({ schema: CommitmentPreimageSchema })
    .fields({
      committer, topic, choice, salt,
    })
    .build()
  return await PayloadBuilder.hash(preimage)
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

The functions below use a `datalakeRunner` to persist payloads independently of the wallet, and a `datalakeViewer` on the same endpoint to read them back by hash — commits and reveals are off-chain, so no gateway read returns them. Create both once and share across your application. See [Gateway — Accessing the Datalake](../xl1-knowledge/gateway.md#accessing-the-datalake) for full details.

```ts
import {
  createRestDataLakeRunner, createRestDataLakeViewer, NetworkDataLakeUrls,
} from '@xyo-network/xl1-sdk'

// The dApp's own datalake: its configured endpoint (env var / config), defaulting to the network's
const DATALAKE_ENDPOINT = appConfig.dataLakeEndpoint ?? NetworkDataLakeUrls[networkId]
const datalakeRunner = await createRestDataLakeRunner(DATALAKE_ENDPOINT)
const datalakeViewer = await createRestDataLakeViewer(DATALAKE_ENDPOINT)
```

### Submitting the Commit

```ts
async function submitCommit(
  gateway: XyoGatewayRunner,
  topic: string,
  choice: string,
): Promise<{ txHash: Hash; salt: string }> {
  const salt = generateSalt()
  // The account that will sign the commit transaction — bound into the preimage
  const committer = await gateway.signer.address()
  const commitment = await createCommitment({
    committer, topic, choice, salt,
  })

  const commitPayload: CommitPayload = asCommitPayload(
    new PayloadBuilder({ schema: CommitSchema })
      .fields({ topic, commitment })
      .build(),
    true,
  )

  // Insert into the dApp's datalake first — the wallet does not do this automatically.
  await datalakeRunner.insert([commitPayload])

  // `from` asserts the transaction is signed by the address bound into the preimage
  const [txHash] = await gateway.addPayloadsToChain([], [commitPayload], { from: committer })

  // CRITICAL: The salt must be stored locally and kept secret until reveal.
  // If the salt is lost, the commit cannot be revealed.
  return { txHash, salt }
}
```

**Security invariant:** The `salt` and `choice` must never be submitted on-chain during the commit phase. Persist them locally using a `StorageArchivist` with `type: 'local'` and a namespace scoped to the application and the session's `(topic, committer)` (e.g., `my-dapp-secrets:${topic}:${committer}`). This gives you archivist-interface access (`insert`, `get`, `next`) with built-in namespace isolation and cross-tab sync. If the user closes the browser, the salt survives in localStorage and can be retrieved for the reveal phase. See [Module System — Browser Archivist Selection](../xyo-knowledge/modules.md) for setup.

```ts
import { StorageArchivist, StorageArchivistConfigSchema } from '@xyo-network/archivist-storage'
import { asSchema, PayloadBuilder } from '@xyo-network/sdk'

/** Local-only schema for the persisted secret — never submitted on-chain */
const CommitSaltSchema = asSchema('com.example.rps.commit.salt', true)

// The salt payload's hash depends on the salt, so it cannot be recomputed after a reload.
// Scope the store to (topic, committer) instead — that key is always recoverable.
const secretStore = await StorageArchivist.create({
  account: 'random',
  config: {
    schema: StorageArchivistConfigSchema,
    type: 'local',
    namespace: `my-dapp-secrets:${topic}:${committer}`,
  },
})

// After commit — persist salt as a payload
const saltPayload = new PayloadBuilder({ schema: CommitSaltSchema })
  .fields({ topic, salt, choice })
  .build()
await secretStore.insert([saltPayload])

// Before reveal (even after a reload) — the store's only entry is the salt
const [stored] = await secretStore.next({ limit: 1 })
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

Each signer is the `from` of the `TransactionBoundWitness` that carried the payload — see [Binding Commits to Identity](#binding-commits-to-identity) for how to read it.

```ts
import type { XyoAddress } from '@xyo-network/sdk'

async function verifyReveal(
  commit: CommitPayload,
  commitSigner: XyoAddress,
  reveal: RevealPayload,
  revealSigner: XyoAddress,
): Promise<boolean> {
  if (commit.topic !== reveal.topic) return false

  // Only the committer can reveal — a replayed reveal from another account fails here
  if (revealSigner !== commitSigner) return false

  // Recompute the commitment from the revealed values and the committer's address
  const expected = await createCommitment({
    committer: commitSigner,
    topic: reveal.topic,
    choice: reveal.choice,
    salt: reveal.salt,
  })
  return expected === commit.commitment
}
```

The verification is deterministic because `PayloadBuilder.hash` produces the same hash for the same input. The verifier needs no keys of its own: the hash proves the choice, and the transaction signatures — already checked by the chain — prove who committed and who revealed. Submit the reveal from the account that committed; a reveal signed by any other account never verifies.

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

const SessionSchema = asSchema('com.example.rps.session', true)
export const SessionPayloadZod = z.extend(PayloadZodLooseOfSchema(SessionSchema), {
  sessionId: z.string(),
  /** Commit window — commits must arrive while current block ∈ [commit.nbf, commit.exp) */
  commit: BlockDurationZod,
  /** Reveal window — must satisfy reveal.nbf >= commit.exp */
  reveal: BlockDurationZod,
})
```

Three structural invariants govern a validity window:

1. `nbf >= 0` and `exp >= 0`
2. `exp > nbf` (strictly — zero-length windows are invalid)
3. `exp - nbf <= 10000` (max session lifetime, mirroring transaction lifetime cap)

> **Where these are enforced.** `BlockDurationZod` is a plain
> `z.object({ nbf: XL1BlockNumberZod, exp: XL1BlockNumberZod })` with **no
> refinements** — parsing a window with `exp <= nbf` or an over-long span
> succeeds. Invariants 2 and 3 are enforced by `TransactionDurationValidator`
> at transaction-validation time, not by the schema. If your application
> depends on them at construction time, check them yourself.

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

The commit transaction is signed by the committer's wallet account via `addPayloadsToChain`, which sets the `TransactionBoundWitness` `from` to the signer's address; the chain rejects a transaction whose `from` is not among the BoundWitness `addresses` that signed it. That signature binds the *transaction* to an identity — not the *commitment value*, which is just a string anyone can copy into a commit transaction of their own. Without more, a copycat commits your commitment, waits for your reveal, and replays your `choice` + `salt` as theirs.

Two rules close that gap, both shown above:

1. **The preimage binds the committer and topic.** `createCommitment` hashes the signer's address and the session `topic` with the choice and salt, so a copied commitment recomputes to a different hash under the copier's address, and in any other session.
2. **Only the committer can reveal.** `verifyReveal` requires reveal-transaction signer === commit-transaction signer, and recomputes the commitment with that address.

The address is structural: read it from the transaction's `from`, never from a payload field — see [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md#declarative-payloads-structural-authorship). With transaction hashes in hand, `transaction.byHash` returns each signed transaction — its `from` and its `payload_hashes[]`. Commits and reveals are submitted off-chain, so their bodies are not in `tx[1]`: fetch each body from the datalake by a hash *that same transaction* lists, and keep it only if it hashes back to that hash. Each payload stays paired with the signer of the transaction that actually carried it:

```ts
import type { Payload, Schema, XyoAddress } from '@xyo-network/sdk'
import { isAnyPayload, PayloadBuilder } from '@xyo-network/sdk'
import type { SignedHydratedTransactionWithHashMeta } from '@xyo-network/xl1-sdk'

function signerOf(tx: SignedHydratedTransactionWithHashMeta): XyoAddress {
  const [bw] = tx
  // The 'from' field on the TransactionBoundWitness identifies the signer
  return bw.from
}

/** Off-chain bodies of `schema` that this transaction committed to, read from the datalake */
async function bodiesOf(tx: SignedHydratedTransactionWithHashMeta, schema: Schema): Promise<Payload[]> {
  const [bw] = tx
  const hashes = bw.payload_hashes.filter((_, i) => bw.payload_schemas[i] === schema)
  if (hashes.length === 0) return []
  const fetched = (await datalakeViewer.get(hashes)).filter(isAnyPayload)
  // The datalake is untrusted storage: keep only bodies whose root hash this transaction lists
  const pairs = await PayloadBuilder.hashPairs(fetched)
  return pairs.filter(([, hash]) => hashes.includes(hash)).map(([payload]) => payload)
}

const viewer = gateway.connection.viewer
if (!viewer) throw new Error('Gateway has no viewer attached')
const [commitTx, revealTx] = await Promise.all([
  viewer.transaction.byHash(commitTxHash),
  viewer.transaction.byHash(revealTxHash),
])
if (!commitTx || !revealTx) throw new Error('Transaction not found')

// Take each payload from the same transaction its signer comes from
const commit = (await bodiesOf(commitTx, CommitSchema)).find(isCommitPayload)
const reveal = (await bodiesOf(revealTx, RevealSchema)).find(isRevealPayload)
if (!commit || !reveal) throw new Error('Commit or reveal payload not found')

const isValid = await verifyReveal(commit, signerOf(commitTx), reveal, signerOf(revealTx))
```

An indexer walking blocks reads the same `from` off each `TransactionBoundWitness` (see [Chain Data Indexing — Via Block Walk](chain-data-indexing-protocol.md#via-block-walk--schema-discovery-from-the-chain)). Keep each hash paired with its own transaction's signer — **not** a `hash → signer` map. A copied commitment or replayed reveal is a byte-identical payload, so the same hash arrives in several transactions, and a map lets the copycat's transaction overwrite the honest signer:

```ts
import type { Hash } from '@ariestools/sdk'
import type { Payload, XyoAddress } from '@xyo-network/sdk'
import { isTransactionBoundWitness } from '@xyo-network/xl1-sdk'

interface SignedRef {
  hash: Hash
  /** `from` of the TransactionBoundWitness that carried this hash */
  signer: XyoAddress
}

/** Commit/reveal hashes in one block's on-chain payloads, each with its own transaction's signer */
function commitRevealRefs(blockPayloads: Payload[]): SignedRef[] {
  const refs: SignedRef[] = []
  for (const p of blockPayloads) {
    if (!isTransactionBoundWitness(p)) continue
    for (let i = 0; i < p.payload_hashes.length; i++) {
      const schema = p.payload_schemas[i]
      if (schema === CommitSchema || schema === RevealSchema) {
        refs.push({ hash: p.payload_hashes[i], signer: p.from })
      }
    }
  }
  return refs
}
```

Fetch the bodies from the datalake with `datalakeViewer.get(refs.map(r => r.hash))` — they are off-chain, so no gateway read returns them — and recompute each body's hash (`PayloadBuilder.hash`) to match it back to its refs: every ref whose `hash` matches gets that body under its own `signer`. Store each commit and reveal under `(topic, signer)`, and verify every reveal against *its own signer's* commit in that topic.

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Do This Instead |
|--------------|-------------|-----------------|
| Storing salt on-chain during commit | Anyone can read it and compute the choice | Keep salt local until reveal phase |
| Using predictable salts (timestamp, counter) | Attacker can brute-force the choice | Use `crypto.getRandomValues` for 32+ bytes |
| Skipping the commit phase for "trusted" parties | Removes fairness guarantees entirely | Always use commit-reveal when order matters |
| Hashing choice without salt | Attacker can precompute hashes for all possible choices | Always include a random salt in the hash |
| Hashing only `choice + salt`, or accepting a reveal without checking its signer | A copycat submits your commitment in their own commit transaction, then replays your revealed `choice` + `salt` as theirs; the same commitment also verifies in any other session | Bind the committer (the commit transaction's `from`) and `topic` into the preimage; require reveal-transaction `from` === commit-transaction `from`. Never add a `from`/`committer` field to the commit or reveal payload — anyone can write any address there |
| Allowing reveals before all commits are in | Late committers can see early reveals | Enforce commit deadline before opening reveal phase |
