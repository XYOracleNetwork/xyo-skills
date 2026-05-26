# In-Page Data Lakes

Read this pattern when your React dApp needs to access chain data or the datalake without requiring the user to connect their wallet first. This is the foundation for building explorer views, leaderboards, game history, and any UI that reads chain data or writes to the datalake without a wallet connection.

**Builds on:**
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `InPageGatewaysProvider`, `WalletGatewayProvider`, `GatewayProvider`, `useProvidedGateway()`
- [Datalakes](../xl1-knowledge/datalakes.md) — DataLakeViewer, schema filtering, `/chain` endpoint
- [Gateway](../xl1-knowledge/gateway.md) — networks, viewer API, transports
- [Chain Data Indexing](chain-data-indexing-protocol.md) — schema-based querying and polling patterns

---

## The Problem

The standard XL1 React setup routes all chain access through the wallet gateway — which requires the browser wallet extension to be installed and the user to approve a connection. This creates a chicken-and-egg problem for many UIs:

- A game history page should be visible to anyone, not just connected players
- A leaderboard should load immediately, not after a wallet prompt
- A market listing should be browsable before a user decides to participate

**In-page gateways** solve this by providing a read-only gateway that connects directly to the XL1 network over HTTP, independent of the wallet extension.

---

## Architecture

```
┌─ InPageGatewaysProvider ──────────────────────────────────┐
│  (creates HTTP-based gateways for each network)           │
│                                                           │
│  ┌─ GatewayProvider ───────────────────────────────────┐  │
│  │  (merges wallet + in-page into single context)      │  │
│  │                                                     │  │
│  │  defaultGateway = wallet gateway ?? in-page gateway │  │
│  │                                                     │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │ Your Components                              │   │  │
│  │  │                                              │   │  │
│  │  │ Chain read:      in-page gateway (always)    │   │  │
│  │  │ Chain write:     wallet gateway (wallet req) │   │  │
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

`GatewayProvider` (from `@xyo-network/xl1-react-client-sdk`) combines the in-page gateway and wallet gateway into a single `defaultGateway`. It prefers the wallet when connected and falls back to the in-page gateway for read-only chain access. It requires `InPageGatewaysProvider` as an ancestor to supply the in-page gateways.

**Note:** `WalletGatewayProvider` is a separate, wallet-only provider with no in-page fallback. Use `GatewayProvider` (not `WalletGatewayProvider`) when your app needs read-only access without a wallet.

**Two independent datalake clients:** The wallet and the dApp each have their own datalake configuration. The wallet writes to whatever datalake(s) it is configured for; the dApp writes to its own via `RestDataLakeRunner`/`RestDataLakeViewer` (plain HTTP). These may point to the same endpoint, different endpoints, or either side may have no datalake at all. See [Datalakes — Two Independent Datalake Clients](../xl1-knowledge/datalakes.md) for the full breakdown. The dApp must not assume the wallet's datalake covers its persistence needs.

---

## Setup

`GatewayProvider` requires `InPageGatewaysProvider` as an ancestor — it reads in-page gateways from that context. Both providers are in `@xyo-network/xl1-react-client-sdk`:

```tsx
import { InPageGatewaysProvider, GatewayProvider, ConnectAccountsStack } from '@xyo-network/xl1-react-client-sdk'
import { MainNetwork } from '@xyo-network/xl1-sdk'

