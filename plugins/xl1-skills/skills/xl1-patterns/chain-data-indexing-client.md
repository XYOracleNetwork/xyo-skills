# Chain Data Indexing — Client

How a browser client consumes indexed chain data — React hooks, polling intervals, capability detection, and the practical glue between the protocol-level patterns and a live UI. This is the user-facing companion to [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md).

**Scope:** browser-side consumption. For protocol-level rules (which scan strategy, schema design, anchoring choices), see the protocol file. For the long-running indexer service that produces durable derived state, see [Chain Data Indexing — Service](chain-data-indexing-service.md).

**Builds on:**
- [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md) — schemas, scan strategies, polling concept
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `useProvidedGateway` for gateway access
- [Browser UX](browser-ux.md) — capability detection, display conventions, lifting state into context
- [In-Page Data Lakes](in-page-datalakes.md) — read-only browsing without a wallet

---

## When to read directly vs read from a service

Two broad shapes for the browser client:

| Shape | When |
|---|---|
| Read directly from chain via gateway | Single-user view (their own moves, their own balance), low-volume data, or pre-MVP development |
| Read from an indexer service's API | Multi-user views (leaderboards, public history), large derived state, anything requiring restart-resume or durability |

The first shape (direct gateway reads) is what this file documents. The second shape is just normal HTTP fetching and isn't really an XL1 concern — talk to your indexer's API the same way you'd talk to any backend.

For the indexer service itself, see [Chain Data Indexing — Service](chain-data-indexing-service.md).

---

## React Hook for Polled Reads

Wrap the protocol-level `pollForNewData` (defined in [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md)) in a hook with an interval:

```ts
import { useProvidedGateway } from '@xyo-network/react-chain-client'
import { useEffect, useRef, useState } from 'react'
import type { Payload, Schema } from '@xyo-network/sdk-js'

function useChainData(schemas: Schema[], intervalMs = 5000) {
  const { defaultGateway } = useProvidedGateway()
  const [data, setData] = useState<Payload[]>([])
  const lastBlockRef = useRef(0)

  useEffect(() => {
    if (!defaultGateway) return

    const poll = async () => {
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

---

## Capability Detection in Components

A component that *reads* indexed data only needs the read-capable gateway. A component that *submits* data needs the write-capable runner. See [Browser UX — Capability-Aware Components](browser-ux.md) for the full pattern.

```tsx
function GameHistory() {
  const moves = useChainData([MoveSchema, ResultSchema])
  return <List items={moves} />  // works for any visitor, no wallet needed
}

function SubmitMoveButton({ payloads }: { payloads: Payload[] }) {
  const { defaultGateway } = useProvidedGateway()
  const canSubmit = defaultGateway && 'addPayloadsToChain' in defaultGateway
  if (!canSubmit) return null
  // ...
}
```

This split makes the read view available pre-wallet (in a hybrid `GatewayProvider` + `InPageGatewaysProvider` setup) and gates writes on the wallet.

---

## Display Conventions

Indexed data in browser views is full of hashes and addresses (game IDs, player addresses, transaction hashes). Always clamp them and provide copy-to-clipboard — see [Browser UX — Display Conventions](browser-ux.md) for the rule and reference implementation.

---

## Anti-Patterns

| Anti-pattern | Why it fails | Do this instead |
|---|---|---|
| Polling unfinalized state to drive durable UI (leaderboards, ownership) | Reorgs roll back state your UI already showed | Read from a finalized-only service indexer |
| One `useChainData` per component, all polling the chain head | N components × poll interval × users = quadratic load | Lift the polled state into a context provider; share results |
| Forgetting `clearInterval` cleanup | Effect leaks, doubles polling on re-render, lingers after unmount | Always return a cleanup function from the effect |
| Re-walking the chain from genesis on every page load | Slow first paint; wastes RPC quota | Persist `lastSeenBlock` in `sessionStorage` or hydrate from a service |
| Treating the browser hook as a real indexer | No persistence, no public API, every visitor re-walks | Stand up a service per [Chain Data Indexing — Service](chain-data-indexing-service.md) and consume its output |

---

## Cross-References

- [Chain Data Indexing — Protocol](chain-data-indexing-protocol.md) — conceptual rules, scan strategies, schema design
- [Chain Data Indexing — Service](chain-data-indexing-service.md) — when to graduate from in-browser polling to a real indexer service
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `useProvidedGateway` and the React provider stack
- [Browser UX](browser-ux.md) — capability detection, display, lifting state
- [In-Page Data Lakes](in-page-datalakes.md) — read-only browsing without a wallet, broader UX patterns
