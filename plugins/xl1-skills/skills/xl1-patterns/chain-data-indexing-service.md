# Chain Data Indexing — Service

How to run a chain data indexer as a long-lived service: process model, state persistence, restart/resume semantics, exposing results, and deployment. This is the operator side of the [Chain Data Indexing](chain-data-indexing-protocol.md) pattern.

**Scope:** server-side indexers — the long-running operator role. For protocol-level rules (which scan strategy, schema design, anchoring choices), see [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md). For browser clients consuming an indexer's output, see [Chain Data Indexing — Client](chain-data-indexing-client.md).

**Builds on:**
- [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md) — conceptual rules (finalized vs latest, scan strategies, schemas)
- [Node Gateway](../xl1-knowledge/gateway-node.md) — server-side gateway construction
- [Datalakes](../xl1-knowledge/datalakes.md) — what the indexer actually reads through the gateway viewer
- [Identity & Signing](../xyo-knowledge/identity.md) — key primitives for signer indexers

---

## Why a Service

An indexer's job is to read every finalized block, derive durable application state, and expose it. That requires:

- **Persistence between sessions** — restart-resume from `lastProcessedBlock`, not from genesis
- **Public reachability** — clients query the indexer's results, not the chain directly
- **Reliability** — long-running, supervised, monitored for lag
- **Signer custody (sometimes)** — if the indexer also signs settlements, attestations, or authority decisions

A browser tab cannot satisfy any of these. Even an in-page indexer for a single user would re-walk the chain from zero on every visit. Services do this work once and serve the result.

---

## Process Model

A typical XL1 indexer service has three loops:

1. **Sync loop** — poll `viewer.finalization.headNumber()`, walk new finalized blocks, dispatch payloads through application handlers, advance `lastProcessedBlock`.
2. **Persist loop** — periodically (or on each block boundary) write the indexer state and `lastProcessedBlock` checkpoint to durable storage.
3. **Serve loop** — expose state via HTTP / GraphQL / whatever protocol the consumer needs.

The three loops can share a single Node process. They communicate through shared in-memory state guarded by appropriate concurrency primitives (or a single async run-loop, which is simpler).

```ts
async function indexerMain() {
  const gateway = await getServerGateway()
  const state = await loadStateFromCheckpoint()

  startHttpApi(state, port)

  while (true) {
    const head = Number(await gateway.connection.viewer!.finalization.headNumber())
    while (state.lastProcessedBlock < head) {
      const next = state.lastProcessedBlock + 1
      const block = await gateway.connection.viewer!.block.blockByNumber(next)
      if (block) applyBlock(state, block)
      state.lastProcessedBlock = next
      if (next % CHECKPOINT_INTERVAL === 0) await saveCheckpoint(state)
    }
    await saveCheckpoint(state)
    await sleep(POLL_INTERVAL_MS)
  }
}
```

