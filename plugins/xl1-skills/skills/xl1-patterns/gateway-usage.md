# Gateway Usage

Read this when you need to interact with the XL1 chain from application code — reading chain state, submitting transactions, or accessing the datalake. This is the recipe-style companion to the [Gateway reference](../xl1-knowledge/gateway.md).

**Builds on:**
- [Gateway](../xl1-knowledge/gateway.md) — RPC methods, networks, transports
- [Browser Wallet](../xl1-knowledge/wallet.md) — providers, wallet connection, React integration
- [Datalakes](../xl1-knowledge/datalakes.md) — DataLakeViewer, DataLakeRunner, endpoints
- [Development on XL1](../xl1-knowledge/development.md) — root barrel imports, Viewer/Runner pattern

---

## Setup: Choosing Your Provider

Two providers publish a gateway to React context. Both are in `@xyo-network/react-chain-client`:

| Provider | Wallet required? | Read-only fallback | Use when |
|----------|-----------------|-------------------|----------|
| `WalletGatewayProvider` | Yes | No | App strictly requires a wallet for all functionality |
| `GatewayProvider` + `InPageGatewaysProvider` | No | Yes (in-page HTTP gateway) | App should work read-only without a wallet |

### Wallet-only setup

```tsx
import { WalletGatewayProvider } from '@xyo-network/react-chain-client'
import { MainNetwork } from '@xyo-network/xl1-sdk'

function App() {
  return (
    <WalletGatewayProvider gatewayName={MainNetwork.id}>
      <YourDApp />
    </WalletGatewayProvider>
  )
}
```

### Hybrid setup (read-only fallback)

```tsx
import { InPageGatewaysProvider, GatewayProvider } from '@xyo-network/react-chain-client'
import { MainNetwork } from '@xyo-network/xl1-sdk'

function App() {
  return (
    <InPageGatewaysProvider>
      <GatewayProvider gatewayName={MainNetwork.id}>
        <YourDApp />
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
```

`GatewayProvider` requires `InPageGatewaysProvider` as an ancestor. It merges the in-page gateway and wallet gateway into a single `defaultGateway` — wallet wins when connected, in-page is the fallback.

**`gatewayName` is required** on both providers. Without it, `defaultGateway` is always `undefined`. Use `MainNetwork.id` (value: `'mainnet'`) for production, `'sequence'` for beta/staging, `'local'` for local development.

---

## Accessing the Gateway

Use `useProvidedGateway()` in any component under a gateway provider:

```tsx
import { useProvidedGateway } from '@xyo-network/react-chain-client'

function MyComponent() {
  const { defaultGateway } = useProvidedGateway()
  // defaultGateway: XyoGateway | XyoGatewayRunner | undefined | null
}
```

The return type is a union:
- **`XyoGatewayRunner`** — write-capable (has `addPayloadsToChain`, `send`, etc.). Available when wallet is connected.
- **`XyoGateway`** — read-only (has `connection.viewer` but no write methods). Available from the in-page gateway.
- **`undefined` / `null`** — loading or no gateway available.

---

## Reading Chain State

Chain state is accessed through sub-viewers on `gateway.connection.viewer`. The viewer is typed `XyoViewer | undefined` — always guard access.

### Sub-viewer reference

| Sub-viewer | When to use |
|------------|-------------|
| `.block` | Query blocks, get latest block number (for polling/deadlines), resolve off-chain payloads by hash |
| `.transaction` | Look up transactions by hash or by position within a block |
| `.account.balance` | Check XL1 balances, batch balance lookups, balance history |
| `.finalization` | Get the latest **finalized** (irreversible) block — use when you need confirmed state rather than latest |
| `.mempool` | Inspect pending blocks/transactions not yet included in the chain |
| `.stake` | Look up staking positions by ID, staker, or staked address |
| `.networkStake` | Network-level staking aggregates |
| `.step` | Step/epoch boundaries and progression |
| `.time` | Time synchronization between client and chain |

See [Gateway — Viewer API](../xl1-knowledge/gateway.md) for the full method-by-method reference.

### Example: Read current block number

```ts
const viewer = defaultGateway?.connection.viewer
if (!viewer) return // gateway not ready or no viewer attached

const currentBlock = Number(await viewer.block.currentBlockNumber())
```

### Example: Look up a transaction by hash

```ts
const tx = await defaultGateway?.connection.viewer?.transaction.byHash(txHash)
// tx: SignedHydratedTransactionWithHashMeta | null
// tx[0] = TransactionBoundWitness, tx[1] = resolved payloads (including off-chain)
```

### Example: Check an account balance

```ts
const balance = await defaultGateway?.connection.viewer?.account.balance.accountBalance(address)
// balance: AttoXL1
```

---

## Submitting Transactions

Transaction methods exist only on `XyoGatewayRunner` (wallet-connected gateway). Always check capability first.

### Adding application data to the chain

```ts
const { defaultGateway } = useProvidedGateway()

if (defaultGateway && 'addPayloadsToChain' in defaultGateway) {
  // onChain: AllowedBlockPayload[] — system types only
  // offChain: Payload[] — application data of any schema
  const [txHash, signedTx] = await defaultGateway.addPayloadsToChain([], appPayloads)
}
```

This single call builds a `TransactionBoundWitness`, triggers the wallet popup for signing, and broadcasts to the network.

### Token transfers

```ts
const txHash = await gateway.send(toAddress, amount)
const txHash = await gateway.sendMany({ [addr1]: amount1, [addr2]: amount2 })
```

### Pre-built transactions

```ts
const [txHash, signedTx] = await gateway.addTransactionToChain(unsignedTx, offChainPayloads)
```

