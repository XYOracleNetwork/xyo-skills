# In-Page Data Lakes

Read this pattern when your React dApp needs to access chain data or the datalake without requiring the user to connect their wallet first. This is the foundation for building explorer views, leaderboards, game history, and any UI that reads chain data or writes to the datalake without a wallet connection. Multi-user views (game history, leaderboards) read the companion service's index over `/api/*`, not a browser chain walk.

**Builds on:**
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `InPageGatewaysProvider`, `WalletGatewayProvider`, `GatewayProvider`, `useProvidedGateway()`, and the REST-over-RPC transport rule
- [Datalakes](../xl1-knowledge/datalakes.md) — DataLakeViewer reads by hash (`get(hashes)`), REST datalake endpoints
- [Gateway](../xl1-knowledge/gateway.md) — networks, viewer API, transports
- [Chain Data Indexing](chain-data-indexing-protocol.md) — schema-based querying and polling patterns

---

**Versioned identity:** existing archivist deduplication/lookup behavior must be
checked before storing variants that share a data hash. New application identity
and validation caches should use root hashes and applicable policy; do not assume
the store preserves every `$version`/metadata representation. See [Payload Schema
Evolution and Identity](../xyo-knowledge/payload-schema-evolution.md).

## The Problem

The standard XL1 React setup routes all chain access through the wallet gateway — which requires the browser wallet extension to be installed and the user to approve a connection. This creates a chicken-and-egg problem for many UIs:

- A game history page should be visible to anyone, not just connected players
- A leaderboard should load immediately, not after a wallet prompt
- A market listing should be browsable before a user decides to participate

**In-page gateways** solve this by providing a read-only gateway that connects directly to the XL1 network, independent of the wallet extension. Each one is an `@xyo-network/xl1-browser-system` session that `InPageGatewaysProvider` launches and owns — you configure it through provider props rather than launching it yourself.

The in-page gateway does not mean the browser walks the chain to build those pages. A history page and a leaderboard are derived from every player's games, so the companion service indexes them once and the browser fetches the result from `/api/*` — no wallet and no gateway needed. The in-page gateway covers the bounded chain reads around them — a transaction, a block, the finalized head — and the dApp's datalake viewer returns one game's off-chain payloads by hash. See [Chain Data Indexing — Client § When Browser Indexing Is Wrong](chain-data-indexing-client.md#when-browser-indexing-is-wrong).

---

## Architecture

