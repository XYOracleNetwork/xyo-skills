# Authenticated Wake Delivery (Event Kit)

Read this when a sleepable indexer / host must be **woken by wallet-authenticated, allowlisted publishers** — not by shared-secret HMAC webhooks.

Event Kit delivers **wakes** (scheduling hints). It does **not** replace chain truth, statement-graph folds, or dapp-kit durable event logs.

**Builds on:**
- [Statement Graph](statement-graph.md) — grant / revocation and D-005 handshake objects claimed on XL1
- [Node Gateway](../xl1-knowledge/gateway-node.md) — finalized head for grant lag checks

**Maturity:** `@xyo-network/event-kit-*` **2.2.x** is public npm and requires **Node ≥ 26**. D-002 through D-005 are accepted; D-006 (source-aware wakes) is the accepted implementation direction and D-007 (explicit delivery modes) the selected contract, both with qualification gates still open. Local, packed-consumer, and owned-dev-chain evidence does not establish hosted, partner, Sequence, Mainnet, or multi-VM qualification. Teach the architecture; do not claim production multi-host conformance from publication alone. Event Kit is prerelease: older wire objects and incompatible checkpoints are rejected, never converted on read.

**Compatibility:** `@xyo-network/event-kit-statement-graph` 2.2.0 peers Statement Graph `^0.5` (sdk, engine, schemas), which excludes 0.6.x / 0.7.x. Pin `@xyo-network/xl1-statement-graph-*` `~0.5.x` alongside Event Kit until a compatible Event Kit release ships.

---

## The Problem

Indexers that only poll waste resources. Classic webhooks use HMAC secrets that are hard to rotate, bind poorly to XL1 identity, and invite “URL as authority” mistakes.

Event Kit’s answer: the wake **body** is a strict XYO Payload; auth is a short-lived **ES256K XL1 wallet JWT** whose `eventHash` binds to that body; **authorization** is a live **Statement Graph grant** for publisher *P* on a deployment/queue **plus** the one active, accepted D-005 subscription that binds the receiver's exact route — not a shared secret, and never a grant alone.

---

## Concepts

### Three different contracts

| Contract | Meaning |
|----------|---------|
| **Wake** (Event Kit) | Signed admission + enqueue hint (`wakeId`, source position range, payload, JWT) |
| **Statement Graph grant + D-005 handshake** | On-chain allowlist that publisher *P* may enqueue for a deployment/queue, plus the publisher service, encrypted subscription, endpoint challenge, and publisher acceptance that select one active route |
| **dapp-kit durable event / cursor** | Host-local ordered log and consumer fence — **not** the wake itself |

Never treat wake delivery ranges as chain progress or as a substitute for finalized fold.

### Sources and delivery modes (D-006, D-007)

| Source `kind` | Pinned identity | Inclusive position |
|---------------|-----------------|--------------------|
| `xl1-finalized` | XL1 chain ID | Finalized block height |
| `ethereum-finalized` | Decimal chain ID + genesis hash | Height from the `finalized` tag |
| `utc-interval` | `scheduleId`, `anchorSeconds`, `intervalSeconds` | Completed interval index (0 = `[anchor, anchor + duration)`) |

`authorizationChainId` always names the XL1 chain that carries grants and handshake claims — never an Ethereum chain ID, a block height, or an interval index. Never compare source positions with XL1 authorization heights.

`deliveryMode` is required on service, filter, subscription, wake, and route, with no missing-field default or legacy alias:

- **`durable`** — contiguous ranges, receipts, `WakeQueue` leases and recovery.
- **`best-effort`** — point hints `[H,H]` under an exact `bestEffort` policy (`refreshIntervalSeconds`, `maxHintAgeSeconds`, `maxAttempts`); gaps, duplicates, and reordering are allowed. An admitted hint is only a scheduling hint — the receiver re-verifies the current source snapshot.

### No HMAC profile

Wire format: raw wake Payload + `Authorization: Bearer <JWT>`. There is **no** shipped shared-secret HMAC admission profile.

### `wakeId` vs JWT `jti`

| | `wakeId` | `jti` |
|--|----------|-------|
| Role | Logical wake + idempotency key | Per delivery attempt |
| Retries | **Reuse** (stable `eventHash`) | **Fresh** every mint |

Inbox keys collide closed on conflicting `(aud, iss, wakeId)` / hash pairs.

### Grant vocabulary (Statement Graph)

Namespace `network.xyo.event.wake`:

