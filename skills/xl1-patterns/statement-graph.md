# Statement Graph

Read this pattern when your application needs a **replayable, source-attributed relationship / assertion graph on XL1** — bindings, grants, approvals, membership, reciprocal edges, and similar signed claims — with a **closed lifecycle** and **open product vocabulary**.

This is an **application-layer substrate**, not part of core XL1 consensus. Peer of [Inscription Substrate](inscription-substrate.md): inscriptions own transferable content artifacts; Statement Graph records signed assertions about objects.

**Builds on:**
- [Chain Data Indexing](chain-data-indexing-protocol.md) — finalized-only replay, two-step reads (schemas on the chain, bodies by hash)
- [Finalized block streams](../xl1-knowledge/gateway.md#finalized-block-stream) — ordered gap-aware delivery for indexers
- [Datalakes](../xl1-knowledge/datalakes.md) — object bodies referenced by hash
- [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md) — authorship on the BoundWitness, not invented payload `from` fields

**Used by:** LifeHash, Event Kit wake grants and handshake objects, Edge Node statement views, Webble, Immortalizer, Service Kit finalized service/datalake descriptor views (`@xyo-network/service-kit-statement-graph`). For wallet-authenticated wake delivery on top of grants, see [Authenticated Wake Delivery](authenticated-wake-delivery.md).

**Maturity:** packages at `@xyo-network/xl1-statement-graph-*` **0.7.x** (fold 4, checkpoint format 2), public npm. All six share one version and build on the `{ source, subject, hashes }` Claim from `@xyo-network/xl1-protocol` ≥ 5.4. Adopt minors deliberately: `~0.5.x` does not pick up 0.6.0 (SDK resume integrity) or 0.7.0 (declared strict gate profile). Event Kit 2.2.x (`@xyo-network/event-kit-statement-graph`) and `@xyo-network/service-kit-statement-graph` 0.2.x still peer `^0.5`, so an app composing either pins Statement Graph `~0.5.x` until they ship a compatible release. The atomic Claim validator is qualified only on a local `xl1-cli` chain — Statement Graph records no Sequence or Mainnet qualification, so confirm the target network accepts subject-bearing elevated Claims before relying on them there. Prefer importing published packages over copying fold logic.

---

## The Problem

Products need shared rules for “who asserted what about which content-addressed object,” with multi-indexer convergence. Ad-hoc claim/revoke tables and timestamp ordering disagree under reorgs and multi-hash transactions.

Statement Graph fixes a **single append-only claim verb**, fans hashes into independent `(source, subject, objectHash)` records, and mandates a **proscriptive total order**. Domain meaning (ownership LWW, grant liveness, retraction) lives in **product lexicons and views**, not in the fold.

---

## Concepts

### Closed lifecycle, open vocabulary

- **One event schema:** `network.xyo.statement.claim` (unversioned — not `.v1`). `ClaimSchema`, `MAX_CLAIM_HASHES`, and `ClaimSubjectZod` are owned by `@xyo-network/xl1-protocol` (≥ 5.4) and re-exported by `@xyo-network/xl1-statement-graph-schemas` and `@xyo-network/xl1-sdk`.
- **Fields:** `{ source, subject, hashes }` — `source` is the asserting address (must sign the transaction); `subject` is **required**, an XYO address or content hash naming what the claim is about; `hashes` is 1–`MAX_CLAIM_HASHES` (**256**) unique object dataHashes.
- **No revoke verb, no record `state`.** Withdrawal / negation / supersession are ordinary vocabulary payloads that are also claimed; views interpret them.
- **`subject` is structural aboutness only** — not proof of consent, control, or authority, and the subject need not sign. Every other role (peer, counterparty, …) lives **inside object bodies**, never as positional roles in `hashes[]`. Array index is only `hashIndex` for ordering.

### Existing hash contract

Statement Graph's `hashes[]` currently contains **object data hashes**, as required
by its shipped builders/fold. Preserve that protocol contract and its unversioned
schema; do not substitute root hashes or a `.v2` suffix. A data hash does not bind
`$version`. Version-dependent product decisions must verify a root-hash-bound
representation or use independently trusted fixed rules. New generic application
identities/references default to root hashes; migrating SG needs coordinated
builder/fold/consumer changes and historical replay verification.

Transactions commit root hashes, and atomic co-commit matches each `hashes[]`
entry against them, so a claimed object's root hash must equal its data hash:
it cannot carry `$` client metadata (`$version` included). The shipped writer
(`prepareStatements`, used by `publishStatements`) throws on such an object.

### Fold materializes claims; views add meaning

```
objects (vocabulary payloads) + claim event
  → one XL1 tx: claim elevated, source in tx signer set,
    every hash in the same tx (one missing → whole claim invalid)
  → monotone fold → ClaimRecord + AppliedEventRecord stream
  → product views (grants, bindings, LWW, …)
```

`ClaimRecord` is keyed by `(source, subject, objectHash)` and has **no state**; two claims by one source over the same object but about different subjects stay distinct records. The engine also indexes `[subject, source, objectHash]` so a view can read every source's claims about one subject — without implying the subject's consent. Clocks `firstBlock` / `firstEventHash` freeze at first materialization; `lastBlock` advances when the key is touched again.

### Ordering authority

Views **must** order with `(block, tx, event, hashIndex)` via protocol helpers (`compareAppliedPrecedence`, `indexAppliedByReferencedHash`). Do **not** order by wall-clock time, content-hash ties, or `ClaimRecord` clocks alone.

`STATEMENT_FOLD_VERSION = 4` (required `subject`, atomic co-commit) is part of the replay contract; finalized scan checkpoints use **format 2**. Pre-subject format-1 checkpoints load as missing and rescan from the contract floor. Published **0.4.0 / 0.4.1** checkpoints carry an older format-2 shape: they load as corrupt and the scan throws until you **delete** them. Older v1 claim/revoke data never dual-reads — rescan from floor. The opt-in strict gates (`rejectAmbiguousSchemaDeclarations`, `requireBodySchemaEquality`) are dataset identity: from 0.7.0 declare them as the contract's `gateProfile` (`ScanOptions.strict` is deprecated); releases before 0.7.0 cannot read a profile-bearing contract or checkpoint.

---

## Packages

| Package | Role |
|---------|------|
| `@xyo-network/xl1-statement-graph-schemas` | Strict claim guards, records, replay contract, fold version; re-exports `ClaimSchema`, `MAX_CLAIM_HASHES`, `ClaimSubjectZod` from xl1-protocol |
| `@xyo-network/xl1-statement-graph-protocol` | Gates, fold, precedence helpers (pure) |
| `@xyo-network/xl1-statement-graph-sdk` | `buildClaim`, `publishStatements` / `insertVerified`, `scanFinalizedStatements`, `resolveVerifiedBodies`, checkpoints |
| `@xyo-network/xl1-statement-graph-engine` / `-engine-actor` | Incremental state, subject indexes, viewers; actor-hosted clocks, verified replay, insert-first writer |
| `@xyo-network/xl1-statement-graph-testing` | Fakes and acceptance scenarios |

Import NSIDs and builders from these packages (or `ClaimSchema` from `@xyo-network/xl1-sdk`) — do not invent parallel claim schemas.

---

## Pattern Overview

1. Define **vocabulary object schemas** under a reverse-domain namespace you control (`com.<org>.<product>.*`) per [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming) and [Payload Schema Evolution](../xyo-knowledge/payload-schema-evolution.md). `network.xyo.*` is reserved for XYO-owned products (e.g. Event Kit's `network.xyo.event.wake.*`).
2. Build the object payloads (no `$` metadata); their dataHashes are the claim's `hashes`. No separate insert step — `publishStatements` inserts and verifies them.
3. `buildClaim({ source, subject, hashes })` then `publishStatements(...)`: the claim is elevated and every object rides the same transaction, with correct signers.
4. Indexer runs `scanFinalizedStatements` over finalized blocks and folds applied events; product views derive live meaning.
5. Prefer **bounded validity** (`notBefore` / `expires`) on vocabulary when possible; use small public negation envelopes when withdrawal is required (fail closed on unresolved negation).

---

## Write path (SDK)

```ts
import { buildClaim, publishStatements } from '@xyo-network/xl1-statement-graph-sdk'

const event = buildClaim({
  source: identity.address,
  subject: subjectAddressOrHash, // required: what this claim is about
  hashes: [objectHashA, objectHashB],
})

const txHash = await publishStatements(
  gateway,        // XyoGatewayRunner-shaped: addPayloadsToChain(onChain, offChain, options)
  datalakeRunner, // createRestDataLakeRunner(endpoint): the datalake the indexer reads
  [{ event, objects: [objectPayloadA, objectPayloadB] }],
  { signers: [identity.address] }, // must equal the set the gateway actually signs with
)
```

`publishStatements` validates first (`prepareStatements`): `source` must be among `signers`; the provided objects must equal the claim's hash set exactly (a missing one would make consensus reject the whole Claim; an extra one is a writer error); each object's root hash must equal its dataHash. It then runs `insertVerified` — inserts opted-in object bodies and proves retention by hash-verified readback — and only then broadcasts the Claim as the elevated `onChain` payload with the objects as `offChain` payloads of the same transaction. `insertObjectBodies: false` keeps a private body in your own store; never use it for negation objects, which views must be able to read. The fold re-applies the signer and atomic co-commit gates.

Read side: `scanFinalizedStatements(viewer, store, contract, options)` walks finalized blocks from a gateway viewer, takes each elevated Claim body from its same-block carrier (a missing or mismatched carrier stops the scan), and reads object bodies from `store` by hash — a datalake reader such as `createRestDataLakeViewer(endpoint)`, since no gateway read hydrates off-chain bodies. `resolveVerifiedBodies(store, hashes)` re-hashes every returned body and reports mismatches as `corrupt` rather than folding them. Persist `result.checkpoint` and pass it back as `resumeFrom`.

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
| Omit `subject`, or read it as consent / authority | Always set it; it is structural aboutness — authority and consent stay view policy |
| Put roles in `hashes[]` position | Name the one thing the claim is about in `subject`; put other aboutness fields on vocabulary objects |
| Hand-roll insert + broadcast, or split objects across transactions | `publishStatements`: hash-verified insert readback, then one transaction carrying the elevated claim and every object |
| Order views by timestamps or `firstBlock` alone | Use `(block, tx, event, hashIndex)` precedence helpers |
| Strip `$version` then treat the copy as an original version-1 payload | Verify the original hash/version policy first; if the shipped parser needs a body projection, retain provenance and project only after those checks |
| Dual-read v1 claim/revoke or resume a pre-fold-4 checkpoint | Fold 4 only; rescan from floor (delete 0.4.0 / 0.4.1 checkpoints) |
| Copy fold code into the product | Depend on `xl1-statement-graph-*` packages |

---

## Cross-references

- [Authenticated Wake Delivery](authenticated-wake-delivery.md) — Event Kit grants on this substrate
- [XL1 dApp Kit](../xl1-dapp-kit/SKILL.md) — hosts that consume wakes / projections
- Upstream docs: `XYOracleNetwork/xl1-statement-graph` (`WHITEPAPER.md`, `docs/PROTOCOL_REDESIGN.md`, `docs/REPLAY_CONTRACT_GATE_PROFILE.md`)