For per-block dispatch logic, see [Inscription Substrate — Replay loop](inscription-substrate.md#replay-loop) for a worked example covering the substrate's events.

---

## State Persistence

Indexer state is **derived** from the finalized chain stream — given the same stream and the same code, two operators arrive at byte-identical state. This determinism shapes how persistence works:

- **Checkpoints are an optimization, not authoritative.** A corrupted or lost checkpoint means replay-from-zero, but the result is the same. Plan for the rebuild, don't fear it.
- **The store should be local.** Reading from a remote DB on every block makes the sync loop network-bound. LMDB, SQLite, or an in-memory map with periodic snapshots all work. Pick by state size, not by buzzword fit.
- **Atomic writes.** A crash mid-write must not leave inconsistent state. Either the checkpoint includes everything or replay tolerates the gap (replays the partial range).

A simple, robust pattern:

```ts
import { promises as fs } from 'node:fs'

type IndexerState = {
  lastProcessedBlock: number
  // ... application-specific derived state
}

async function saveCheckpoint(state: IndexerState) {
  const tmp = `${CHECKPOINT_PATH}.tmp`
  await fs.writeFile(tmp, JSON.stringify(state))
  await fs.rename(tmp, CHECKPOINT_PATH) // atomic on POSIX
}
```

For larger state, use LMDB or SQLite — same pattern, write-then-rename for atomicity.

---

## Restart and Resume

On startup:

1. Load `lastProcessedBlock` from checkpoint (default 0 if missing).
2. Resume the sync loop from `lastProcessedBlock + 1`.
3. **Always replay from finalized blocks only.** A reorg can rewrite unfinalized blocks; the indexer must never derive state it would later have to roll back. Use `viewer.finalization.headNumber()` as the upper bound, never `viewer.block.currentBlockNumber()`.

If the checkpoint is corrupted or older than expected, replay from earlier — the determinism property makes this safe. Document the worst-case replay time in operations notes; it scales linearly with chain depth.

---

## Exposing Results

The indexer's API is application-specific, but a few patterns recur:

- **Read-mostly endpoints.** `GET /balance/:address`, `GET /artifact/:id` — straight reads from the in-memory map.
- **Pagination by index, not by cursor.** Indexer state is a deterministic function of block height, so `?fromBlock=...&toBlock=...` is a natural pagination boundary.
- **Lag headers.** Surface `X-Indexer-Last-Block` and `X-Chain-Head` so consumers can detect indexer staleness vs chain liveness.
- **No write endpoints unless the indexer is also a signer** — see below.

```ts
import express from 'express'

function startHttpApi(state: IndexerState, port: number) {
  const app = express()
  app.get('/balance/:address', (req, res) => {
    res.set('X-Indexer-Last-Block', String(state.lastProcessedBlock))
    res.json({
      address: req.params.address,
      balance: state.balances.get(req.params.address) ?? '0',
    })
  })
  app.listen(port)
}
```

---

## Signer Indexers

Some patterns require the indexer to **also act as an authoritative signer** — a market operator that signs settlement BoundWitnesses, an escrow service that releases held funds, an oracle that attests to off-chain facts.

The indexer is then both a *reader* (deriving state from the chain) and a *writer* (submitting transactions back). This shifts requirements:

- **Key custody.** The signing key is loaded at startup (env var holding a seed phrase, or HSM-backed). See [Identity & Signing](../xyo-knowledge/identity.md) for `Account.create({ mnemonic })` and `HDWallet.fromPhrase`. A write-capable Node-side gateway construction is not yet documented in this skill set — see [Node Gateway § Write Path](../xl1-knowledge/gateway-node.md).
- **Idempotency on the write side.** A submitted transaction may be observed by the indexer's own sync loop; the application logic must not double-submit. Track submitted-transaction hashes in state.
- **Restart safety.** A signer that crashes mid-decision must not re-submit on restart. Persist intent (decided to settle X) before submitting; on restart, check whether the chain already contains the result before retrying.

---

## Deployment Shape

- **Process supervision.** systemd, Docker with `restart: always`, Kubernetes — anything that restarts the process on crash. The indexer's resume-from-checkpoint behavior makes restart cheap.
- **Single instance.** Most indexers don't horizontally scale — running two instances means two competing checkpoint writers. Scale read traffic with a stateless read API in front of the single indexer process.
- **Health checks.** A `/healthz` endpoint that returns 200 only if `headNumber - lastProcessedBlock < threshold` catches lag automatically. Wire it to your load balancer or supervisor.
- **Network identifier from env.** The same indexer code runs against `mainnet` / `sequence` / `local`. Drive selection from an env var; never hardcode.

---

## Anti-Patterns

| Anti-pattern | Why it fails | Do this instead |
|---|---|---|
| Indexing in a browser tab | No persistence, no public reachability, every visitor re-indexes from zero | Run as a service; serve clients from its API |
| Replay from `currentBlockNumber()` instead of `finalization.headNumber()` | Reorg-vulnerable derived state — indexer history can silently roll back | Always upper-bound the sync loop on finalized head |
| Writing checkpoints without atomicity | Crash mid-write corrupts state; resume produces wrong results | Write to `.tmp` then atomic `rename` (or use a DB with native atomicity) |
| Running multiple instances of the same indexer | Competing checkpoint writes, divergent or corrupted state | Single instance for the indexer; horizontal-scale the read API in front of it |
| Exposing unfinalized state via the API | Clients see ghost state that disappears on reorg | API surface should reflect only finalized-block-derived state |
| Blocking the sync loop on every API request | Indexer falls behind chain head when traffic spikes | Read API queries an in-memory snapshot; sync loop runs independently |
| No lag monitoring | Indexer silently falls hours behind, clients get stale data without warning | Surface lag in `/healthz` and dashboards; alert when threshold exceeded |

---

## Cross-References

- [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md) — conceptual rules (scan strategies, schema design, anchoring choices)
- [Chain Data Indexing — Client](chain-data-indexing-client.md) — browser-side consumption of indexer output
- [Inscription Substrate — Replay loop](inscription-substrate.md#replay-loop) — worked example of a global-walk indexer
- [Node Gateway](../xl1-knowledge/gateway-node.md) — server-side gateway construction
- [Datalakes](../xl1-knowledge/datalakes.md) — datalake reads through the gateway viewer
- [Identity & Signing](../xyo-knowledge/identity.md) — key primitives if the indexer also signs