| Schema | Role |
|--------|------|
| `network.xyo.event.wake.envelope` | Wake payload body: `{ authorizationChainId, deploymentId, wakeId, deliveryMode, source, fromPosition, toPosition, filterHash, issuedAt, queueId? }` |
| `network.xyo.event.wake.jwt` | JWT `schema` claim (`typ` remains `JWT`) |
| `network.xyo.event.wake.grant` | `{ grantId, deploymentId, publisher, queueId?, permissions: ['enqueue'] }` — Claim `source` = controller, `subject` = publisher; the body's `publisher` must equal the Claim `subject` |
| `network.xyo.event.wake.grant.revocation` | `{ grant: <grant objectHash> }` — claimed by the pinned controller only, `subject` = publisher |
| `network.xyo.event.wake.publisher`, `.publisher.key`, `.subscription`, `.challenge` / `.challenge.response`, `.subscription.acceptance` | D-005 handshake: service advertisement, encryption key, HPKE-encrypted subscription, endpoint challenge, publisher acceptance. Service, key, subscription, and acceptance each have a `.revocation` form |

Event Kit schema names remain unversioned. Do not propose `.v2` or other structural suffixes for successors: new structure revisions follow [Payload Schema Evolution and Identity](../xyo-knowledge/payload-schema-evolution.md). Existing Event Kit JWT/envelope/hash contracts still require their own coordinated version-support migration; adding `$version` to a strict legacy envelope is not automatically supported. `grantId` is 16 cryptographically random bytes encoded as 32 lowercase hexadecimal characters. It stays stable when retrying or republishing the same logical grant; re-enabling after revocation creates a new grant object with a fresh `grantId`.