```
┌─ InPageGatewaysProvider transport="rest" ─────────────────┐
│  (one browser-system gateway per network, REST reads)     │
│                                                           │
│  ┌─ GatewayProvider ───────────────────────────────────┐  │
│  │  (publishes wallet + in-page in one context)        │  │
│  │                                                     │  │
│  │  defaultGateway:                                    │  │
│  │    wallet installed  → wallet runner, granted       │  │
│  │                        account or not               │  │
│  │    no wallet found   → in-page gateway              │  │
│  │    discovery pending → undefined                    │  │
│  │  gateways.inPageGateway → in-page gateway           │  │
│  │                                                     │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │ Your Components                              │   │  │
│  │  │                                              │   │  │
│  │  │ Index read:      service /api/* (always)     │   │  │
│  │  │ Chain read:      gateways.inPageGateway      │   │  │
│  │  │                  (always, wallet or not)     │   │  │
│  │  │ Chain write:     wallet runner + a granted   │   │  │
│  │  │                  account (wallet required)   │   │  │
│  │  │                                              │   │  │
│  │  │ dApp datalake:   RestDataLakeRunner/Viewer   │   │  │
│  │  │   read + write   (HTTP, always available)    │   │  │
│  │  │                                              │   │  │
│  │  │ Wallet datalake: wallet's own config         │   │  │
│  │  │   (independent — may differ from dApp's)     │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

`GatewayProvider` (from `@xyo-network/xl1-react-client-sdk`) publishes the wallet gateway and the in-page gateway through one context. Its `defaultGateway` is the wallet's write-capable runner whenever the extension is installed — even before the user has granted this site an account — and the in-page gateway only when no wallet is found. While wallet discovery is still running, `defaultGateway` and both `gateways` entries are `undefined`; render a loading state. It requires `InPageGatewaysProvider` as an ancestor to supply the in-page gateways.

Two rules follow, and the examples below use both:

- **Public reads go to `gateways.inPageGateway`**, from `useProvidedGateway()` — not `defaultGateway`. That keeps every visitor on the same REST-backed in-page source whether or not they have the wallet installed.
- **`'addPayloadsToChain' in defaultGateway` detects an installed wallet, not a connected one.** Gate chain writes on a granted account (lifted from `ConnectAccountsStack`'s `onAccountsChanged`) *and* a write-capable runner.

**Note:** `WalletGatewayProvider` is a separate, wallet-only provider with no in-page fallback. Use `GatewayProvider` (not `WalletGatewayProvider`) when your app needs read-only access without a wallet.

**Two independent datalake clients:** The wallet and the dApp each have their own datalake configuration. The wallet writes to whatever datalake(s) it is configured for; the dApp writes to its own via `RestDataLakeRunner`/`RestDataLakeViewer` (plain HTTP). These may point to the same endpoint, different endpoints, or either side may have no datalake at all. See [Datalakes — Two Independent Datalake Clients](../xl1-knowledge/datalakes.md) for the full breakdown. The dApp must not assume the wallet's datalake covers its persistence needs.

---

## Setup

`GatewayProvider` requires `InPageGatewaysProvider` as an ancestor — it reads in-page gateways from that context. Both providers are in `@xyo-network/xl1-react-client-sdk`:

```tsx
import type { XyoAddress } from '@xyo-network/sdk'
import { InPageGatewaysProvider, GatewayProvider, ConnectAccountsStack } from '@xyo-network/xl1-react-client-sdk'
import { SequenceNetwork } from '@xyo-network/xl1-sdk'
import { useCallback, useState } from 'react'

