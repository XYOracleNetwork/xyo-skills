# Chain Data Indexing — Client

How a browser client reads chain data — React hooks, polling intervals, capability detection. This is the user-facing companion to [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md).

> **Hard rule: browser indexing is for ephemeral, single-user, trivial reads only.** Anything that needs to persist across sessions, be visible to other users, derive durable state, or survive a tab refresh must read from a server-side indexer. See [Chain Data Indexing — Service](chain-data-indexing-service.md) for that path.

**Builds on:**
- [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md) — schemas, scan strategies, polling concept
- [Chain Data Indexing — Service](chain-data-indexing-service.md) — the answer for anything beyond ephemeral
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `useProvidedGateway` for gateway access
- [Browser UX](browser-ux.md) — capability detection, display conventions, lifting state into context
- [In-Page Data Lakes](in-page-datalakes.md) — read-only browsing without a wallet

---

## When Browser Indexing Is Fine

Reading directly from the chain in the browser is appropriate for a narrow set of cases:

- **Ephemeral status** — "tx-just-submitted" toasts, "live" block-height tickers, mempool peeks. State that can disappear on refresh and that's fine.
- **Single-user views** — the connected user's own moves, their own balance, their own recent activity. Re-walking from scratch is cheap when you only care about one address over a small range.
- **Pre-MVP and prototyping** — getting a feature into a demo before standing up real infrastructure. Migrate to a service indexer before declaring the work done.
- **Bounded lookups** — viewing a specific block, transaction, or hash you already have. Not a scan, not a derivation.

In all of these cases, the browser is doing trivial work — small range, ephemeral output, single user, no reorg sensitivity.

## When Browser Indexing Is Wrong

The moment any of these is true, you need a service indexer:

- Multiple users see the same derived data (leaderboards, public history, market state)
- The data must persist across visits without re-walking from zero
- State derives durable application logic (ownership, balances, settlement) — reorg-vulnerable browser polling silently corrupts these
- A fresh visit would take more than a few seconds to walk
- You want to expose the data to non-browser clients (mobile, integrations, automated tools)

These are not edge cases — they cover most production dApp needs. The pattern is: read derived state from a service indexer's HTTP API, not by re-walking the chain in every browser tab. The browser's job is to render results that a service has already computed.

---

## React Hook for Polled Reads (ephemeral only)

Wrap the protocol-level `pollForNewData` recipe (defined in [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md)) in a hook with an interval. `useChainData` is a recipe you write, not an SDK export:

```ts
import { useProvidedGateway } from '@xyo-network/xl1-react-client-sdk'
import { useEffect, useRef, useState } from 'react'
import type { Payload, Schema } from '@xyo-network/sdk'

function useChainData(schemas: Schema[], intervalMs = 5000) {
  const { defaultGateway } = useProvidedGateway()
  const [data, setData] = useState<Payload[]>([])
  const lastBlockRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!defaultGateway) return

    const poll = async () => {
      if (lastBlockRef.current === undefined) {
        // A new-arrivals feed starts at the current head — seeding with 0
        // would make the first poll walk the whole chain from genesis
        const viewer = defaultGateway.connection.viewer
        if (!viewer) return
        lastBlockRef.current = Number(await viewer.block.currentBlockNumber())
        return
      }
      const { payloads, latestBlock } = await pollForNewData(
        defaultGateway,
        lastBlockRef.current,
        schemas,
      )
      if (payloads.length > 0) {
        setData(prev => [...prev, ...payloads])
      }
      lastBlockRef.current = latestBlock
    }

    const id = setInterval(poll, intervalMs)
    poll() // initial fetch
    return () => clearInterval(id)
  }, [defaultGateway, schemas, intervalMs])

  return data
}
```

### Notes on the hook

- **`currentBlockNumber()` vs `finalization.headNumber()`** — for ephemeral feeds (a tx-just-submitted toast, a recent-activity ticker), polling current block is fine. For derived state that drives durable UI (leaderboards, ownership views), the source of truth should be a service indexer reading finalized blocks, not a browser hook.
- **Cleanup is required.** The `clearInterval` in the cleanup function prevents the poll loop from outliving the component or doubling up on re-render.
- **`defaultGateway` may be `undefined`.** Guard with the early-return; the effect re-runs when the gateway becomes available.

`useChainData` walks **forward** from `lastSeenBlock + 1`. That fits "subscribe to new payloads as they arrive." For "show me the user's last N matching things" — by far the more common browser shape — walk *backward* instead.

---

## Recency-Biased Reads — Walking Backward From Head

The hook above is wrong-shaped for most browser views. UIs typically want "the latest N matching payloads," not "everything since I last looked." Walking forward from `lastSeenBlock + 1` is fine when you're streaming new data into a feed; it's wasteful when you only need the latest few.

