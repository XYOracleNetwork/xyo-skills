# Authenticated Wake Delivery (Event Kit)

Read this when a sleepable indexer / host must be **woken by wallet-authenticated, allowlisted publishers** — not by shared-secret HMAC webhooks.

Event Kit delivers **wakes** (scheduling hints). It does **not** replace chain truth, statement-graph folds, or dapp-kit durable event logs.

**Builds on:**
- [Statement Graph](statement-graph.md) — grant / revocation objects claimed on XL1
- [Node Gateway](../xl1-knowledge/gateway-node.md) — finalized head for grant lag checks
- [XL1 dApp Kit — Events](../xl1-dapp-kit/events-and-wakes.md) — how hosts turn admitted wakes into durable application events

**Maturity:** `@xyo-network/event-kit-*` at **0.0.x**, restricted npm. Papers + D-002/D-003 accepted; partner / multi-node / `v0.1.0` publish gates still open. Teach the architecture; do not claim production multi-host conformance yet.

---

## The Problem

Indexers that only poll waste resources. Classic webhooks use HMAC secrets that are hard to rotate, bind poorly to XL1 identity, and invite “URL as authority” mistakes.

Event Kit’s answer: the wake **body** is a strict XYO Payload; auth is a short-lived **ES256K XL1 wallet JWT** whose `eventHash` binds to that body; **authorization** is a live **Statement Graph grant** for publisher *P* on a deployment/queue — not a shared secret.

---

## Concepts

### Three different contracts

| Contract | Meaning |
|----------|---------|
| **Wake** (Event Kit) | Signed admission + enqueue hint (`wakeId`, payload, JWT) |
| **Statement Graph grant** | On-chain allowlist that publisher *P* may enqueue for a deployment |
| **dapp-kit durable event / cursor** | Host-local ordered log and consumer fence — **not** the wake itself |

Never treat wake delivery ranges as chain progress or as a substitute for finalized fold.

### No HMAC profile

Wire format: raw wake Payload + `Authorization: Bearer <JWT>`. There is **no** shipped shared-secret HMAC admission profile.

### `wakeId` vs JWT `jti`

| | `wakeId` | `jti` |
|--|----------|-------|
| Role | Logical wake + idempotency key | Per delivery attempt |
| Retries | **Reuse** (stable `eventHash`) | **Fresh** every mint |

Inbox keys collide closed on conflicting `(aud, iss, wakeId)` / hash pairs.

### Grant vocabulary (Statement Graph v2)

Namespace `network.xyo.event.wake`:

| Schema | Role |
|--------|------|
| `network.xyo.event.wake.envelope.v1` | Wake payload body |
| `network.xyo.event.wake.jwt.v1` | JWT `schema` claim (`typ` remains `JWT`) |
| `network.xyo.event.wake.grant.v1` | `{ deploymentId, publisher, queueId?, permissions: ['enqueue'] }` |
| `network.xyo.event.wake.grant.revocation.v1` | `{ grant: <grant objectHash> }` — claimed by pinned controller only |

Grants are ordinary SG objects: **claim** to publish; **claim a revocation object** to negate (no SG revoke verb). Re-enable = new grant object.

---

## Packages

| Package | Role |
|---------|------|
| `@xyo-network/event-kit-schemas` | Envelope / grant / JWT Zod + NSIDs |
| `@xyo-network/event-kit-protocol` | `verifyWakeRequest`, `admitAndEnqueue`, `WakeQueue` |
| `@xyo-network/event-kit-http` | HTTP admit-and-enqueue gate |
| `@xyo-network/event-kit-actor` | Publisher actor, wake id helpers |
| `@xyo-network/event-kit-node` | FS/SQLite queue + cursors |
| `@xyo-network/event-kit-statement-graph` | SG viewer → grant read model |
| `@xyo-network/event-kit-xl1` | Finalized head source over xl1-sdk |
| `@xyo-network/event-kit-testing` | WakeQueue conformance harness |

---

## Admission flow (receiver)

1. Optional rate limit (`event-kit-http`).
2. Extract Bearer JWT; **`verifyWakeRequest`** (pure): profile, `eventHash` vs body, audience/deployment/queue binding.
3. Read **trusted finalized head** (independent of grant view).
4. **`admitAndEnqueue`**: durable inbox for `(jti` / `wakeId)` → authorize publisher via live grant view (respect `maxGrantLagBlocks`) → commit + enqueue.
5. HTTP: **202** enqueued / **200** duplicate receipt. **Do not run the reducer on the public URL.**

### WakeQueue (consumer)

Lease port: `append` / `claim` / `ack` / `release` / `recoverInflight` (+ `pendingCount`). Delivery is **at-least-once** — consumer handlers must be idempotent.

---

## Anti-patterns

| Don't | Do |
|-------|-----|
| HMAC / shared-secret “webhook secret” | Wallet JWT + SG grant |
| Treat wakes as chain finality | Fold/index from finalized XL1; wakes only schedule work |
| Run heavy reducers on the admit URL | Enqueue, then drain via `WakeQueue` |
| Invent grant revoke RPCs | Claim `grant.revocation.v1` via Statement Graph |
| Reuse JWT `jti` across retries | Fresh `jti`; stable `wakeId` |

---

## Cross-references

- [Statement Graph](statement-graph.md)
- [XL1 dApp Kit](../xl1-dapp-kit/SKILL.md) / [Events and wakes](../xl1-dapp-kit/events-and-wakes.md)
- Upstream: `XYOracleNetwork/event-kit` papers (`EVENT_KIT_WHITE_PAPER.md`, Yellow Paper, D-002/D-003)