function App() {
  const [address, setAddress] = useState<XyoAddress>()

  // Keep the chosen account while it is still granted; [] (revoked) clears it
  const onAccountsChanged = useCallback((accounts: readonly XyoAddress[]) => {
    setAddress(current => (current !== undefined && accounts.includes(current) ? current : accounts[0]))
  }, [])

  return (
    <InPageGatewaysProvider transport="rest">
      <GatewayProvider gatewayName={SequenceNetwork.id}>
        {/* These components load immediately — no wallet needed (they read the service's /api/*) */}
        <GameHistory />
        <Leaderboard />

        {/* Always render — handles connection prompt and connected state */}
        <ConnectAccountsStack onAccountsChanged={onAccountsChanged} />
        {address && <GameBoard address={address} />}
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
```

### Set `transport="rest"`

`InPageGatewaysProvider` still defaults to `transport="rpc"` for backward
compatibility, so REST is opt-in. Pass it explicitly on every in-page setup.

REST reads come from the network's static bucket layout — cacheable index and
step-summary files behind a CDN — instead of a live gateway call per read. That
matters most here: the whole point of this pattern is a page that loads chain
data for every anonymous visitor, which is exactly the read volume you do not
want landing on a gateway node. Writes are unaffected, since mempool submission
goes over the RPC URL either way.

For the local network, REST reads a path-based layout served by the
`localEndpoint` prop (default `https://chain.aries.test:8791`); every other
network reads the `<gatewayName>.xyo.space` subdomain layout. See
[Browser Gateway — REST over RPC](../xl1-knowledge/gateway-browser.md#rest-over-rpc)
for the transport rule and the non-React equivalents.

---

## Datalake Client Setup

The datalake is independent of the gateway — it is the dApp's own HTTP client, and it is where the dApp reads its off-chain payloads back. `gateway.connection.viewer` never reads from a datalake: `viewer.transaction.byHash(txHash)`, `viewer.block.payloadsByHash(hashes)`, and block reads (`viewer.block.blockByNumber`, etc.) return only what the gateway's own payload store holds — the on-chain payloads. Off-chain application payloads come from the datalake they were written to: take their hashes from the chain (`TransactionBoundWitness.payload_hashes[]`) and call `datalakeViewer.get(hashes)`. See [Gateway — What `block.blockByNumber` returns](../xl1-knowledge/gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow) for the full read semantics. The dApp needs a `RestDataLakeRunner` for writes and a `RestDataLakeViewer` for those reads, both on the same endpoint.

```ts
import {
  createRestDataLakeRunner, createRestDataLakeViewer, NetworkDataLakeUrls, SequenceNetwork,
} from '@xyo-network/xl1-sdk'

// The dApp's own datalake — configured per deployment, defaulting to the network's.
// Writes and reads use the same endpoint, so the dApp reads back what it wrote.
const DATALAKE_ENDPOINT = import.meta.env.VITE_DATALAKE_ENDPOINT ?? NetworkDataLakeUrls[SequenceNetwork.id]

// Write — no wallet needed, dApp can insert payloads for any visitor
const datalakeRunner = await createRestDataLakeRunner(DATALAKE_ENDPOINT)

// Read — off-chain bodies by hash (the hashes come from the chain).
// Do not call .next() on this; use .get(hashes) only.
const datalakeViewer = await createRestDataLakeViewer(DATALAKE_ENDPOINT)
```

The examples below use `datalakeRunner` for writes, the in-page gateway's `connection.viewer` (`gateways.inPageGateway` from `useProvidedGateway()`) for chain reads (transactions, blocks, the finalized head), and `datalakeViewer` for the off-chain payloads those reads reference.

---

## Reading Chain Data Without Wallet

Components that only read work immediately — no wallet prompt. Pick the source by the shape of the read:

| Read | Source | Why |
|---|---|---|
| Multi-user derived views — game history, leaderboards, market listings | Companion service: `fetch('/api/…')` | The service indexes finalized blocks once, from `INDEXER_FLOOR_BLOCK`, and serves the result. A browser walk re-derives it in every tab, and its cost grows with history — see [Load from indexes, not from replay](architecture-principles.md#5-load-from-indexes-not-from-replay) |
| Bounded lookups — one game's transaction or payloads by hash, a block by number, the finalized head | In-page gateway: `gateways.inPageGateway?.connection.viewer`, plus `datalakeViewer.get(hashes)` for off-chain payloads | Constant-cost reads — the same price on day one and day one thousand. See [Querying the In-Page Datalake](#querying-the-in-page-datalake) |

The service mounts its routes under `/api/*`, and the app calls them with relative URLs ([Browser ↔ Service Wiring](browser-service-wiring.md)). The service indexes; the browser displays:

```tsx
function GameHistory() {
  const [games, setGames] = useState<GameSummary[]>([])

  useEffect(() => {
    let cancelled = false
    // Same-origin route on the companion service — relative URL, no VITE_API_URL
    void fetch('/api/games')
      .then(res => res.json() as Promise<GameSummary[]>)
      .then((list) => {
        if (!cancelled) setGames(list)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <ul>
      {games.map(game => (
        <li key={game.gameId}>{game.winner} won</li>
      ))}
    </ul>
  )
}
```

The service builds `/api/games` in its sync loop, using the two-step block walk from `INDEXER_FLOOR_BLOCK` — see [Chain Data Indexing — Service](chain-data-indexing-service.md). Have each `GameSummary` carry a locator (the `txHash` of the transaction that recorded the result) so the page can check any entry against the chain with constant-cost reads — see [Querying the In-Page Datalake](#querying-the-in-page-datalake).

### Checking Gateway Capability

When a component supports both reading and writing, read from the in-page gateway and check for a granted account **and** a write-capable runner before attempting **chain** transactions. The runner check alone is not enough: with the extension installed, `defaultGateway` is the wallet's runner before the user has granted this site anything. The dApp's datalake (`RestDataLakeRunner`/`RestDataLakeViewer`) is the dApp's own HTTP client and doesn't depend on the gateway or wallet at all:

```tsx
import type { XyoAddress } from '@xyo-network/sdk'
import { useProvidedGateway } from '@xyo-network/xl1-react-client-sdk'

// address — the account chosen from ConnectAccountsStack's onAccountsChanged (see Setup)
function GameBoard({ address }: { address?: XyoAddress }) {
  const { defaultGateway, gateways } = useProvidedGateway()

  // Chain reads work for all visitors — the in-page gateway, wallet or not
  const reader = gateways.inPageGateway
  // Chain writes need a granted account AND the wallet's write-capable runner
  const runner = defaultGateway && 'addPayloadsToChain' in defaultGateway ? defaultGateway : undefined
  // The dApp's datalake (RestDataLakeRunner/Viewer) is independent —
  // it's the dApp's own HTTP client, not gated by the wallet or gateway
  return (
    <div>
      {reader && <GameState gateway={reader} />}
      {address && runner
        ? <MoveControls gateway={runner} address={address} />
        : <p>Connect wallet to play</p>}
    </div>
  )
}
```

---

## Querying the In-Page Datalake

The in-page gateway exposes the same viewer API as the wallet gateway, minus write operations. All `connection.viewer` sub-viewer methods work. Reach it as `gateways.inPageGateway` from `useProvidedGateway()` — `defaultGateway` is the wallet's gateway whenever the extension is installed. Use them for reads whose cost does not grow with history — a transaction by hash, a block by number, the finalized head — and pair them with `datalakeViewer.get(hashes)` for the off-chain payloads those reads reference.

The typical case is a detail view that checks one service-listed game against the chain. `transaction.byHash` returns the signed transaction — its signer and its `payload_hashes[]` — but not its off-chain payloads; read the result body from the dApp's datalake by the hash the transaction lists. Two constant-cost reads, no block walk:

```tsx
import type { Hash } from '@ariestools/sdk'
import { useProvidedGateway } from '@xyo-network/xl1-react-client-sdk'

// datalakeViewer — the dApp's RestDataLakeViewer, see Datalake Client Setup above
function GameReceipt({ txHash }: { txHash: Hash }) {
  // Public read — the in-page gateway, not defaultGateway (the wallet's, when installed)
  const inPageGateway = useProvidedGateway().gateways.inPageGateway
  const [result, setResult] = useState<ResultPayload>()

  useEffect(() => {
    const viewer = inPageGateway?.connection.viewer
    if (!viewer) return
    let cancelled = false

    void (async () => {
      const tx = await viewer.transaction.byHash(txHash)
      if (cancelled || !tx) return
      // tx[1] holds only on-chain payloads — the result body is off-chain.
      // Take its hash from the transaction and read it from the dApp's datalake.
      const [bw] = tx
      const resultHashes = bw.payload_hashes.filter((_, i) => bw.payload_schemas[i] === ResultSchema)
      const bodies = await datalakeViewer.get(resultHashes)
      if (!cancelled) setResult(bodies.find(isResultPayload))
    })()
    return () => { cancelled = true }
  }, [inPageGateway, txHash])

  return result ? <p>{result.winner} won — read from chain</p> : null
}
```

When you already hold payload hashes, `datalakeViewer.get(hashes)` is the single read; filter the result with the Zod-factory guard (`isResultPayload`). `viewer.block.payloadsByHash(hashes)` is not a substitute — it reads only the gateway's own store, which holds on-chain payloads, not off-chain bodies. `viewer.finalization.headNumber()` is constant-cost too — pair it with the service's `/api/indexer/status` ([Progress Endpoint](chain-data-indexing-service.md#progress-endpoint)) to show how far the index trails the chain.

A leaderboard follows the same rule as history: the tally is derived state, so the service computes it as it indexes and the browser fetches it:

```tsx
function Leaderboard() {
  const [leaders, setLeaders] = useState<LeaderEntry[]>([])

  useEffect(() => {
    let cancelled = false
    // The service tallies wins from finalized Result payloads as it indexes
    void fetch('/api/leaderboard')
      .then(res => res.json() as Promise<LeaderEntry[]>)
      .then((list) => {
        if (!cancelled) setLeaders(list)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <ol>
      {leaders.map(l => (
        <li key={l.address}>{l.address}: {l.wins} wins</li>
      ))}
    </ol>
  )
}
```

**Prototype-only stand-in.** Before the service exists, a browser walk can fill in for `/api/*` — the two-step scan, bounded below at `VITE_INDEXER_FLOOR_BLOCK` (see [Chain Data Indexing — Client § Recency-Biased Reads](chain-data-indexing-client.md#recency-biased-reads--walking-backward-from-head)). Replace it with the service fetch before declaring the work done.

---

## Combining Read and Write Flows

The typical pattern separates the UI into components by their access requirements:

- **Service index reads (`/api/*`) + bounded chain reads + datalake reads/writes** — available to everyone, no wallet needed
- **Chain writes** (`addPayloadsToChain`) — gated behind wallet connection: a granted account plus the wallet's runner

```tsx
function App() {
  const [address, setAddress] = useState<XyoAddress>()

  // As in Setup: keep the chosen account while it is still granted; [] (revoked) clears it
  const onAccountsChanged = useCallback((accounts: readonly XyoAddress[]) => {
    setAddress(current => (current !== undefined && accounts.includes(current) ? current : accounts[0]))
  }, [])

  return (
    <InPageGatewaysProvider transport="rest">
      <GatewayProvider gatewayName={SequenceNetwork.id}>
        {/* Always visible — service index reads, bounded chain reads, datalake reads/writes; no wallet */}
        <Header />
        <GameHistory />
        <Leaderboard />

        {/* Always render — handles both unconnected and connected states */}
        <ConnectAccountsStack onAccountsChanged={onAccountsChanged} />

        {/* Wallet-gated — only chain transactions need the wallet */}
        {address && <ActiveGame address={address} />}
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
```

This gives visitors immediate value (browsing data, and the dApp can write to the datalake on their behalf) while requiring wallet authentication only for on-chain transactions. Note that `ConnectAccountsStack` is always rendered — it manages its own display for both the connection prompt and the post-connection state, so do not conditionally swap it for a custom connected UI.

---

## dApp State Management: Local Archivist + Remote Datalake

Each browser session is isolated — payloads submitted by Player A are invisible to Player B unless both read from a shared data source. The wallet and the dApp are independent datalake clients (see [Datalakes](../xl1-knowledge/datalakes.md)), so the dApp cannot rely on the wallet's datalake for cross-player visibility. The dApp must manage its own state with two layers:

### Architecture

```
┌─ Player A's browser ─────────────────┐    ┌─ Player B's browser ─────────────────┐
│  IndexedDbArchivist (local store)     │    │  IndexedDbArchivist (local store)     │
│       │                               │    │       │                               │
│       │  archivist.insert() on submit │    │       │  archivist.insert() on submit │
│       ▼                               │    │       ▼                               │
│  ┌─────────┐    POST on submit        │    │  ┌─────────┐    POST on submit        │
│  │ UI      │───────────────────────┐  │    │  │ UI      │───────────────────────┐  │
│  └─────────┘                       │  │    │  └─────────┘                       │  │
│       ▲        poll every 5s       │  │    │       ▲        poll every 5s       │  │
│       └────────────────────────┐   │  │    │       └────────────────────────┐   │  │
└────────────────────────────────┼───┼──┘    └────────────────────────────────┼───┼──┘
                                 │   │                                        │   │
                                 ▼   ▼                                        ▼   ▼
                          ┌──────────────────┐
                          │  Remote Datalake  │
                          │  (HTTP endpoint)  │
                          └──────────────────┘
```

### The two layers

1. **Local archivist (`IndexedDbArchivist`)** — a browser-side archivist backed by IndexedDB. Updated immediately when this browser submits a payload. Provides instant UI feedback without a network round-trip, survives page refresh, and supports schema-based filtering and cursor pagination. Deduplication by data hash is built in — inserting the same payload twice is a no-op. Use the `inserted` event to drive React state updates. See [Module System — Browser Archivist Selection](../xyo-knowledge/modules.md) for setup.

2. **Remote datalake (dApp-configured)** — the dApp's own datalake endpoint, configured independently of the wallet's datalake. Use `RestDataLakeRunner` from `@xyo-network/xl1-sdk` for writes (every submit). For reads, **iterate the chain** via `gateway.connection.viewer.block.*` to discover the on-chain `TransactionBoundWitness` instances, then fetch their referenced off-chain payloads from this datalake with `datalakeViewer.get(hashes)` — the gateway viewer never reads from a datalake, so this is the only read that returns the bytes. Insert the freshly walked payloads into the local archivist — deduplication is automatic. Because this is the dApp's own HTTP layer, writes work with or without a wallet, and reads work entirely without one. The browser-side chain walk is prototype-only — see [Poll flow](#poll-flow).

### Creating the local archivist

```ts
import { IndexedDbArchivist, IndexedDbArchivistConfigSchema } from '@xyo-network/archivist-indexeddb'

const localArchivist = await IndexedDbArchivist.create({
  account: 'random',
  config: {
    schema: IndexedDbArchivistConfigSchema,
    dbName: 'my-dapp',       // IndexedDB database name
    storeName: 'payloads',   // object store name
  },
})

// Drive React state from archivist events
localArchivist.on('inserted', ({ payloads }) => {
  setPayloads(prev => [...prev, ...payloads])
})
```

### Submit flow

On every user action (create game, commit, reveal, settle), **insert into the dApp's datalake first, then the local archivist, then submit the transaction**. This ordering ensures the payload data is persisted in the dApp's datalake even if the chain submission fails:

```ts
// datalakeRunner is a standalone RestDataLakeRunner — see Datalake Client Setup above

// 1. Insert into the dApp's datalake (plain HTTP, no wallet needed)
//    Makes payload visible to other players polling this datalake
await datalakeRunner.insert(payloads)

// 2. Store locally for immediate UI update (deduplication is built in)
await localArchivist.insert(payloads)

// 3. Submit transaction to chain via wallet
//    The wallet may also write to its own datalake — but the dApp
//    cannot rely on that being the same endpoint or being configured
const [txHash] = await gateway.addPayloadsToChain([], payloads)
```

Steps 1 and 2 are dApp-controlled and work without a wallet. Step 3 requires the wallet. The wallet may independently persist payloads to its own datalake during the transaction, but the dApp should treat that as opaque — always write to its own datalake explicitly.

### Poll flow

On a 5-second interval, walk new finalized blocks since `lastSeenBlock` and pull in any application-schema payloads. Block reads return on-chain payloads only, so use the two-step pattern: scan each `TransactionBoundWitness` for matching schemas, then fetch the referenced off-chain payloads from the dApp's datalake with `datalakeViewer.get(hashes)`. Deduplication by data hash is automatic in the local archivist.

**Prototype-only.** This walk runs in every open tab, and a cold start replays `VITE_INDEXER_FLOOR_BLOCK`..head — a cost that grows with history. Never start it below the floor. In production, the companion service indexes these payloads and this poll becomes a `fetch('/api/games/:id')` (see [Reading Chain Data Without Wallet](#reading-chain-data-without-wallet)); keep the local archivist for instant feedback on this browser's own submits.

```ts
import { isAnyPayload } from '@xyo-network/sdk'
import { asXL1BlockNumber, isTransactionBoundWitness } from '@xyo-network/xl1-sdk'

// datalakeViewer — the dApp's RestDataLakeViewer, see Datalake Client Setup above
const FLOOR_BLOCK = Number(import.meta.env.VITE_INDEXER_FLOOR_BLOCK)
if (!Number.isFinite(FLOOR_BLOCK)) throw new Error('VITE_INDEXER_FLOOR_BLOCK is required') // fail closed

// The in-page gateway (useProvidedGateway().gateways.inPageGateway) — a public read
const viewer = inPageGateway?.connection.viewer
if (!viewer) return
const head = Number(await viewer.finalization.headNumber())
if (head <= lastSeenBlockRef.current) return

const appSchemaSet = new Set<Schema>(appSchemas)
const fresh: Payload[] = []
// Bounded below at the floor — a fresh tab never walks pre-deployment blocks
for (let n = Math.max(lastSeenBlockRef.current + 1, FLOOR_BLOCK); n <= head; n++) {
  const hydrated = await viewer.block.blockByNumber(asXL1BlockNumber(n, true))
  if (!hydrated) continue
  const [, payloads] = hydrated

  const offChainHashes: Hash[] = []
  for (const p of payloads) {
    if (!isTransactionBoundWitness(p)) continue
    for (let i = 0; i < p.payload_hashes.length; i++) {
      if (appSchemaSet.has(p.payload_schemas[i] as Schema)) {
        offChainHashes.push(p.payload_hashes[i])
      }
    }
  }
  if (offChainHashes.length === 0) continue

  const fetched = await datalakeViewer.get(offChainHashes)
  fresh.push(...fetched.filter(isAnyPayload))
}
await localArchivist.insert(fresh) // duplicates are ignored
lastSeenBlockRef.current = head
```

**Why not `datalakeViewer.next({ allowedSchemas })`?** Remote XL1 datalakes do not implement cursor pagination — `.next()` is an unbounded scan with no chain context (no block number, no signer, no finalization guarantee). Walking the chain is bounded, ordered, finalization-aware, and gives you the signer/transaction context for free. The local `IndexedDbArchivist.next()` *is* still the right tool for the UI to read its own cache (real cursor, real pagination); only the *remote* leg changes.

### Why both layers

| Concern | Local archivist alone | Remote datalake alone | Both |
|---------|----------------------|-----------------------|------|
| Instant UI after submit | Yes | No (network latency) | Yes |
| Cross-player visibility | No | Yes | Yes |
| Works offline | Yes | No | Graceful degradation |
| Survives page refresh | Yes (IndexedDB) | Via remote query | Yes |
| Schema-filtered queries | Yes (built-in index) | Yes (filter during chain walk) | Yes |

---

## Displaying Hashes and Addresses

Hashes and addresses surface throughout in-page datalake views (game IDs, player addresses, transaction hashes, block hashes). Always clamp them for display and provide a copy-to-clipboard action — see [Browser UX — Display Conventions](browser-ux.md) for the rule and a reference implementation.

---

## Key Decisions

| Decision | Guidance |
|----------|----------|
| Component shows a multi-user derived view (history, leaderboard, listings)? | `fetch('/api/…')` from the companion service's index — never a browser chain walk outside a floor-bounded prototype. See [Reading Chain Data Without Wallet](#reading-chain-data-without-wallet) |
| Component needs to read chain data? | Use `useProvidedGateway().gateways.inPageGateway` for bounded lookups (transaction by hash, block by number, finalized head) — works for every visitor, wallet or not; `defaultGateway` is the wallet's gateway whenever the extension is installed. Fetch the off-chain payloads they reference with `datalakeViewer.get(hashes)` |
| Component needs to read/write the datalake? | Use `RestDataLakeRunner`/`RestDataLakeViewer` — the dApp's own HTTP datalake client. Works for any visitor, no wallet needed. |
| Component needs to submit a chain transaction? | Require a granted account (lifted from `ConnectAccountsStack`'s `onAccountsChanged`) **and** `'addPayloadsToChain' in defaultGateway` — the runner check alone only proves the extension is installed |
| Does the wallet's datalake cover the dApp's needs? | **Don't assume so.** The wallet and dApp are independent datalake clients. They may point to the same, different, or no endpoints. Always write to the dApp's datalake explicitly. |
| Display data to unauthenticated users? | Place read components outside the wallet connection gate |
| Need to poll for updates? | Derived views: re-fetch the service's `/api/*` route. Ephemeral, single-user reads: the polling pattern from [Chain Data Indexing](chain-data-indexing-protocol.md) — works with in-page gateway |
| Which network for development? | Use Sequence (beta) — live chain, no real tokens. See [Gateway](../xl1-knowledge/gateway.md) |
| Which in-page transport? | `transport="rest"`. It is not the prop's default, so pass it explicitly. Reach for `'rpc'` only when the deployment publishes no static layout, or a read must observe unfinalized state |
