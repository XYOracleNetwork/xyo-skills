# Gateway Usage

Read this when you need to interact with the XL1 chain from application code — reading chain state, submitting transactions, or accessing the datalake. This is the recipe-style companion to the [Gateway reference](../xl1-knowledge/gateway.md).

These recipes are environment-agnostic: once you have a gateway, the same methods apply whether it came from a React provider, a Node locator, or a test harness.

**Builds on:**
- [Gateway](../xl1-knowledge/gateway.md) — RPC methods, networks, transports
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — React providers, wallet connection, `useProvidedGateway`
- [Node Gateway](../xl1-knowledge/gateway-node.md) — server-side construction
- [Datalakes](../xl1-knowledge/datalakes.md) — DataLakeViewer, DataLakeRunner, endpoints
- [Development on XL1](../xl1-knowledge/development.md) — root barrel imports, Viewer/Runner pattern

---

## Getting a Gateway

The construction step is environment-specific. Pick the file that matches your runtime:

- **Browser / React dApp** — wrap the app in `WalletGatewayProvider` or `GatewayProvider` + `InPageGatewaysProvider`, then call `useProvidedGateway()` in components. See [Browser Gateway](../xl1-knowledge/gateway-browser.md).
- **Node / server-side** — call `basicRemoteViewerLocator` and resolve `XyoGatewayMoniker`. See [Node Gateway](../xl1-knowledge/gateway-node.md).
- **Tests** — use `MemoryRpcTransport` per [Gateway — Transports](../xl1-knowledge/gateway.md).

The variable named `gateway` in the snippets below stands for whatever you got back from your environment's construction. In React it is typically `defaultGateway` from `useProvidedGateway()`; in Node it is the result of `locator.getInstance<XyoGateway>(XyoGatewayMoniker)`. Both expose the same method surface.

The type is a union:
- **`XyoGatewayRunner`** — write-capable (has `addPayloadsToChain`, `send`, etc.). Available when a wallet is connected (browser) or a signer is wired in (Node, when documented).
- **`XyoGateway`** — read-only (has `connection.viewer` but no write methods). Available from the in-page gateway (browser) or `basicRemoteViewerLocator` (Node).
- **`undefined` / `null`** — loading or no gateway available (React context only).

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
const viewer = gateway?.connection.viewer
if (!viewer) return // gateway not ready or no viewer attached

const currentBlock = Number(await viewer.block.currentBlockNumber())
```

### Example: Look up a transaction by hash

```ts
const tx = await gateway?.connection.viewer?.transaction.byHash(txHash)
// tx: SignedHydratedTransactionWithHashMeta | null
// tx[0] = TransactionBoundWitness, tx[1] = resolved payloads (including off-chain)
```

### Example: Check an account balance

```ts
const balance = await gateway?.connection.viewer?.account.balance.accountBalance(address)
// balance: AttoXL1
```

---

## Submitting Transactions

Transaction methods exist only on `XyoGatewayRunner` (write-capable gateway). Always check capability first.

### Adding application data to the chain

```ts
if (gateway && 'addPayloadsToChain' in gateway) {
  // onChain: AllowedBlockPayload[] — system types only
  // offChain: Payload[] — application data of any schema
  const [txHash, signedTx] = await gateway.addPayloadsToChain([], appPayloads)
}
```

This single call builds a `TransactionBoundWitness`, signs it (in the browser this triggers the wallet popup; in Node the in-memory signer signs directly), and broadcasts to the network.

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

**The datalake is independent of the gateway.** The gateway RPC (`/rpc`) and the datalake (`/dataLake`) are separate services. Use the `createRestDataLakeRunner` / `createRestDataLakeViewer` factory helpers from `@xyo-network/xl1-sdk` — do not look for a `.datalake` property on the gateway.

> **Note:** `gateway.connection.storage` exists as a read-only `DataLakeViewer` when the connection is configured with a datalake endpoint. However, it is not the recommended path for dApp code — it is read-only, and it may not point to the datalake endpoint the dApp intends to use. Always create standalone datalake clients.

### Creating a datalake runner (writes)

```ts
import { createRestDataLakeRunner } from '@xyo-network/xl1-sdk'

const datalakeRunner = await createRestDataLakeRunner('https://api.archivist.xyo.network/dataLake')