function App() {
  const [address, setAddress] = useState<string>()

  return (
    <InPageGatewaysProvider>
      <GatewayProvider gatewayName={MainNetwork.id}>
        {/* These components can read chain data immediately — no wallet needed */}
        <GameHistory />
        <Leaderboard />

        {/* Always render — handles connection prompt and connected state */}
        <ConnectAccountsStack onAccountConnected={setAddress} />
        {address && <GameBoard address={address} />}
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
```

---

## Datalake Client Setup

The datalake is independent of the gateway — it is the dApp's own HTTP client. Most reads go through `gateway.connection.viewer`: `viewer.transaction.byHash(txHash)` hydrates a transaction's off-chain payloads transparently, and `viewer.block.payloadsByHash(hashes)` fetches off-chain payloads by hash through the same datalake. Block-level reads (`viewer.block.blockByNumber`, etc.) return on-chain payloads only — when walking blocks for application-schema content, pair them with `payloadsByHash`. See [Gateway — What `block.blockByNumber` returns](../xl1-knowledge/gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow) for the full hydration semantics. The dApp typically only needs a `RestDataLakeRunner` for writes; create a `RestDataLakeViewer` only if you have hashes from outside the gateway path that you need to fetch directly.

```ts
import { createRestDataLakeRunner, createRestDataLakeViewer } from '@xyo-network/xl1-sdk'

const DATALAKE_ENDPOINT = 'https://api.archivist.xyo.network/dataLake'

// Write — no wallet needed, dApp can insert payloads for any visitor
const datalakeRunner = await createRestDataLakeRunner(DATALAKE_ENDPOINT)

// Optional read client — only needed for hash-fetches outside the gateway
// path. Do not call .next() on this; use .get(hashes) only.
const datalakeViewer = await createRestDataLakeViewer(DATALAKE_ENDPOINT)
```

The examples below use `datalakeRunner` for writes and `gateway.connection.viewer` for reads — `datalakeViewer` only appears for the rare out-of-band hash-fetch case.

---

## Reading Chain Data Without Wallet

Components that only read chain data work immediately — no wallet prompt:

```tsx
import { useProvidedGateway } from '@xyo-network/xl1-react-client-sdk'

function GameHistory() {
  const { defaultGateway } = useProvidedGateway()
  const [games, setGames] = useState<GameResult[]>([])

  useEffect(() => {
    const viewer = defaultGateway?.connection.viewer
    if (!viewer) return

    const loadHistory = async () => {
      // Two-step walk: block reads return TransactionBoundWitness instances
      // (on-chain only); fetch the referenced off-chain Result payloads via
      // payloadsByHash. For production: persist a checkpoint and walk only
      // from there to head; see Chain Data Indexing for the rigorous pattern.
      const head = Number(await viewer.finalization.headNumber())
      const startBlock = Math.max(0, head - HISTORY_LOOKBACK_BLOCKS)
      const results: GameResult[] = []
      for (let n = startBlock; n <= head; n++) {
        const hydrated = await viewer.block.blockByNumber(n)
        if (!hydrated) continue
        const [, payloads] = hydrated

        const resultHashes: Hash[] = []
        for (const p of payloads) {
          if (!isTransactionBoundWitness(p)) continue
          for (let i = 0; i < p.payload_hashes.length; i++) {
            if (p.payload_schemas[i] === ResultSchema) {
              resultHashes.push(p.payload_hashes[i])
            }
          }
        }
        if (resultHashes.length === 0) continue

        const fetched = await viewer.block.payloadsByHash(resultHashes)
        results.push(...fetched.filter(isResultPayload))
      }
      setGames(results)
    }

    loadHistory()
  }, [defaultGateway])

  return (
    <ul>
      {games.map(game => (
        <li key={game.gameId}>{game.winner} won</li>
      ))}
    </ul>
  )
}
```

### Checking Gateway Capability

When a component supports both reading and writing, check the gateway type before attempting **chain** transactions. The dApp's datalake (`RestDataLakeRunner`/`RestDataLakeViewer`) is the dApp's own HTTP client and doesn't depend on the gateway or wallet at all:

```tsx
function GameBoard({ address }: { address?: string }) {
  const { defaultGateway } = useProvidedGateway()

  const canSubmitToChain = defaultGateway && 'addPayloadsToChain' in defaultGateway
  const canRead = !!defaultGateway
  // The dApp's datalake (RestDataLakeRunner/Viewer) is independent —
  // it's the dApp's own HTTP client, not gated by the wallet or gateway

  // Chain reads work for all visitors (in-page gateway)
  // dApp datalake reads/writes work for all visitors (dApp's own HTTP client)
  // Chain transactions require wallet connection
  return (
    <div>
      {canRead && <GameState gateway={defaultGateway} />}
      {canSubmitToChain
        ? <MoveControls gateway={defaultGateway} address={address!} />
        : <p>Connect wallet to play</p>}
    </div>
  )
}
```

---

## Querying the In-Page Datalake

The in-page gateway exposes the same viewer API as the wallet gateway, minus write operations. All `connection.viewer` sub-viewer methods work:

```tsx
function Leaderboard() {
  const { defaultGateway } = useProvidedGateway()
  const [leaders, setLeaders] = useState<LeaderEntry[]>([])

  useEffect(() => {
    if (!defaultGateway) return

    const loadLeaders = async () => {
      // Two-step walk: block reads return TransactionBoundWitness instances;
      // off-chain Result payloads are fetched explicitly via payloadsByHash.
      const viewer = defaultGateway.connection.viewer
      if (!viewer) return
      const head = Number(await viewer.finalization.headNumber())
      const startBlock = Math.max(0, head - HISTORY_LOOKBACK_BLOCKS)
      const results: ResultPayload[] = []
      for (let n = startBlock; n <= head; n++) {
        const hydrated = await viewer.block.blockByNumber(n)
        if (!hydrated) continue
        const [, payloads] = hydrated

        const resultHashes: Hash[] = []
        for (const p of payloads) {
          if (!isTransactionBoundWitness(p)) continue
          for (let i = 0; i < p.payload_hashes.length; i++) {
            if (p.payload_schemas[i] === ResultSchema) {
              resultHashes.push(p.payload_hashes[i])
            }
          }
        }
        if (resultHashes.length === 0) continue

        const fetched = await viewer.block.payloadsByHash(resultHashes)
        results.push(...fetched.filter(isResultPayload))
      }

      // Build leaderboard from raw payloads
      const board = results
        .reduce((acc, r) => {
          acc[r.winner] = (acc[r.winner] ?? 0) + 1
          return acc
        }, {} as Record<string, number>)

      setLeaders(
        Object.entries(board)
          .map(([address, wins]) => ({ address, wins }))
          .sort((a, b) => b.wins - a.wins),
      )
    }

    loadLeaders()
  }, [defaultGateway])

  return (
    <ol>
      {leaders.map(l => (
        <li key={l.address}>{l.address}: {l.wins} wins</li>
      ))}
    </ol>
  )
}
```

---

## Combining Read and Write Flows

The typical pattern separates the UI into components by their access requirements:

- **Chain reads + datalake reads/writes** — available to everyone, no wallet needed
- **Chain writes** (`addPayloadsToChain`) — gated behind wallet connection

```tsx
function App() {
  const [address, setAddress] = useState<string>()

  return (
    <InPageGatewaysProvider>
      <GatewayProvider gatewayName={MainNetwork.id}>
        {/* Always visible — chain reads + datalake reads/writes, no wallet */}
        <Header />
        <GameHistory />
        <Leaderboard />

        {/* Always render — handles both unconnected and connected states */}
        <ConnectAccountsStack onAccountConnected={setAddress} />

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

2. **Remote datalake (dApp-configured)** — the dApp's own datalake endpoint, configured independently of the wallet's datalake. Use `RestDataLakeRunner` from `@xyo-network/xl1-sdk` for writes (every submit). For reads, **iterate the chain** via `gateway.connection.viewer.block.*` to discover the on-chain `TransactionBoundWitness` instances, then fetch their referenced off-chain payloads through `viewer.block.payloadsByHash(hashes)` — that call goes through `ViewerWithDataLake` to resolve the bytes from the datalake. Insert the freshly walked payloads into the local archivist — deduplication is automatic. Use `RestDataLakeViewer.get(hashes)` directly only when you have hashes from outside the gateway path. Because this is the dApp's own HTTP layer, writes work with or without a wallet, and reads work entirely without one.

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

On a 5-second interval, walk new finalized blocks since `lastSeenBlock` and pull in any application-schema payloads. Block reads return on-chain payloads only, so use the two-step pattern: scan each `TransactionBoundWitness` for matching schemas, then fetch the referenced off-chain payloads through `payloadsByHash`. Deduplication by data hash is automatic in the local archivist:

```ts
const viewer = defaultGateway.connection.viewer
if (!viewer) return
const head = Number(await viewer.finalization.headNumber())
if (head <= lastSeenBlockRef.current) return

const appSchemaSet = new Set<Schema>(appSchemas)
const fresh: Payload[] = []
for (let n = lastSeenBlockRef.current + 1; n <= head; n++) {
  const hydrated = await viewer.block.blockByNumber(n)
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

  const fetched = await viewer.block.payloadsByHash(offChainHashes)
  fresh.push(...fetched)
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
| Component needs to read chain data? | Use `useProvidedGateway()` — works with in-page gateway, no wallet needed |
| Component needs to read/write the datalake? | Use `RestDataLakeRunner`/`RestDataLakeViewer` — the dApp's own HTTP datalake client. Works for any visitor, no wallet needed. |
| Component needs to submit a chain transaction? | Guard with `'addPayloadsToChain' in defaultGateway` check, require wallet connection |
| Does the wallet's datalake cover the dApp's needs? | **Don't assume so.** The wallet and dApp are independent datalake clients. They may point to the same, different, or no endpoints. Always write to the dApp's datalake explicitly. |
| Display data to unauthenticated users? | Place read components outside the wallet connection gate |
| Need to poll for updates? | Use the polling pattern from [Chain Data Indexing](chain-data-indexing-protocol.md) — works with in-page gateway |
| Which network for development? | Use Sequence (beta) — live chain, no real tokens. See [Gateway](../xl1-knowledge/gateway.md) |
