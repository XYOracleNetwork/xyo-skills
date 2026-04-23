# In-Page Data Lakes

Read this pattern when your React dApp needs to access chain data or the datalake without requiring the user to connect their wallet first. This is the foundation for building explorer views, leaderboards, game history, and any UI that reads chain data or writes to the datalake without a wallet connection.

**Builds on:**
- [Browser Wallet](../xl1-knowledge/wallet.md) — `InPageGatewaysProvider`, `WalletGatewayProvider`, `GatewayProvider`, `useProvidedGateway()`
- [Datalakes](../xl1-knowledge/datalakes.md) — DataLakeViewer, schema filtering, `/chain` endpoint
- [Gateway](../xl1-knowledge/gateway.md) — RPC methods, networks, transports
- [Chain Data Indexing](chain-data-indexing.md) — schema-based querying and polling patterns

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

`GatewayProvider` (from `@xyo-network/react-chain-client`) combines the in-page gateway and wallet gateway into a single `defaultGateway`. It prefers the wallet when connected and falls back to the in-page gateway for read-only chain access. It requires `InPageGatewaysProvider` as an ancestor to supply the in-page gateways.

**Note:** `WalletGatewayProvider` is a separate, wallet-only provider with no in-page fallback. Use `GatewayProvider` (not `WalletGatewayProvider`) when your app needs read-only access without a wallet.

**Two independent datalake clients:** The wallet and the dApp each have their own datalake configuration. The wallet writes to whatever datalake(s) it is configured for; the dApp writes to its own via `RestDataLakeRunner`/`RestDataLakeViewer` (plain HTTP). These may point to the same endpoint, different endpoints, or either side may have no datalake at all. See [Datalakes — Two Independent Datalake Clients](../xl1-knowledge/datalakes.md) for the full breakdown. The dApp must not assume the wallet's datalake covers its persistence needs.

---

## Setup

`GatewayProvider` requires `InPageGatewaysProvider` as an ancestor — it reads in-page gateways from that context. Both providers are in `@xyo-network/react-chain-client`:

```tsx
import { InPageGatewaysProvider, GatewayProvider, ConnectAccountsStack } from '@xyo-network/react-chain-client'
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

## Reading Chain Data Without Wallet

Components that only read chain data work immediately — no wallet prompt:

```tsx
import { useProvidedGateway } from '@xyo-network/react-chain-client'