await datalakeRunner.insert(payloads)
```

### Creating a datalake viewer (reads)

```ts
import { createRestDataLakeViewer } from '@xyo-network/xl1-sdk'

const datalakeViewer = await createRestDataLakeViewer('https://api.archivist.xyo.network/dataLake')

// Read by hash. Discover hashes by walking the chain — see Chain Data
// Indexing for the recommended scan strategies. Do not use .next() to
// browse the datalake (XL1 datalakes have no cursor pagination).
const results = await datalakeViewer.get(hashes)
```

For the typical read flow you do not need to construct a viewer at all — `gateway.connection.viewer.block.*` goes through `ViewerWithDataLake`, which resolves off-chain payloads from the datalake transparently. Construct one only when you have hashes from outside the gateway path (e.g., a hash stored client-side or received out-of-band).

### How the factories build the client

`createRestDataLakeRunner(endpoint)` returns a `RestDataLakeRunner`; `createRestDataLakeViewer(endpoint)` returns a `RestDataLakeViewer`. Each helper wraps a default `BaseConfig` provider context (`baseConfigFactoryLocator`) and registers the datalake provider on a frozen locator before resolving the instance — dApp code no longer needs to construct a provider context manually. If you have a custom locator or need to share a provider context across multiple modules, fall back to `RestDataLakeRunner.create({ context, endpoint })` / `RestDataLakeViewer.create({ context, endpoint })` directly; for standalone dApp use, prefer the factories.

### Datalake endpoints and independence

For endpoint URLs by network, see [Datalakes — HTTP Endpoints](../xl1-knowledge/datalakes.md). The wallet and dApp are independent datalake clients — they may point to different endpoints or either may have no datalake at all. See [Datalakes — Two Independent Datalake Clients](../xl1-knowledge/datalakes.md) for the full breakdown.

---

## Detecting Capabilities

Check whether the gateway supports write operations before attempting transactions:

```ts
const canSubmitToChain = gateway && 'addPayloadsToChain' in gateway
const canRead = !!gateway

// Chain reads: work for any gateway (read-only or write-capable)
// Datalake reads/writes: work via the dApp's own HTTP client, independent of the gateway
// Chain transactions: require an XyoGatewayRunner (wallet-connected in browser, signer-wired in Node)
```

---

## Network Selection

XL1 has three networks. The network identifier is the same string across environments — only the construction call differs:

| Network | Identifier | When to use |
|---------|-----------|-------------|
| **Mainnet** | `MainNetwork.id` (`'mainnet'`) | Production — real XL1 tokens |
| **Sequence** (beta) | `'sequence'` | Development and staging — live chain, no real tokens |
| **Local** | `'local'` | Local development with `xl1 start api` |

For React, pass the identifier as the `gatewayName` prop on the gateway provider — see [Browser Gateway](../xl1-knowledge/gateway-browser.md). For Node, pass it directly to `basicRemoteViewerLocator` — see [Node Gateway](../xl1-knowledge/gateway-node.md).

Start with **Sequence** (beta) to test against a live chain, then switch to **Mainnet** for production.

---

## Anti-Patterns

| Anti-Pattern | Why it fails | Do this instead |
|---|---|---|
| Calling RPC methods directly (raw `fetch` to `/rpc`, manual JSON-RPC payloads) | Loses type safety, provenance, and transport abstraction | Use `connection.viewer` sub-viewers for reads, gateway methods for writes |
| `gateway.datalake` or `gateway.dataLake` | Does not exist on the gateway object | Use `createRestDataLakeRunner` / `createRestDataLakeViewer` |
| `gateway.connection.storage.insert(...)` | `connection.storage` is read-only (`DataLakeViewer`) and may not point to the dApp's desired endpoint | Use `createRestDataLakeRunner` |
| Using `datalakeRunner` / `datalakeViewer` without creating them | These are not globals — they must be instantiated | See [Accessing the Datalake](#accessing-the-datalake) above |
| `datalakeViewer.next(...)` to browse or scan a remote XL1 datalake | XL1 datalakes have no cursor pagination — `.next()` is an unbounded scan with no chain context | Iterate the chain via `viewer.block.*`, then read the datalake by hash. See [Chain Data Indexing](chain-data-indexing.md) and [Datalakes — How to read](../xl1-knowledge/datalakes.md) |
