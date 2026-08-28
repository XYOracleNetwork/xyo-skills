# Statement Graph

Read this pattern when your application needs a **replayable, source-attributed relationship / assertion graph on XL1** — bindings, grants, approvals, membership, reciprocal edges, and similar signed claims — with a **closed lifecycle** and **open product vocabulary**.

This is an **application-layer substrate**, not part of core XL1 consensus. Peer of [Inscription Substrate](inscription-substrate.md): inscriptions own transferable content artifacts; Statement Graph records signed assertions about objects.

**Builds on:**
- [Chain Data Indexing](chain-data-indexing-protocol.md) — finalized-only replay, schema filtering
- [Finalized block streams](../xl1-knowledge/gateway.md#finalized-block-stream) — ordered gap-aware delivery for indexers
- [Datalakes](../xl1-knowledge/datalakes.md) — object bodies referenced by hash
- [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md) — authorship on the BoundWitness, not invented payload `from` fields

**Used by:** LifeHash, Event Kit wake grants, Edge Node statement views, Webble, Immortalizer. For wallet-authenticated wake delivery on top of grants, see [Authenticated Wake Delivery](authenticated-wake-delivery.md).

**Maturity:** packages at `@xyo-network/xl1-statement-graph-*` **0.4.x** (protocol v2), currently **restricted** npm while the repo is private. Prefer importing published packages over copying fold logic.

---

## The Problem

Products need shared rules for “who asserted what about which content-addressed object,” with multi-indexer convergence. Ad-hoc claim/revoke tables and timestamp ordering disagree under reorgs and multi-hash transactions.

Statement Graph fixes a **single append-only claim verb**, fans hashes into independent `(source, objectHash)` records, and mandates a **proscriptive total order**. Domain meaning (ownership LWW, grant liveness, retraction) lives in **product lexicons and views**, not in the fold.

---

## Concepts

### Closed lifecycle, open vocabulary

- **One event schema:** `network.xyo.statement.claim` (unversioned — not `.v1`).
- **Fields:** `{ source, hashes }` — `source` is the asserting address; `hashes` is 1–`MAX_CLAIM_HASHES` (**256**) unique object dataHashes.
- **No revoke verb, no event-level `target`, no record `state`.** Withdrawal / negation / supersession are ordinary vocabulary payloads that are also claimed; views interpret them.
- **Aboutness** (peer, publisher, subject, …) lives **inside object bodies**, never as positional roles in `hashes[]`. Array index is only `hashIndex` for ordering.

### Existing hash contract

Statement Graph's `hashes[]` currently contains **object data hashes**, as required
by its shipped builders/fold. Preserve that protocol contract and its unversioned
schema; do not substitute root hashes or a `.v2` suffix. A data hash does not bind
`$version`. Version-dependent product decisions must verify a root-hash-bound
representation or use independently trusted fixed rules. New generic application
identities/references default to root hashes; migrating SG needs coordinated
builder/fold/consumer changes and historical replay verification.

### Fold materializes claims; views add meaning

```
objects (vocabulary payloads) + claim event
  → co-committed on XL1 (source in tx signer set; each hash in same tx)
  → monotone fold → ClaimRecord + AppliedEventRecord stream
  → product views (grants, bindings, LWW, …)
```

`ClaimRecord` is keyed by `(source, objectHash)` and has **no state**. Clocks `firstBlock` / `firstEventHash` freeze at first materialization; `lastBlock` advances when the key is touched again.

### Ordering authority

Views **must** order with `(block, tx, event, hashIndex)` via protocol helpers (`compareAppliedPrecedence`, `indexAppliedByReferencedHash`). Do **not** order by wall-clock time, content-hash ties, or `ClaimRecord` clocks alone.

`STATEMENT_FOLD_VERSION = 2`. v1 claim/revoke checkpoints fail closed — rescan from floor.

---

## Packages

| Package | Role |
|---------|------|
| `@xyo-network/xl1-statement-graph-schemas` | Grammar, records, `ClaimSchema`, `MAX_CLAIM_HASHES`, fold version |
| `@xyo-network/xl1-statement-graph-protocol` | Gates, fold, precedence helpers (pure) |
| `@xyo-network/xl1-statement-graph-sdk` | `buildClaim`, `publishStatements`, scan, checkpoints |
| `@xyo-network/xl1-statement-graph-engine` / `-engine-actor` | Incremental state, viewers, actor hosts |
| `@xyo-network/xl1-statement-graph-testing` | Fakes and acceptance scenarios |

Import NSIDs and builders from these packages — do not invent parallel claim schemas.

---

## Pattern Overview

1. Define **vocabulary object schemas** under your product namespace (`network.xyo.<product>.*` or `com.<org>.*` per [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming)).
2. Insert object bodies to a datalake; obtain dataHashes.
3. `buildClaim({ source, hashes })` then `publishStatements(...)` so objects and claim are co-committed with correct signers.
4. Indexer folds finalized applied events; product views derive live meaning.
5. Prefer **bounded validity** (`notBefore` / `expires`) on vocabulary when possible; use small public negation envelopes when withdrawal is required (fail closed on unresolved negation).

---

## Write path (SDK)

```ts
import { buildClaim, publishStatements } from '@xyo-network/xl1-statement-graph-sdk'

const event = buildClaim({
  source: identity.address,
  hashes: [objectHashA, objectHashB],
})

await publishStatements(
  broadcaster, // typically gateway addPayloadsToChain-shaped
  store,       // datalake the indexer can resolve
  [{ event, objects: [objectPayloadA, objectPayloadB] }],
  { signers: [identity.address] },
)
```

Gate expectations (enforced at write/fold): `source` must be among the transaction signers; each hash must be co-committed in the same transaction.

---

## When to use / not use

**Use when** you need signed, independently replayable relationship data shared across indexers (identity graphs, capability grants, presence/succession, stewardship edges).

**Do not use when:**
- You need **owned transferable artifacts** → [Inscription Substrate](inscription-substrate.md) / [XRC-20](fungible-tokens.md).
- You need a **dedicated append-only application event family** that is not a relationship graph (e.g. match settlements) — keep a product-specific event schema; still reuse finalized ordering discipline.
- You expect the substrate to implement **authz / exclusivity / global truth** — those are view policies or other patterns.

---

## Anti-patterns

| Don't | Do |
|-------|-----|
| Reintroduce `revoke` / `target` / record `state` | Claim lexicon negation or expiry objects; interpret in views |
| Put roles in `hashes[]` position | Put aboutness fields on vocabulary objects |
| Order views by timestamps or `firstBlock` alone | Use `(block, tx, event, hashIndex)` precedence helpers |
| Strip `$version` then treat the copy as an original version-1 payload | Verify the original hash/version policy first; if the shipped parser needs a body projection, retain provenance and project only after those checks |
| Dual-read v1 claim/revoke with v2 | Protocol v2 only; bump checkpoints / fold version |
| Copy fold code into the product | Depend on `xl1-statement-graph-*` packages |

---

## Cross-references

- [Authenticated Wake Delivery](authenticated-wake-delivery.md) — Event Kit grants on this substrate
- [XL1 dApp Kit](../xl1-dapp-kit/SKILL.md) — hosts that consume wakes / projections
- Upstream docs: `XYOracleNetwork/xl1-statement-graph` (`WHITEPAPER.md`, `docs/PROTOCOL_V2_REDESIGN.md`)