The right shape: walk **backward** from `currentBlockNumber()`, accumulate matches, stop when you have N. See [Chain Data Indexing — Protocol § Direction of Iteration](chain-data-indexing-protocol.md#direction-of-iteration) for why.

For a bounded dApp (one querying its own self-authored schemas — see [Floor Block](chain-data-indexing-protocol.md#floor-block)), the walk also bounds at the floor. Without it, a UI for a connected wallet that has zero matching payloads runs an unbounded scan toward genesis — slow, RPC-quota-burning, and at risk of rendering pre-deployment matches that cannot be this dApp's data. The same `INDEXER_FLOOR_BLOCK` the service indexer reads from `.env` is exposed to the browser via Vite as `VITE_INDEXER_FLOOR_BLOCK`.

`fetchRecent` below is a recipe you write, not an SDK export:

```ts
import type { Hash } from '@ariestools/sdk'
import type { Payload, Schema } from '@xyo-network/sdk'
import { isAnyPayload } from '@xyo-network/sdk'
import type { XyoGateway, XyoGatewayRunner } from '@xyo-network/xl1-sdk'
import {
  asXL1BlockNumber, createRestDataLakeViewer, isTransactionBoundWitness, NetworkDataLakeUrls, SequenceNetwork,
} from '@xyo-network/xl1-sdk'

const FLOOR_BLOCK = Number(import.meta.env.VITE_INDEXER_FLOOR_BLOCK ?? 0)

// Off-chain bodies come from the dApp's own datalake — the endpoint its submit
// path writes to (see In-Page Data Lakes § Datalake Client Setup)
const DATALAKE_ENDPOINT = import.meta.env.VITE_DATALAKE_ENDPOINT ?? NetworkDataLakeUrls[SequenceNetwork.id]
const datalakeViewer = await createRestDataLakeViewer(DATALAKE_ENDPOINT)

async function fetchRecent(
  gateway: XyoGateway | XyoGatewayRunner,
  schemas: Schema[],
  count: number,
  maxBlocksToScan = 10_000, // bound the walk so a sparse match doesn't run forever
): Promise<Payload[]> {
  const viewer = gateway.connection.viewer
  if (!viewer) throw new Error('Gateway has no viewer attached')

  const head = Number(await viewer.block.currentBlockNumber())
  // Two safety nets: the time-bound (don't scan too far back) and the floor (don't read pre-app blocks).
  const stopBlock = Math.max(FLOOR_BLOCK, head - maxBlocksToScan)
  const results: Payload[] = []

  for (let n = head; n >= stopBlock && results.length < count; n--) {
    const hydrated = await viewer.block.blockByNumber(asXL1BlockNumber(n, true))
    if (!hydrated) continue
    const [, payloads] = hydrated

    // Two-step: block payloads are on-chain only. Match `schemas` on each
    // TransactionBoundWitness, then fetch the referenced payloads by hash
    // from the datalake — no gateway read returns them.
    const hashes: Hash[] = []
    for (const p of payloads) {
      if (!isTransactionBoundWitness(p)) continue
      for (let i = 0; i < p.payload_hashes.length; i++) {
        if (schemas.includes(p.payload_schemas[i])) hashes.push(p.payload_hashes[i])
      }
    }
    if (hashes.length === 0) continue

    const fetched = (await datalakeViewer.get(hashes)).filter(isAnyPayload)
    results.push(...fetched.slice(0, count - results.length))
  }

  return results
}
```

Filtering `blockByNumber(n)[1]` by `p.schema` finds nothing for Path-A application data: that array holds only the block's on-chain payloads, and the app payloads are referenced by hash from each `TransactionBoundWitness`, with their bodies in the datalake — see [Protocol § Via Block Walk](chain-data-indexing-protocol.md#via-block-walk--schema-discovery-from-the-chain).

For an unbounded browser view (e.g., a recent-transfers feed), `VITE_INDEXER_FLOOR_BLOCK` is set to `0` and the floor safety net falls away — only the time-bound applies. The `payload_schemas[]` match only decides which hashes to fetch; the structural filter on the fetched payloads is the dApp's Zod-factory guard — `payloads.filter(isMovePayload)` instead of a schema-string check — which validates shape and rejects most collisions on its own. See [Chain Data Indexing — Protocol § The honor question](chain-data-indexing-protocol.md#the-honor-question) for when authorship discriminators (signer scoping, sentinel filtering) layer on top.

### React hook wrapper

`useRecentChainData` is likewise your own code, not an SDK export:

```ts
function useRecentChainData(schemas: Schema[], count: number) {
  const { defaultGateway } = useProvidedGateway()
  const [data, setData] = useState<Payload[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!defaultGateway) return
    let cancelled = false

    fetchRecent(defaultGateway, schemas, count).then((payloads) => {
      if (!cancelled) {
        setData(payloads)
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [defaultGateway, schemas, count])

  return { data, loading }
}
```

### When to use which hook

| Use case | Hook |
|----------|------|
| "Show the user their last 10 moves" | `useRecentChainData` (backward) |
| "Show the most recent activity in this market" | `useRecentChainData` (backward) |
| "Render a feed that grows as new payloads arrive" | `useChainData` (forward) |
| "Toast when a tx I just submitted appears" | `useChainData` (forward, but stop after seeing it) |

Always bound the backward walk with `maxBlocksToScan`. A schema with sparse matches can otherwise scan to genesis on a fresh chain, which is slow and wastes RPC quota. Pick a bound based on how recent "recent" needs to be for your UI; for activity feeds, a few thousand blocks is usually plenty.

For multi-user or durable-state views, neither hook is the answer — see [Chain Data Indexing — Service](chain-data-indexing-service.md).

---

## Capability Detection in Components

A component that *reads* indexed data needs no wallet: public, multi-user views fetch the service indexer's API, and bounded chain reads need only the read-capable gateway. A component that *submits* data needs the write-capable runner. See [Browser UX — Capability-Aware Components](browser-ux.md) for the full pattern.

```tsx
function GameHistory() {
  // Public history is a multi-user view — read the service indexer, not useChainData
  const [games, setGames] = useState<GameSummary[]>([])
  useEffect(() => {
    void fetch('/api/games').then(res => res.json() as Promise<GameSummary[]>).then(setGames)
  }, [])
  return <List items={games} />  // works for any visitor, no wallet needed
}

function SubmitMoveButton({ address, payloads }: { address?: XyoAddress; payloads: Payload[] }) {
  const { defaultGateway } = useProvidedGateway()
  // A runner means the wallet is installed; the lifted, granted account means it is connected
  const canSubmit = address !== undefined && defaultGateway !== undefined && 'addPayloadsToChain' in defaultGateway
  if (!canSubmit) return null
  // ...
}
```

This split makes the read view available pre-wallet (the same-origin `/api/*` route needs no gateway — see [Browser ↔ Service Wiring](browser-service-wiring.md); bounded chain reads use the in-page gateway in a hybrid `GatewayProvider` + `InPageGatewaysProvider transport="rest"` setup) and gates writes on the wallet.

---

## Display Conventions

Indexed data in browser views is full of hashes and addresses (game IDs, player addresses, transaction hashes). Always clamp them and provide copy-to-clipboard — see [Browser UX — Display Conventions](browser-ux.md) for the rule and reference implementation.

---

## Anti-Patterns

| Anti-pattern | Why it fails | Do this instead |
|---|---|---|
| **Building a leaderboard, public history, or any multi-user view by polling the chain in the browser** | Every visitor re-walks from zero; reorg-vulnerable; no shared cache; users see drifting versions of the same state | Stand up a service indexer ([Chain Data Indexing — Service](chain-data-indexing-service.md)); the browser fetches its API |
| **Deriving ownership, balances, or settlement state from in-browser polling** | Reorgs silently corrupt your derived state; users see and act on phantom data that may never have been real | Service indexer reading finalized blocks only |
| Polling unfinalized state to drive any UI that won't tolerate being wrong | Reorgs roll back state your UI already showed | Read from a finalized-only service indexer |
| One `useChainData` per component, all polling the chain head | N components × poll interval × users = quadratic load on the gateway | Lift the polled state into a context provider; share results |
| Forgetting `clearInterval` cleanup | Effect leaks, doubles polling on re-render, lingers after unmount | Always return a cleanup function from the effect |
| Re-walking the chain from genesis on every page load | Slow first paint; wastes RPC quota; doesn't scale past trivial ranges | Persist `lastSeenBlock` in `sessionStorage` for the same-session ephemeral case, OR consume from a service for anything else |
| Treating the browser hook as a real indexer | No persistence, no public API, no reorg safety, every visitor re-walks | Service indexer per [Chain Data Indexing — Service](chain-data-indexing-service.md) — the browser is a renderer, not an indexer |

---

## Cross-References

- [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md) — conceptual rules, scan strategies, schema design
- [Chain Data Indexing — Service](chain-data-indexing-service.md) — when to graduate from in-browser polling to a real indexer service
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `useProvidedGateway` and the React provider stack
- [Browser UX](browser-ux.md) — capability detection, display, lifting state
- [In-Page Data Lakes](in-page-datalakes.md) — read-only browsing without a wallet, broader UX patterns
