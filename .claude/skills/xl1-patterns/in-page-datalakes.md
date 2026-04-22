# In-Page Data Lakes

Read this pattern when your React dApp needs read-only access to chain data without requiring the user to connect their wallet first. This is the foundation for building explorer views, leaderboards, game history, and any UI that displays chain data to unauthenticated visitors.

**Builds on:**
- [Browser Wallet](../xl1-knowledge/wallet.md) — `InPageGatewaysProvider`, `GatewayProvider`, `useProvidedGateway()`
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
┌─────────────────────────────────────────────────┐
│  InPageGatewaysProvider                         │
│  ┌────────────────────┐                         │
│  │ In-Page Gateway    │◄── HTTP RPC to network  │
│  │ (read-only)        │    No wallet needed      │
│  └────────────────────┘                         │
│           │                                      │
│  ┌────────▼───────────────────────────┐         │
│  │ GatewayProvider                    │         │
│  │                                    │         │
│  │  defaultGateway = wallet gateway   │         │
│  │    ?? in-page gateway              │         │
│  │                                    │         │
│  │  ┌──────────────────────────────┐  │         │
│  │  │ Your Components              │  │         │
│  │  │                              │  │         │
│  │  │ Read: always available       │  │         │
│  │  │ Write: only after wallet     │  │         │
│  │  │        connection            │  │         │
│  │  └──────────────────────────────┘  │         │
│  └────────────────────────────────────┘         │
└─────────────────────────────────────────────────┘
```

`InPageGatewaysProvider` creates HTTP-based gateway instances for each configured network. `GatewayProvider` merges these with the wallet gateway, preferring the wallet when connected and falling back to the in-page gateway for read-only access.

---

## Setup

The provider hierarchy is the same as any XL1 dApp — `InPageGatewaysProvider` is already required by `GatewayProvider`. The in-page gateway works without any additional configuration:

```tsx
import { GatewayProvider, ConnectAccountsStack } from '@xyo-network/react-chain-client'
import { MainNetwork } from '@xyo-network/xl1-sdk'

function App() {
  const [address, setAddress] = useState<string>()

  return (
      <WalletGatewayProvider gatewayName={MainNetwork.id}>
        {/* These components can read chain data immediately */}
        <GameHistory />
        <Leaderboard />

        {/* Wallet connection only needed for writes */}
        <ConnectAccountsStack onAccountConnected={setAddress} />
        {address && <GameBoard address={address} />}
      </WalletGatewayProvider>
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
      const payloads = await datalake.next({
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

When a component supports both reading and writing, check the gateway type before attempting writes:

```tsx
function GameBoard({ address }: { address?: string }) {
  const { defaultGateway } = useProvidedGateway()

  const canWrite = defaultGateway && 'addPayloadsToChain' in defaultGateway
  const canRead = !!defaultGateway

  // Read operations work for all visitors
  // Write operations require wallet connection
  return (
    <div>
      {canRead && <GameState gateway={defaultGateway} />}
      {canWrite
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
      const results = await datalake.next({
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

The typical pattern for in-page datalakes separates the UI into **read components** (available to everyone) and **write components** (gated behind wallet connection):

```tsx
function App() {
  const [address, setAddress] = useState<string>()

  return (
    <InPageGatewaysProvider>
      <GatewayProvider gatewayName={MainNetwork.id}>
        {/* Always visible — read-only, powered by in-page gateway */}
        <Header />
        <GameHistory />
        <Leaderboard />

        {/* Always render — handles both unconnected and connected states */}
        <ConnectAccountsStack onAccountConnected={setAddress} />

        {/* Write-gated — only rendered after wallet connection */}
        {address && <ActiveGame address={address} />}
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
```

This gives visitors immediate value (browsing data) while requiring authentication only for state-changing actions. Note that `ConnectAccountsStack` is always rendered — it manages its own display for both the connection prompt and the post-connection state, so do not conditionally swap it for a custom connected UI.

---

## dApp State Management: Local Store + Remote Datalake

Each browser session is isolated — payloads submitted by Player A are invisible to Player B unless both read from a shared data source. The browser wallet does **not** persist off-chain payloads anywhere, and the datalake is not a property on the gateway JS object. The dApp must manage its own state with two layers:

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

2. **Remote datalake** — the shared archivist endpoint (see [Datalakes — HTTP Endpoints](../xl1-knowledge/datalakes.md)). Use `RestDataLakeRunner` (for writes) and `RestDataLakeViewer` (for reads) from `@xyo-network/xl1-sdk`. The dApp pushes payloads here on every submit and polls periodically to discover payloads from other players. Results are merged into the local store with deduplication by data hash.

### Submit flow

On every user action (create game, commit, reveal, settle), **insert into the datalake first, then submit the transaction**. This ordering ensures the payload data is persisted even if the transaction succeeds but the datalake insert would have failed after:

```ts
// 1. Insert into remote datalake — makes payload visible to other players
await datalakeRunner.insert(payloads)

// 2. Store locally for immediate UI update
addPayloads(payloads)

// 3. Submit transaction to chain via wallet
const [txHash] = await gateway.addPayloadsToChain([], payloads)
```

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
| Component needs to write to chain? | Guard with `'addPayloadsToChain' in defaultGateway` check, require wallet connection |
| Display data to unauthenticated users? | Place read-only components outside the wallet connection gate |
| Need to poll for updates? | Use the polling pattern from [Chain Data Indexing](chain-data-indexing.md) — works with in-page gateway |
| Which network for development? | Use Sequence (beta) — live chain, no real tokens. See [Gateway](../xl1-knowledge/gateway.md) |