function GameHistory() {
  const { defaultGateway } = useProvidedGateway()
  const [games, setGames] = useState<GameResult[]>([])

  useEffect(() => {
    if (!defaultGateway) return

    // This works with just the in-page gateway — no wallet needed
    const loadHistory = async () => {
      const payloads = await datalakeViewer.next({
        allowedSchemas: [ResultSchema],
      })
      setGames(payloads.filter(isResultPayload))
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

The in-page gateway exposes the same RPC interface as the wallet gateway, minus write operations. All `*Viewer` methods work:

```tsx
function Leaderboard() {
  const { defaultGateway } = useProvidedGateway()
  const [leaders, setLeaders] = useState<LeaderEntry[]>([])

  useEffect(() => {
    if (!defaultGateway) return

    const loadLeaders = async () => {
      // Query result payloads from the datalake
      const results = await datalakeViewer.next({
        allowedSchemas: [ResultSchema],
      })

      // Build leaderboard from raw payloads
      const board = results
        .filter(isResultPayload)
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

## dApp State Management: Local Store + Remote Datalake

Each browser session is isolated — payloads submitted by Player A are invisible to Player B unless both read from a shared data source. The wallet and the dApp are independent datalake clients (see [Datalakes](../xl1-knowledge/datalakes.md)), so the dApp cannot rely on the wallet's datalake for cross-player visibility. The dApp must manage its own state with two layers:

### Architecture

```
┌─ Player A's browser ─────────────────┐    ┌─ Player B's browser ─────────────────┐
│  Local Payload Store (React + localStorage) │  Local Payload Store (React + localStorage)
│       │                               │    │       │                               │
│       │  addPayloads() on submit      │    │       │  addPayloads() on submit      │
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

1. **Local payload store** — React state backed by `localStorage`. Updated immediately when this browser submits a payload. Provides instant UI feedback without a network round-trip. Also syncs across tabs of the same browser via the `storage` event.

2. **Remote datalake (dApp-configured)** — the dApp's own datalake endpoint, configured independently of the wallet's datalake. Use `RestDataLakeRunner` (for writes) and `RestDataLakeViewer` (for reads) from `@xyo-network/xl1-sdk`. The dApp pushes payloads here on every submit and polls periodically to discover payloads from other players. Results are merged into the local store with deduplication by data hash. Because this is the dApp's own HTTP connection, it works with or without a wallet — and the dApp controls exactly where the data goes.

### Submit flow

On every user action (create game, commit, reveal, settle), **insert into the dApp's datalake first, then submit the transaction**. This ordering ensures the payload data is persisted in the dApp's datalake even if the chain submission fails:

```ts
// 1. Insert into the dApp's datalake (plain HTTP, no wallet needed)
//    Makes payload visible to other players polling this datalake
await datalakeRunner.insert(payloads)

// 2. Store locally for immediate UI update
addPayloads(payloads)

// 3. Submit transaction to chain via wallet
//    The wallet may also write to its own datalake — but the dApp
//    cannot rely on that being the same endpoint or being configured
const [txHash] = await gateway.addPayloadsToChain([], payloads)
```

Steps 1 and 2 are dApp-controlled and work without a wallet. Step 3 requires the wallet. The wallet may independently persist payloads to its own datalake during the transaction, but the dApp should treat that as opaque — always write to its own datalake explicitly.

### Poll flow

On a 5-second interval, fetch payloads from the remote datalake filtered by the application's schemas using `RestDataLakeViewer`. Merge with the local store, deduplicating by `PayloadBuilder.dataHash`:

```ts
const remote = await datalakeViewer.next({ allowedSchemas: appSchemas })
mergeIntoLocalStore(remote) // deduplicate by hash
```

### Why both layers

| Concern | Local store alone | Remote datalake alone | Both |
|---------|------------------|-----------------------|------|
| Instant UI after submit | Yes | No (network latency) | Yes |
| Cross-player visibility | No | Yes | Yes |
| Works offline | Yes | No | Graceful degradation |
| Survives page refresh | Via localStorage | Via remote query | Yes |

---

## Displaying Hashes and Addresses

Hashes (64 chars) and addresses (40 chars) are too long to display in full in most UI contexts. **Always** follow these two rules:

1. **Clamp the display value.** Truncate to a readable prefix + suffix, e.g., `a1b2c3d4...ef567890`. This is fine — users don't read full hex strings.
2. **Provide a copy-to-clipboard action.** Every clamped hash or address must have a way to copy the full, untruncated value. A click-to-copy icon or a tooltip with a copy button both work.

```tsx
function HashDisplay({ value }: { value: string }) {
  const display = `${value.slice(0, 8)}...${value.slice(-8)}`

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
  }

  return (
    <span style={{ fontFamily: 'monospace', cursor: 'pointer' }} onClick={handleCopy} title="Click to copy">
      {display}
    </span>
  )
}
```

Hashes and addresses appear throughout dApp UIs: game IDs, player addresses, transaction hashes, block hashes, etc. Prefer clamped display over raw hex strings — full 40- or 64-character values are rarely useful inline. When a value is clamped, always provide a way to copy the full value.

---

## Key Decisions

| Decision | Guidance |
|----------|----------|
| Component needs to read chain data? | Use `useProvidedGateway()` — works with in-page gateway, no wallet needed |
| Component needs to read/write the datalake? | Use `RestDataLakeRunner`/`RestDataLakeViewer` — the dApp's own HTTP datalake client. Works for any visitor, no wallet needed. |
| Component needs to submit a chain transaction? | Guard with `'addPayloadsToChain' in defaultGateway` check, require wallet connection |
| Does the wallet's datalake cover the dApp's needs? | **Don't assume so.** The wallet and dApp are independent datalake clients. They may point to the same, different, or no endpoints. Always write to the dApp's datalake explicitly. |
| Display data to unauthenticated users? | Place read components outside the wallet connection gate |
| Need to poll for updates? | Use the polling pattern from [Chain Data Indexing](chain-data-indexing.md) — works with in-page gateway |
| Which network for development? | Use Sequence (beta) — live chain, no real tokens. See [Gateway](../xl1-knowledge/gateway.md) |