### Transaction confirmation

```ts
const confirmedTx = await gateway.confirmSubmittedTransaction(txHash)
```

---

## Accessing the Datalake

**The datalake is independent of the gateway.** The gateway RPC (`/rpc`) and the datalake (`/dataLake`) are separate services. Use standalone `RestDataLakeRunner` and `RestDataLakeViewer` from `@xyo-network/xl1-sdk` — do not look for a `.datalake` property on the gateway.

> **Note:** `gateway.connection.storage` exists as a read-only `DataLakeViewer` when the connection is configured with a datalake endpoint. However, it is not the recommended path for dApp code — it is read-only, and it may not point to the datalake endpoint the dApp intends to use. Always create standalone datalake clients.

### Creating a datalake runner (writes)

```ts
import { RestDataLakeRunner, type RestDataLakeRunnerParams } from '@xyo-network/xl1-sdk'
import { getTestProviderContext } from '@xyo-network/xl1-protocol-sdk/test'

const context = getTestProviderContext()
const datalakeRunner = await RestDataLakeRunner.create({
  context,
  endpoint: 'https://api.archivist.xyo.network/dataLake',
} satisfies RestDataLakeRunnerParams)

await datalakeRunner.insert(payloads)
```

### Creating a datalake viewer (reads)

```ts
import { RestDataLakeViewer, type RestDataLakeViewerParams } from '@xyo-network/xl1-sdk'
import { getTestProviderContext } from '@xyo-network/xl1-protocol-sdk/test'

const context = getTestProviderContext()
const datalakeViewer = await RestDataLakeViewer.create({
  context,
  endpoint: 'https://api.archivist.xyo.network/dataLake',
} satisfies RestDataLakeViewerParams)

// Read by hash. Discover hashes by walking the chain — see Chain Data
// Indexing for the recommended scan strategies. Do not use .next() to
// browse the datalake (XL1 datalakes have no cursor pagination).
const results = await datalakeViewer.get(hashes)
```

For the typical read flow you do not need to construct a `RestDataLakeViewer` at all — `gateway.connection.viewer.block.*` goes through `ViewerWithDataLake`, which resolves off-chain payloads from the datalake transparently. Construct one only when you have hashes from outside the gateway path (e.g., a hash stored client-side or received out-of-band).

### The `context` parameter

Both `RestDataLakeRunner.create()` and `RestDataLakeViewer.create()` require a `context: CreatableProviderContext` parameter. Create it with `getTestProviderContext()` from `@xyo-network/xl1-protocol-sdk/test`:

```ts
import { getTestProviderContext } from '@xyo-network/xl1-protocol-sdk/test'

const context = getTestProviderContext()
```

This is a sub-path import — an exception to the root barrel rule. `getTestProviderContext` is the current recommended way to create a provider context for standalone datalake clients in dApp code.

### Datalake endpoints and independence

For endpoint URLs by network, see [Datalakes — HTTP Endpoints](../xl1-knowledge/datalakes.md). The wallet and dApp are independent datalake clients — they may point to different endpoints or either may have no datalake at all. See [Datalakes — Two Independent Datalake Clients](../xl1-knowledge/datalakes.md) for the full breakdown.

---

## Detecting Capabilities

Check whether the gateway supports write operations before attempting transactions:

```ts
const { defaultGateway } = useProvidedGateway()

const canSubmitToChain = defaultGateway && 'addPayloadsToChain' in defaultGateway
const canRead = !!defaultGateway

// Chain reads: work for all visitors (in-page gateway)
// Datalake reads/writes: work for all visitors (dApp's own HTTP client)
// Chain transactions: require wallet connection (XyoGatewayRunner)
```

---

## Network Selection

XL1 has three networks. The `gatewayName` prop on providers selects the network:

| Network | `gatewayName` | When to use |
|---------|--------------|-------------|
| **Mainnet** | `MainNetwork.id` (`'mainnet'`) | Production — real XL1 tokens |
| **Sequence** (beta) | `'sequence'` | Development and staging — live chain, no real tokens |
| **Local** | `'local'` | Local development with `xl1 start api` |

```tsx
import { MainNetwork } from '@xyo-network/xl1-sdk'

// Production
<WalletGatewayProvider gatewayName={MainNetwork.id}>

// Development
<WalletGatewayProvider gatewayName="sequence">
```

Start with **Sequence** (beta) to test against a live chain, then switch to **Mainnet** for production.

---

## Anti-Patterns

| Anti-Pattern | Why it fails | Do this instead |
|---|---|---|
| Calling RPC methods directly (raw `fetch` to `/rpc`, manual JSON-RPC payloads) | Loses type safety, provenance, and transport abstraction | Use `connection.viewer` sub-viewers for reads, gateway methods for writes |
| `gateway.datalake` or `gateway.dataLake` | Does not exist on the gateway object | Use standalone `RestDataLakeRunner`/`RestDataLakeViewer` |
| `gateway.connection.storage.insert(...)` | `connection.storage` is read-only (`DataLakeViewer`) and may not point to the dApp's desired endpoint | Use standalone `RestDataLakeRunner` |
| Using `datalakeRunner` / `datalakeViewer` without creating them | These are not globals — they must be instantiated | See [Accessing the Datalake](#accessing-the-datalake) above |
| `datalakeViewer.next(...)` to browse or scan a remote XL1 datalake | XL1 datalakes have no cursor pagination — `.next()` is an unbounded scan with no chain context | Iterate the chain via `viewer.block.*`, then read the datalake by hash. See [Chain Data Indexing](chain-data-indexing.md) and [Datalakes — How to read](../xl1-knowledge/datalakes.md) |
