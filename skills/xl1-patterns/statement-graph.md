# Statement Graph

Read this pattern when your application needs a **replayable, source-attributed relationship / assertion graph on XL1** — bindings, grants, approvals, membership, reciprocal edges, and similar signed claims — with a **closed lifecycle** and **open product vocabulary**.

This is an **application-layer substrate**, not part of core XL1 consensus. Peer of [Inscription Substrate](inscription-substrate.md): inscriptions own transferable content artifacts; Statement Graph records signed assertions about objects.

**Builds on:**
- [Chain Data Indexing](chain-data-indexing-protocol.md) — finalized-only replay, schema filtering
- [Finalized block streams](../xl1-knowledge/gateway.md#finalized-block-stream) — ordered gap-aware delivery for indexers
- [Datalakes](../xl1-knowledge/datalakes.md) — object bodies referenced by hash
- [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md) — authorship on the BoundWitness, not invented payload `from` fields

**Used by:** LifeHash, Event Kit wake grants, Edge Node statement views, Webble, Immortalizer. For wallet-authenticated wake delivery on top of grants, see [Authenticated Wake Delivery](authenticated-wake-delivery.md).

**Maturity:** the six `@xyo-network/xl1-statement-graph-*` packages publish publicly to npm under LGPL-3.0-only and share one version; the **0.5.x** line carries the current fold. Prefer importing published packages over copying fold logic. Publishing Claims needs a chain whose consensus accepts the unversioned `{ source, subject, hashes }` Claim as an elevated payload. The upstream repo proves that path on a local dev chain, which is not Sequence or Mainnet qualification — confirm the target network's rollout before publishing there.

---

## The Problem

Products need shared rules for “who asserted what, about which subject, over which content-addressed object,” with multi-indexer convergence. Ad-hoc claim/revoke tables and timestamp ordering disagree under reorgs and multi-hash transactions.

Statement Graph fixes a **single append-only claim verb**, fans hashes into independent `(source, subject, objectHash)` records, and mandates a **proscriptive total order**. Domain meaning (ownership LWW, grant liveness, retraction) lives in **product lexicons and views**, not in the fold.

---

## Concepts

### Closed lifecycle, open vocabulary

- **One event schema:** `network.xyo.statement.claim` (unversioned — not `.v1`). Import `ClaimSchema`; never retype the NSID.
- **Fields:** `{ source, subject, hashes }`, all required. `source` is the asserting address. `subject` is an XYO address or a content hash — the thing the Claim is about. `hashes` is 1–`MAX_CLAIM_HASHES` (**256**) unique object data hashes; a duplicate makes the whole event malformed.
- **Subject is structural aboutness only.** It is identity-bearing (part of the claim key), but the subject need not sign the transaction, and the fold infers no consent, control, existence, truth, or vocabulary-specific authority from it. Those stay consumer/view policy.
- **No revoke verb, no event-level `target`, no record `state`.** Withdrawal / negation / supersession are ordinary vocabulary payloads that are also claimed; views interpret them.
- **Further aboutness** (counterparties, scopes, a publisher field, …) lives **inside object bodies**, never as positional roles in `hashes[]`. Array index is only `hashIndex` for ordering.

### Identity and records

- **Claim key:** `claimKey(source, subject, objectHash)` (addresses normalized; legacy hex lowercased). One Claim with N hashes folds as N independent records sharing provenance.
- **`ClaimRecord`** is `{ source, subject, objectHash, declaredObjectSchema, firstBlock, firstEventHash, lastBlock }` and has **no state**. `firstBlock` / `firstEventHash` freeze at first materialization, `declaredObjectSchema` is **first-wins**, and `lastBlock` is the only moving clock (it advances on every Claim touching the key, redundant ones included).
- **`AppliedEventRecord`** — the canonical ordered stream — is one record per folded hash entry: `{ block, blockEventOrdinal, txHash, eventHash, source, subject, objectHash, objectSchema, hashIndex }`.
- The engine keeps a source-leading index `[source, subject, objectHash]` and a subject-leading reverse index `[subject, source, objectHash]` (`viewer.claimsBySubject`), so every source's Claims about one subject can be read without changing claim identity or implying subject consent.

### Existing hash contract

Statement Graph's `hashes[]` contains **object data hashes**, as required by its shipped builders/fold. Preserve that protocol contract and its unversioned schema; do not substitute root hashes or a version suffix.

A transaction commits each payload's **root** hash, and the co-commit gate (like XL1 consensus) requires every named data hash to appear among the transaction's committed hashes. A claimable object's root hash must therefore equal its data hash: **objects claimed through Statement Graph carry no `$` client metadata** (`$version`, `$sources`, …), so their effective `$version` is always `1.0.0`. The SDK writer throws on a `$`-bearing object before it inserts or broadcasts anything; a hand-built transaction carrying one fails co-commitment and the whole Claim is rejected. Do not plan a vocabulary revision around `$version` on claimed objects — that needs a coordinated change to this hash contract (builders, fold, consumers, historical replay verification), not a product-level workaround. On the read side, object bodies resolve by data hash over a metadata-stripped view, so a `$` field on a datalake copy is not part of the committed object and must never select semantics.

The Claim event itself is elevated by root hash, so on the XL1 path its carrier may carry `$` client metadata. Carrier verification strips only `_` storage fields before recomputing that root hash; the strict Claim guard strips both `_` and `$` before parsing fields. Never strict-parse a hydrated body directly. (The trusted local runner in `-engine-actor` has no block carrier and refuses Claim events whose root and data hashes differ.)

New generic application identities/references outside this contract default to root hashes (see [Payload Schema Evolution and Identity](../xyo-knowledge/payload-schema-evolution.md)).

### Fold materializes claims; views add meaning

```
objects (vocabulary payloads) + Claim event
  → one XL1 transaction: Claim elevated, every claimed object co-committed
  → finalized scan: same-block Claim carrier verified; source in tx signer set;
    all named hashes in the same tx
  → monotone fold → ClaimRecord index + AppliedEventRecord stream
  → product views (grants, bindings, LWW, …)
```

### Elevation and co-commitment

- **Exact elevation.** A Claim counts only when its transaction carries the exact script operation `elevate|<claimHash>` (lowercase 64-hex root hash, no extra arguments). A Claim-schema item without it is dropped as `not-elevated` and folds nothing.
- **Same-block carrier is the only authority.** An elevated Claim's canonical body must be present in the same finalized block, and the scanner recomputes the carrier's root hash. A missing, mismatched, or wrong-schema carrier throws `ClaimCarrierIntegrityError` before the checkpoint advances. There is **no datalake fallback** for Claim bodies; datalakes carry referenced objects and auxiliary bodies.
- **Gate 1:** the Claim's `source` must be in the transaction's top-level signer set. Per-SOURCE is the fan-out unit: a multi-party exchange stays N Claims.
- **All-or-nothing co-commitment.** Every hash in `hashes` must ride the same transaction. If any is missing, **no entry of that Claim folds** (diagnostic drops name each missing member). Only after that does the deployment's indexed-schema policy, plus opt-in strict checks, filter entries per hash; those are deployment filters, not consensus validity.

### Ordering authority

Views **must** order with `(block, tx, event, hashIndex)` via protocol helpers (`compareAppliedPrecedence`, `indexAppliedByReferencedHash`). Do **not** order by wall-clock time, content-hash ties, or `ClaimRecord` clocks alone. The order is total and strict, so views define no tie doctrine.

### Negation is recognized by hash

A negation is ordinary vocabulary, so a view has to recognize it. The preference order is normative:

- **Match the hash.** Design negation objects to be *recomputable* — every field deterministic from what they withdraw (for example `{ schema, hash: <withdrawn objectHash> }` under your namespace). The view computes `recomputableObjectHash(schema, params)` and tests whether `claimKey(source, subject, thatHash)` is claimed, using the subject your lexicon specifies for the negation. This reads no body and no declared schema, so on an open (`any-object-schema`) deployment with no strict checks it cannot be evaded by mis-declaring the object's schema.
- **Never filter candidate hashes through `declaredObjectSchema`** on that indexing path. The writer controls the declared schema string, not the content hash.
- **Hash matching sees only entries the deployment folded.** A restricted `indexedSchemaPolicy` drops an entry whose declared schema it does not list. Opt-in strict checks drop an entry whose declaration is ambiguous, whose body does not resolve (`object-body-unverifiable`), or whose body schema differs from the declaration (`object-schema-mismatch`). On such deployments a negation is found by hash only when it is declared under its real, indexed schema and, under `requireBodySchemaEquality`, its body is published.
- **Schema-gated recognition is a fallback** for negations that cannot be recomputable. It is sound only under strict mode with both `rejectAmbiguousSchemaDeclarations` and `requireBodySchemaEquality`, declared alongside the replay contract (out of band — the replay contract shape does not carry it). Even then, a negation that is mis-declared and never resolves stays invisible; say so in the lexicon.
- Negation objects must be **small public envelopes**, insert-verified before broadcast, and views define a fail posture for unresolved negation objects.

### Versioning and persistence

The fold version is the exported `STATEMENT_FOLD_VERSION` from `@xyo-network/xl1-statement-graph-schemas` (currently 4). Import it; do not hard-code a literal. A replay contract whose `foldVersion` differs makes the scan throw, and checkpoints embed the contract. Migration depends on where persisted state came from:

| Origin | Current behavior | Action |
|--------|------------------|--------|
| Scan checkpoints from 0.4.2 / 0.4.3 (and other checkpoint-format-1 releases) | `loadCheckpoint` returns `missing` | None: the scan rescans from the contract floor |
| Scan checkpoints from 0.4.0 / 0.4.1 (format-2 marker, older shape) | Load as `corrupt`; resuming throws `resume checkpoint is corrupt` | Delete the checkpoint, then rescan from the floor |
| Current-format checkpoint with a different contract (network, floor, `foldVersion`, schema policy, corpus) | `contract-mismatch`; resuming throws | Use the matching contract, or rescan under the new one |
| Durable local engine envelopes (`-engine-actor` sequence logs) | Any `statement_fold_version` other than the current fold fails closed with a rebuild error | Re-author or rebuild the log from its source of truth; pre-subject Claims cannot be upgraded mechanically. A marker newer than the installed fold means the log was written by newer software: upgrade the packages instead of rebuilding, even though the error text says rebuild |

---

## Packages

| Package | Role |
|---------|------|
| `@xyo-network/xl1-statement-graph-schemas` | Grammar (`ClaimSchema`, `StatementFieldsZod`), records, `MAX_CLAIM_HASHES`, replay contract, `STATEMENT_FOLD_VERSION` |
| `@xyo-network/xl1-statement-graph-protocol` | `claimKey`, gates, fold, precedence and aboutness helpers, `recomputableObjectHash` (pure) |
| `@xyo-network/xl1-statement-graph-sdk` | `buildClaim`, `publishStatements` / `prepareStatements`, finalized scan, checkpoints |
| `@xyo-network/xl1-statement-graph-engine` / `-engine-actor` | Incremental state (source- and subject-leading indexes), viewers, actor hosts, trusted local runner |
| `@xyo-network/xl1-statement-graph-testing` | Fakes and acceptance scenarios |

Import NSIDs and builders from these packages — do not invent parallel claim schemas.

---

## Pattern Overview

1. Define **vocabulary object schemas** under your product namespace (`network.xyo.<product>.*` or `com.<org>.*` per [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming)). Objects you claim carry no `$` client metadata.
2. Decide each Claim's **subject** (the address or content hash it is about) and compute the objects' data hashes.
3. `buildClaim({ source, subject, hashes })` then `publishStatements(...)`: the Claim is elevated, every claimed object rides the same transaction, and object bodies are insert-verified into the datalake before broadcast.
4. The indexer scans finalized blocks under a replay contract whose `foldVersion` is `STATEMENT_FOLD_VERSION`; product views derive live meaning.
5. Prefer **bounded validity** (`notBefore` / `expires`) on vocabulary when possible; when withdrawal is required, use small public **recomputable** negation envelopes recognized by hash (fail closed on unresolved negation).

---

## Write path (SDK)

```ts
import { PayloadBuilder } from '@xyo-network/sdk'
import { buildClaim, publishStatements } from '@xyo-network/xl1-statement-graph-sdk'

// Claimed objects must be `$`-free: root hash === data hash.
const objects = [objectPayloadA, objectPayloadB]
const hashes = await Promise.all(objects.map(object => PayloadBuilder.dataHash(object)))

const event = buildClaim({
  source: identity.address, // must be a transaction signer
  subject: peer.address,    // address or content hash the Claim is about
  hashes,
})

const txHash = await publishStatements(
  broadcaster, // gateway runner shape: addPayloadsToChain(onChain, offChain)
  store,       // datalake the target indexer resolves (object bodies only)
  [{ event, objects }], // exactly the claimed set
  { signers: [identity.address] },
)
```

Write-time checks (`prepareStatements`, shared by `publishStatements` and the local runner) throw instead of producing a Claim the indexer would drop:

- every statement's `source` must be in `signers`; keep `signers` equal to the set the broadcaster actually signs with, which the writer cannot verify;
- `objects` must equal the Claim's hash set **exactly**, matched by data hash: a missing object throws, and an extra unclaimed object throws;
- every object's root hash must equal its data hash (no `$` client metadata);
- the same Claim event twice in one batch throws.

The Claim goes in the elevated (`onChain`) slot and is carried by the block; it is **not inserted into the datalake**. Only object bodies are inserted (readback-verified before broadcast) unless a statement passes `insertObjectBodies: false`. The trusted local runner is the one exception: it has no block carrier, so it persists the explicit Claim body in its local body store.

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
| Key views or caches by `(source, objectHash)` | Key by `claimKey(source, subject, objectHash)`; dropping `subject` merges Claims about distinct subjects |
| Treat `subject` as consent or control | The subject need not sign; apply consent and authority rules in the view |
| Put roles in `hashes[]` position | Put further aboutness fields on vocabulary objects |
| Recognize negations by declared schema | Recompute the negation hash and test the claim index; schema gating only as a declared strict-mode fallback |
| Order views by timestamps or `firstBlock` alone | Use `(block, tx, event, hashIndex)` precedence helpers |
| Put `$version` (or any `$` field) on an object you claim, or trust one on a resolved body | Keep claimed objects `$`-free; the committed object never carried one |
| Read a Claim body from a datalake when its carrier is missing | Trust only the hash-verified same-block carrier; a missing carrier stops the scan |
| Dual-read legacy `claim.v1` / `revoke.v1` or older fold output | Current unversioned Claim only; rebuild checkpoints and local logs when `STATEMENT_FOLD_VERSION` changes |
| Hard-code the fold version | Import `STATEMENT_FOLD_VERSION` |
| Copy fold code into the product | Depend on `xl1-statement-graph-*` packages |

---

## Cross-references

- [Authenticated Wake Delivery](authenticated-wake-delivery.md) — Event Kit grants on this substrate
- [XL1 dApp Kit](../xl1-dapp-kit/SKILL.md) — hosts that consume wakes / projections
- Upstream docs: `XYOracleNetwork/xl1-statement-graph` (`WHITEPAPER.md`, `docs/PROTOCOL_REDESIGN.md`)
