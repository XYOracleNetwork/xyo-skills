# Statement Graph

Read this pattern when your application needs a **replayable, source-attributed relationship / assertion graph on XL1** — bindings, grants, approvals, membership, reciprocal edges, and similar signed claims — with a **closed lifecycle** and **open product vocabulary**.

This is an **application-layer substrate**, not part of core XL1 consensus. Peer of [Inscription Substrate](inscription-substrate.md): inscriptions own transferable content artifacts; Statement Graph records signed assertions about objects.

**Builds on:**
- [Chain Data Indexing](chain-data-indexing-protocol.md) — finalized-only replay, schema filtering
- [Finalized block streams](../xl1-knowledge/gateway.md#finalized-block-stream) — ordered gap-aware delivery for indexers
- [Datalakes](../xl1-knowledge/datalakes.md) — object bodies referenced by hash
- [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md) — authorship on the BoundWitness, not invented payload `from` fields

**Used by:** LifeHash, Event Kit wake grants, Edge Node statement views, Webble, Immortalizer. For wallet-authenticated wake delivery on top of grants, see [Authenticated Wake Delivery](authenticated-wake-delivery.md).

**Maturity:** the six `@xyo-network/xl1-statement-graph-*` packages publish publicly to npm under LGPL-3.0-only and share one version; the current minor (**0.7.x** at this writing) carries the current fold. Consumers pin a minor, so a `~0.5.x` range (or `^0.5` peer range) picks up neither 0.6.0 (SDK resume integrity) nor 0.7.0 (engine apply atomicity, first-declaration object rows, engine-actor host checks, fold preconditions, the strict gate profile): adopt each minor explicitly and move every Statement Graph pin together. Prefer importing published packages over copying fold logic. Publishing Claims needs a chain whose consensus accepts the unversioned `{ source, subject, hashes }` Claim as an elevated payload. The upstream repo proves that path on a local dev chain, which is not Sequence or Mainnet qualification — confirm the target network's rollout before publishing there.

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
- **All-or-nothing co-commitment.** Every hash in `hashes` must ride the same transaction. If any is missing, **no entry of that Claim folds** (diagnostic drops name each missing member). Only after that does the deployment's indexed-schema policy, plus the opt-in strict gates it declares in its [gate profile](#strict-gate-profile), filter entries per hash; those are deployment filters, not consensus validity.

### Ordering authority

Views **must** order with `(block, tx, event, hashIndex)` via protocol helpers (`compareAppliedPrecedence`, `indexAppliedByReferencedHash`). Do **not** order by wall-clock time, content-hash ties, or `ClaimRecord` clocks alone. The order is total and strict, so views define no tie doctrine.

**Fold preconditions.** `foldStatements` refuses out-of-domain input instead of folding it:

- every event's `block`, `blockEventOrdinal.tx` and `blockEventOrdinal.event` must be safe non-negative integers, and so must a resume seed's watermark (whose block may also be `-1`, meaning nothing consumed yet); otherwise it throws a `TypeError` (`… has an ordinal-less or malformed position …; the fold requires D7 positions`);
- a *different* inclusion at the fold's current watermark position throws `statement event position collision at block B tx T event E: …`; at a resume seed's watermark only a key in the seed's `watermarkGroupEventKeys` may tie;
- the same inclusion, recognized by its `(txHash, eventHash)`, repeated at its own position still folds once.

Events from `extractStatementEvents` and the SDK scan carry chain-derived positions. Hand-built events (test builders, adapters, differential replayers) must give each distinct inclusion its own D7 position: default or reused ordinals throw. Refusing this input is not a fold-version change.

### Negation is recognized by hash

A negation is ordinary vocabulary, so a view has to recognize it. The preference order is normative:

- **Match the hash.** Design negation objects to be *recomputable* — every field deterministic from what they withdraw (for example `{ schema, hash: <withdrawn objectHash> }` under your namespace). The view computes `recomputableObjectHash(schema, params)` and tests whether `claimKey(source, subject, thatHash)` is claimed, using the subject your lexicon specifies for the negation. This reads no body and no declared schema, so on an open (`any-object-schema`) deployment with no strict checks it cannot be evaded by mis-declaring the object's schema.
- **Never filter candidate hashes through `declaredObjectSchema`** on that indexing path. The writer controls the declared schema string, not the content hash.
- **Hash matching sees only entries the deployment folded.** A restricted `indexedSchemaPolicy` drops an entry whose declared schema it does not list, and the strict gates filter the claim index before any view reads it, negations included:
  - `rejectAmbiguousSchemaDeclarations` drops a negation whose hash its transaction declares under differing schemas;
  - under `requireBodySchemaEquality` (strict revision 1), a mis-declared negation whose body resolves drops as `object-schema-mismatch`, and a parameterized negation whose body is not published drops as `object-body-unverifiable`, recomputable or not, even when it is correctly declared;
  - only a correctly declared **pure** negation (its schema alone) proves its own body and folds with no datalake.

  A strict dataset and a default-profile dataset over the same range can therefore hold different negation sets. The drop surfaces only as a scan diagnostic, and a resume never reports it again. On strict deployments make negations pure or publish their bodies, and never read a negation's absence from a strict claim index as proof that none was asserted.
- **Schema-gated recognition is a fallback** for negations that cannot be recomputable. It is sound only on a dataset whose replay contract declares both `rejectAmbiguousSchemaDeclarations` and `requireBodySchemaEquality` as its [`gateProfile`](#strict-gate-profile), which a resume then enforces. Strict mode is a precondition, not a sufficient defense: a mis-declared negation that never resolves still folds on a default-profile dataset, where only hash matching recognizes it, and does not fold at all under `requireBodySchemaEquality`, where neither route recognizes it. Say so in the lexicon.
- **Never recognize kind from the engine's object row.** `ObjectRecord.declaredSchema` is the first declaration of that hash by *any* source (see [Engine consumers](#engine-consumers)), so a third party can claim a computable negation hash first under a wrong schema and fix the row's kind. Recognize negations by hash; for the declaration a source made, read its `ClaimRecord.declaredObjectSchema` (first-wins per claim key) or, per Claim, the applied event's `objectSchema`.
- Negation objects must be **small public envelopes**, insert-verified before broadcast, and views define a fail posture for unresolved negation objects.

### Strict gate profile

The opt-in strict gates decide which entries fold, so they are dataset identity. Declare them in the replay contract as `gateProfile`, `{ rejectAmbiguousSchemaDeclarations, requireBodySchemaEquality, revision }` (`GateProfileZod`), with `revision: STRICT_GATE_REVISION`. The scan enforces the profile on resume and seals it into the checkpoint. The default profile (both flags off) is omitted (`canonicalGateProfile`), so default-profile contracts and checkpoints keep their bytes.

```ts
import type { ReplayContract } from '@xyo-network/xl1-statement-graph-schemas'
import { STATEMENT_FOLD_VERSION, STRICT_GATE_REVISION } from '@xyo-network/xl1-statement-graph-schemas'
import { scanFinalizedStatements } from '@xyo-network/xl1-statement-graph-sdk'

const contract: ReplayContract = {
  ...datasetIdentity, // network, floorBlock, throughBlock, indexedSchemaPolicy, eventBodyCorpus
  foldVersion: STATEMENT_FOLD_VERSION,
  gateProfile: {
    rejectAmbiguousSchemaDeclarations: true,
    requireBodySchemaEquality: true,
    revision: STRICT_GATE_REVISION,
  },
}

// No ScanOptions.strict: the contract is the declaration.
const { checkpoint } = await scanFinalizedStatements(viewer, store, contract, { resumeFrom })
```

- **`ScanOptions.strict` is deprecated** but still honored: when the contract has no profile, its flags become the effective profile at `STRICT_GATE_REVISION`. When both are present they must declare the same profile, compared by value, or the scan throws `TypeError: ScanOptions.strict conflicts with contract.gateProfile; …` before any read. A declared profile at another revision throws as well. To migrate, `gateProfileFromStrict(strict)` builds the canonical profile from the old options (`undefined` for the default profile, whose key the contract omits).
- **Legacy rule.** A profile-less checkpoint, written under the default profile or by a release before 0.7.0, resumes under a strict profile unless that profile sets `requireBodySchemaEquality`, which refuses it with `… strict body-schema equality requires a full rescan from floor`. A persisted `rejectAmbiguousSchemaDeclarations` checkpoint therefore migrates without a rescan, and the next checkpoint records the profile. A checkpoint that records a profile resumes only under the same profile, revision included; the default profile counts as a different one.
- **Strict revision 1** (0.7.0). Under `requireBodySchemaEquality` a verified object body must be a plain record whose `schema` is a string equal to the declaration. A missing or non-string `schema`, or one present only as `$schema` / `_schema`, drops the entry as `object-schema-mismatch`; a body that is not a plain record (array, `Map`, `Date`, buffer), or no verified body, drops it as `object-body-unverifiable`. A pure object whose hash is `H({ schema: declared })` self-verifies with no stored body through `withPureObjectBodies`. The SDK scan and the engine run it before extraction; a reader that calls `extractStatementEvents` directly must first pass the bodies through `await withPureObjectBodies(transaction, bodies, options)` (async; it returns a read-only view over `bodies`, so do not mutate `bodies` while using it), or a body-less pure object drops as unverifiable.
- **Availability is settled once per checkpoint lineage.** An entry dropped for a missing or corrupt body stays dropped on resume (a correctly declared pure object is the exception); only a rescan from the floor evaluates it again. Declare the object corpus, and rescan from the floor after repairing it.
- **Upgrade constraints.** SDK 0.5.x and 0.6.0 reject a profile-bearing contract (`replay contract does not validate`) and load a profile-bearing checkpoint as `corrupt`, so instances that share a checkpoint store upgrade together and cannot downgrade past one. A caller that runs `loadCheckpoint` itself must pass the effective contract, profile included: a profile-bearing checkpoint is `contract-mismatch` against a profile-less contract. `STRICT_GATE_REVISION` is one global number, so a future bump refuses every profile-bearing checkpoint at the old revision, `rejectAmbiguousSchemaDeclarations`-only ones included; strict consumers need a rebuild-from-floor path.
- **Only the finalized scan declares and enforces the profile.** The engine and engine-actor take `ExtractOptions.strict` directly and record no profile or revision in local envelopes, so a strict local host replays under whatever revision is installed.

### Versioning and persistence

The fold version is the exported `STATEMENT_FOLD_VERSION` from `@xyo-network/xl1-statement-graph-schemas` (currently 4). Import it; do not hard-code a literal. A replay contract whose `foldVersion` differs makes the scan throw, and checkpoints embed the contract. A scan given a checkpoint that `loadCheckpoint` classifies as `corrupt` throws `resume checkpoint is corrupt: <detail>`. Migration depends on where persisted state came from:

| Origin | Current behavior | Action |
|--------|------------------|--------|
| Scan checkpoints from 0.4.2 / 0.4.3 (and other checkpoint-format-1 releases) | `loadCheckpoint` returns `missing` | None: the scan rescans from the contract floor |
| Scan checkpoints from 0.4.0 / 0.4.1 (format 2, older `records` shape) | `corrupt`: ``pre-fold-4 checkpoint (0.4.0/0.4.1 `records` shape); delete it to rescan from floor`` | Delete the checkpoint, then rescan from the floor |
| Checkpoint format above 2 (written by a newer SDK) | `corrupt`: `unsupported checkpoint format N; upgrade the SDK`. 0.5.x loaded it as `missing` and silently rescanned | Upgrade the SDK |
| Claim state below the floor: a frozen record whose `firstBlock` precedes `floorBlock`, or a watermark below it | `corrupt`: `… precedes floorBlock N; full rescan from floor required` | Delete the checkpoint, then rescan from the floor |
| Claim state without a fold watermark, a watermark beyond the checkpoint's `throughBlock`, or records externalized to shards | The scan throws before reading any block (`… full rescan from floor required`; shards: `… assemble them before scanning`) | Not a finalized-scan checkpoint: rescan from the floor, or assemble shards first |
| Current-format checkpoint with a different contract (network, floor, `foldVersion`, schema policy, corpus, `gateProfile`) | `contract-mismatch`; resuming throws. `gateProfile` follows the [legacy rule](#strict-gate-profile) | Use the matching contract, or rescan under the new one |
| Profile-bearing checkpoint read by SDK 0.5.x or 0.6.0 | `corrupt` (`recognized checkpoint format with invalid content`) | Upgrade every instance that shares the store |
| Durable local engine envelopes (`-engine-actor` sequence logs) | Any `statement_fold_version` other than the current fold fails closed. A missing, older, non-finite, or non-number marker says `rebuild the local log`; a newer finite number says `written by a newer Statement Graph fold; upgrade this software instead of rebuilding the log` (through 0.6.0 every case said rebuild) | Older marker: re-author or rebuild the log from its source of truth; pre-subject Claims cannot be upgraded mechanically. Newer marker: upgrade the packages; a trusted local log is primary data, so never rebuild it |

A resume never reads below the floor: it starts at `max(floorBlock, throughBlock + 1)`. A `through` cap below a resumed checkpoint's horizon throws `RangeError` (a request error), while a finalized head below it throws `FinalizedHeadRegressionError`. A block that commits the same transaction twice is consensus-invalid, and the scan stops on it with `BlockUnavailableError`.

---

## Packages

| Package | Role |
|---------|------|
| `@xyo-network/xl1-statement-graph-schemas` | Grammar (`ClaimSchema`, `StatementFieldsZod`), records, `MAX_CLAIM_HASHES`, replay contract (`GateProfileZod`, `STRICT_GATE_REVISION`), `STATEMENT_FOLD_VERSION` |
| `@xyo-network/xl1-statement-graph-protocol` | `claimKey`, gates, fold, precedence and aboutness helpers, `recomputableObjectHash`, `withPureObjectBodies` (pure) |
| `@xyo-network/xl1-statement-graph-sdk` | `buildClaim`, `publishStatements` / `prepareStatements`, finalized scan, checkpoints, gate-profile helpers (`canonicalGateProfile`, `gateProfileFromStrict`, `gateProfileMismatch`) |
| `@xyo-network/xl1-statement-graph-engine` / `-engine-actor` | Incremental state (source- and subject-leading indexes), `applyStatementTransaction` and `StatementGraphSinkError`, viewers, actor hosts, trusted local runner, `RunnerCheckpointSchema` prune marker |
| `@xyo-network/xl1-statement-graph-testing` | Fakes and acceptance scenarios |

Import NSIDs and builders from these packages — do not invent parallel claim schemas.

---

## Pattern Overview

1. Define **vocabulary object schemas** under your product namespace (`network.xyo.<product>.*` or `com.<org>.*` per [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming)). Objects you claim carry no `$` client metadata.
2. Decide each Claim's **subject** (the address or content hash it is about) and compute the objects' data hashes.
3. `buildClaim({ source, subject, hashes })` then `publishStatements(...)`: the Claim is elevated, every claimed object rides the same transaction, and object bodies are insert-verified into the datalake before broadcast.
4. The indexer scans finalized blocks under a replay contract whose `foldVersion` is `STATEMENT_FOLD_VERSION` and whose `gateProfile` declares any strict gates; product views derive live meaning.
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

## Engine consumers

Hosts that materialize incrementally (indexers, replay controllers, local runners) call `applyStatementTransaction(state, transaction, bodies, options)` from `-engine`. Since 0.7.0 the engine enforces its caller contract instead of trusting it:

- **D7 order, one writer.** Apply transactions in `(block, txIndex)` order, await each call, and keep one writer per state. A block below the watermark or the last applied block throws `statement graph position regressed …`. In the most recently applied block, a different transaction at a completed `txIndex` throws `… position collision …`, and an uncompleted `txIndex` below the highest applied one throws `… transaction out of order …`. An overlapping call on the same state throws `concurrent applyStatementTransaction on one statement graph state; serialize calls`. Each throws before any mutation.
- **Replay is a no-op only in the latest block.** Re-applying a transaction already completed in the most recently applied block (same block, `txIndex` and `txHash`) reports `applied: 0` with no drops and makes no sink call. One from an earlier block throws `position regressed`, so retry a failed block before applying the next. A retry never resolves an event that was unresolved the first time; rebuilding the state does. The cursor has no reset, and lowering `state.watermark` reopens nothing: re-walking a range needs a fresh or reseeded state.
- **Atomic commit.** Extraction, gating, reduction checks and object snapshots are prepared first, and every mutation then commits synchronously. No reader outside the sink sees a half-applied fan, and a throw before the commit leaves state unchanged.
- **Sinks are at-most-once.** `GraphMutationSink` notifications are delivered inline during the commit, entry by entry. A sink should not throw; if one does, the commit still completes, every remaining notification is delivered, and the call throws `StatementGraphSinkError`, an `AggregateError` with `committed: true`, `report` and `errors`. Treat it as committed: take counts from `error.report`, do not retry to redeliver (in the latest block a retry is a no-op; after a later block it throws `position regressed`), and rebuild the projection whose sink threw. `combineSinks` isolates its members the same way. Drops are delivered once and never re-emitted by a retry. A sink must never call `applyStatementTransaction` on the state it observes; the outer call reports that as `StatementGraphSinkError`.
- **Object rows keep the first declaration.** `state.objects` holds one `ObjectRecord` per object hash, and its `declaredSchema` is the declaration of the first applied entry that names the hash, whichever source made it. A later resolution only sets `assurance` and `params`. Never recognize an object's kind from that row. `onObjectSnapshot` delivers each entry's raw snapshot, carrying that entry's declaration, not the merged row, so a projection that mirrors the cache must merge by the `mergeObjectSnapshot` rule: keep the first declaration, never rewrite a resolved row, and never let an unresolved snapshot replace a row.

Actor hosts (`-engine-actor`):

- A sink bound under `xl1.statement.sink` must implement the five current `GraphMutationSink` methods. A pre-0.5 `onAssertionChanged` sink (one without `onClaimChanged`) is refused at create with a rename hint. Through 0.6.0 the hosts demanded `onAssertionChanged` instead, so a sink with only the current methods was refused there. The check reads method names only, so a sink with any other argument shape needs its own moniker. Every boot replays from position 0 through the sink.
- A failed `start()` keeps its error on `startError`, and the `viewer` / `runner` getters then throw `… start failed; the statement graph is unavailable: …`. The host never heals to ready; recover with a new host. Instances resolved from the locator are registered at create and are not guarded, so wait for readiness before using them.
- Canonical hosts do not support pruned or anchored logs. A pruner writes a `RunnerCheckpointSchema` payload before deleting any slot, and an anchor-less `ArchivistSequenceClock` over a store that holds that marker and no slots refuses to hydrate instead of forking a second genesis.

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
| Recognize negations by declared schema | Recompute the negation hash and test the claim index; schema gating only as a fallback under a `gateProfile` that sets both strict flags |
| Recognize an object's kind (a revocation, say) from the engine's `ObjectRecord.declaredSchema` | Match the synthesized hash; the row keeps the first declaration by any source, so a third party can fix it first |
| Read a negation's absence from a strict dataset as proof none was asserted | Strict gates drop mis-declared and body-less parameterized negations; make negations pure or publish their bodies |
| Keep strict gates only in `ScanOptions.strict`, or pass one that conflicts with `contract.gateProfile` | Declare them as `gateProfile` with `STRICT_GATE_REVISION`; a conflicting option throws before any read |
| Call `extractStatementEvents` under `requireBodySchemaEquality` on raw datalake bodies | Run `withPureObjectBodies` first, as the scan and engine do, or body-less pure objects drop |
| Feed `foldStatements` hand-built events with default or reused ordinals | Give each distinct inclusion its own D7 position of safe non-negative integers |
| Retry `applyStatementTransaction` after `StatementGraphSinkError` to redeliver notifications | The transaction committed and a retry is a no-op; rebuild the projection whose sink threw |
| Lower `state.watermark` or re-walk applied blocks on the same engine state | Build a fresh state or reseed one |
| Mirror the object cache from `onObjectSnapshot` with resolved-replaces-unresolved | Merge by the `mergeObjectSnapshot` rule: the first declaration stays |
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
- Upstream docs: `XYOracleNetwork/xl1-statement-graph` (`WHITEPAPER.md`, `docs/PROTOCOL_REDESIGN.md`, `docs/REPLAY_CONTRACT_GATE_PROFILE.md`, and the engine, engine-actor, protocol and SDK package READMEs)