Grants are ordinary SG objects: **claim** to publish; **claim a revocation object** to negate (no SG revoke verb). Because they are claimed through Statement Graph, grant and revocation objects cannot carry `$` client metadata such as `$version` (see [Statement Graph — Existing hash contract](statement-graph.md#existing-hash-contract)), so a structure revision of either object cannot be expressed as a `$version` bump while that data-hash contract stands.

Every Event Kit Claim of a grant or of its revocation uses `source` = the pinned controller *C* and `subject` = the publisher address *P*. Authorization requires the grant Claim's `subject` **and** the grant body's `publisher` both to equal the requested publisher; neither field substitutes for the other. A revocation counts only when the same pinned controller claims it with the same publisher subject; one claimed by any other source is ignored. Event Kit's grant reader currently selects revocation Claims by their declared schema and needs the revocation body to resolve, so publish revocations under their exact schema with the body inserted into the datalake that Event Kit's grant replay reads.

---

## Packages

| Package | Role |
|---------|------|
| `@xyo-network/event-kit-schemas` | Envelope / source / delivery-mode / grant / handshake / JWT Zod + NSIDs |
| `@xyo-network/event-kit-protocol` | `verifyWakeRequest`, `admitAndEnqueue`, `AtomicWakeInbox`, `WakeQueue` + `drainQueue`, `parseAdmittedWake`, HPKE subscription and endpoint-challenge helpers |
| `@xyo-network/event-kit-http` | `createActiveSourceWakeHttpHostAdapter` / `createActiveSourceBestEffortHttpHostAdapter`, `createFixedWindowRateLimiter` |
| `@xyo-network/event-kit-actor` | Publisher actor, wallet wake signer, cursor / outbox ports |
| `@xyo-network/event-kit-node` | SQLite receiver authority (`createSqliteWakeReceiver`, `createSqliteBestEffortInbox`, `createBestEffortSnapshotWorker`), handshake clients, source publisher runtime |
| `@xyo-network/event-kit-statement-graph` | SG grant + D-005 handshake read models, `createActiveSourceWakeGrantAuthorizer` |
| `@xyo-network/event-kit-xl1` | Finalized head source; publishes subject-bearing handshake Claims over xl1-sdk |
| `@xyo-network/event-kit-cli` | `event-kit` CLI: D-005 handshake commands and the resident publisher (`event-kit publisher run --config publisher.json`) |
| `@xyo-network/event-kit-provider` | Actor-kit provider client for admitted wakes |
| `@xyo-network/event-kit-example` | Checkpointing range-reducer example |
| `@xyo-network/event-kit-testing` | WakeQueue conformance harness |
| `@xyo-network/event-kit-vitest-config` | Vitest preset owning a local chain, REST datalake, publisher, and HTTPS receivers |

---

## Hash and version boundary

Use the shipped Event Kit helpers for `eventHash`, grant hashes, and JWT binding.
Do not replace their prescribed hash algorithm because new applications default
to root hashes. If a contract uses a data hash, that hash excludes `$version`;
select its allowed grammar/authentication policy independently and never let an
unbound revision choose weaker admission rules. Envelope version support, hash
bindings, issuer/receiver rollout, and historical grants must be migrated together.

## Admission flow (receiver)

1. **Replay authorization.** Replay finalized Statement Graph history for the pinned authorization chain and publisher into a grant read model and the D-005 handshake read model. Read the uncapped live finalized head independently (e.g. `createXl1FinalizedHeadSource` from `event-kit-xl1`).
2. **Authorizer.** `createActiveSourceWakeGrantAuthorizer({ route, publisher, serviceHash, grantHash, viewer, handshake })` from `event-kit-statement-graph`. Both views must have reached that same head. The immutable `route` carries `audience`, `authorizationChainId`, `controller`, `deploymentId`, `queueId?`, `source`, `deliveryMode` (+ `bestEffort`), `subscriptionHash`, canonical `filterHash`, `fromPosition`, `maxPositionsPerWake`, and `maxGrantLagBlocks`. Admission needs exactly one active accepted subscription binding that route, service, and grant — **a grant alone is insufficient**.
3. **Public URL.** `createActiveSourceWakeHttpHostAdapter({ authorization, headSource, inbox, rateLimiter, maxBodyBytes, maxDecodedBodyBytes, maxHeaderBytes, requestTimeoutMs })` from `event-kit-http`, with a durable `AtomicWakeInbox<AdmittedWake>` (e.g. `createSqliteWakeReceiver(...).inbox`). The adapter enforces a **required** bounded pre-auth `RateLimiter` keyed by trusted transport identity (socket or explicitly trusted proxy — never request headers), streamed header/body caps, and a deadline. Then: Bearer JWT → **`verifyWakeRequest`** (profile, `eventHash` vs body, audience / deployment / queue / source / filter binding) → trusted finalized head → **`admitAndEnqueue`** (`jti` / `wakeId` replay check, live grant + activation within `maxGrantLagBlocks`, one atomic commit + enqueue). **202** enqueued / **200** duplicate receipt. **Do not run the reducer on the public URL.** Best Effort routes use `createActiveSourceBestEffortHttpHostAdapter` with an `AtomicBestEffortInbox` instead.
4. **Worker.** In a separate bounded worker, lease from `WakeQueue<AdmittedWake>`, call `parseAdmittedWake` (stored-integrity check only — it cannot authenticate caller-supplied records), independently validate source progress, commit idempotent results, then `ack`.

### WakeQueue (consumer)

Lease port: `append` / `claim` → `LeasedWake { wake, ack, release }` / `pendingCount` / `recoverInflight({ consumersStopped: true })`. `ack` and `release` live on the lease; a stale lease throws `StaleWakeLeaseError`. Call `recoverInflight` only after **every** consumer sharing the store (other processes included) has stopped — it invalidates all leases, and startup alone does not prove quiescence. `drainQueue(queue, handler)` drains serially, acking on success and releasing on throw. `createSqliteWakeReceiver` gives one inbox + queue authority; split inbox/queue stores are rejected. Delivery is **at-least-once** — consumer handlers must be idempotent.

Best Effort has no `WakeQueue`: hints commit to an `AtomicBestEffortInbox` (`createSqliteBestEffortInbox`), and `createBestEffortSnapshotWorker` runs the independently verified snapshot loop.

---

## Anti-patterns

| Don't | Do |
|-------|-----|
| HMAC / shared-secret “webhook secret” | Wallet JWT + SG grant + D-005 activation |
| Authorize on a live grant alone | `createActiveSourceWakeGrantAuthorizer` with the handshake read model and a route carrying `subscriptionHash` + `filterHash` |
| Expose the decoded gate without host bounds | `createActiveSourceWakeHttpHostAdapter`: pre-auth `RateLimiter`, size caps, deadline |
| Treat wakes as chain finality | Fold/index from finalized XL1; wakes only schedule work |
| Compare Ethereum heights or interval indexes with XL1 heights | Keep source positions and `authorizationChainId` separate |
| Run heavy reducers on the admit URL | Enqueue, then drain via `WakeQueue` |
| Call `recoverInflight` at startup while other consumers may run | Stop every consumer first, then pass `{ consumersStopped: true }` |
| Invent grant revoke RPCs | Claim `grant.revocation` via Statement Graph |
| Reuse JWT `jti` across retries | Fresh `jti`; stable `wakeId` |

---

## Cross-references

- [Statement Graph](statement-graph.md)
- [XL1 dApp Kit](../xl1-dapp-kit/SKILL.md) / [Events and wakes](../xl1-dapp-kit/events-and-wakes.md) — how hosts turn admitted wakes into durable application events
- Upstream: `XYOracleNetwork/event-kit` papers (`EVENT_KIT_WHITE_PAPER.md`, Yellow Paper, D-002 through D-007, `ON_CHAIN_PUBLISHER_ROADMAP.md`, and `RESIDENT_PUBLISHER.md`)
