# Gateway

**Key npm packages:**
- `@xyo-network/xl1-providers` — Browser, Node, and Neutral provider implementations

Note: The gateway API server itself is part of the `xyo-chain` runtime repo (not published as a standalone npm package). The package above covers the client-side provider interfaces needed for dApp development.

---

## XL1 Gateway

The gateway is a JSON-RPC 2.0 API server that exposes XL1 chain data and operations.

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rpc` | POST | JSON-RPC 2.0 — all viewer and runner methods |
| `/chain` | Various | Archivist middleware for finalized chain data (datalake) |
| `/startupz` | GET | Startup health probe |
| `/readyz` | GET | Readiness health probe |
| `/livez` | GET | Liveness health probe |

---

## Networks

XL1 has three networks. The gateway name (`'mainnet'`, `'sequence'`, `'local'`) is what you pass to `WalletGatewayProvider` (wallet-only) or `GatewayProvider` (hybrid, with `InPageGatewaysProvider` for read-only fallback). The SDK's `DefaultNetworks` maps these to the correct URLs automatically.

| Network | Gateway Name | Gateway RPC | Datalake | Explorer |
|---------|-------------|-------------|----------|----------|
| **Mainnet** | `'mainnet'` | `https://api.chain.xyo.network/rpc` | `https://api.archivist.xyo.network/dataLake` | `https://explore.xyo.network` |
| **Sequence** (beta) | `'sequence'` | `https://beta.api.chain.xyo.network/rpc` | `https://beta.api.archivist.xyo.network/dataLake` | `https://beta.explore.xyo.network` |
| **Local** | `'local'` | `http://localhost:8080/rpc` | `http://localhost:8080/dataLake` | `http://localhost:3000` |

**When to use each:**
- **Mainnet** — production deployments. Real XL1 tokens, real transactions.
- **Sequence** — testing and staging. Use this for development against a live network without affecting production. This is the default for beta/staging deployments.
- **Local** — local development with a locally running gateway (`xl1 start api`). No network dependency.

For dApp development, start with **Sequence** (beta) to test against a live chain, then switch to **Mainnet** for production.

---

## Gateway Viewer API

Chain state is read through sub-viewers on `gateway.connection.viewer`. Each sub-viewer groups related query methods. See [Gateway Usage](../xl1-patterns/gateway-usage.md) for full usage examples with code.

**`connection.viewer` is optional** (`XyoViewer | undefined`). The in-page gateway populates it once it finishes resolving, but a wallet-only or runner-only gateway may not have a viewer. Always guard access with `?.` or an explicit null check.

### Block Queries — `connection.viewer.block`

| Method | Parameters | Returns |
|--------|-----------|---------|
| `.block.blocksByHash(...)` | `(hash, limit?)` | `SignedHydratedBlockWithHashMeta[]` |
| `.block.blocksByNumber(...)` | `(block, limit?)` | `SignedHydratedBlockWithHashMeta[]` |
| `.block.blockByHash(...)` | `(hash)` | `SignedHydratedBlockWithHashMeta \| null` |
| `.block.blockByNumber(...)` | `(block)` | `SignedHydratedBlockWithHashMeta \| null` |
| `.block.currentBlock()` | `()` | `SignedHydratedBlockWithHashMeta` |
| `.block.currentBlockNumber()` | `()` | `XL1BlockNumber` |
| `.block.currentBlockHash()` | `()` | `Hash` |
| `.block.chainId(...)` | `(blockNumber?)` | `ChainId` |
| `.block.payloadsByHash(...)` | `(hashes)` | `WithHashMeta<Payload>[]` |

### Transaction Queries — `connection.viewer.transaction`

| Method | Parameters | Returns |
|--------|-----------|---------|
| `.transaction.byHash(...)` | `(txHash)` | `SignedHydratedTransactionWithHashMeta \| null` |
| `.transaction.byBlockHashAndIndex(...)` | `(blockHash, index)` | `SignedHydratedTransactionWithHashMeta \| null` |
| `.transaction.byBlockNumberAndIndex(...)` | `(blockNumber, index)` | `SignedHydratedTransactionWithHashMeta \| null` |

### Account Balances — `connection.viewer.account.balance`

| Method | Parameters | Returns |
|--------|-----------|---------|
| `.account.balance.accountBalance(...)` | `(address, config?)` | `AttoXL1` |
| `.account.balance.accountBalances(...)` | `(addresses, config?)` | `Record<Address, AttoXL1>` |
| `.account.balance.accountBalanceHistory(...)` | `(address, config?)` | `AccountBalanceHistoryItem[]` |

### Finalization — `connection.viewer.finalization`

| Method | Parameters | Returns |
|--------|-----------|---------|
| `.finalization.head()` | `()` | `SignedHydratedBlockWithHashMeta` |
| `.finalization.headNumber()` | `()` | `XL1BlockNumber` |
| `.finalization.headHash()` | `()` | `Hash` |
| `.finalization.chainId()` | `()` | `ChainId` |

### Mempool — `connection.viewer.mempool`

| Method | Parameters | Returns |
|--------|-----------|---------|
| `.mempool.pendingBlocks(...)` | `(options?)` | `SignedHydratedBlockWithHashMeta[]` |
| `.mempool.pendingTransactions(...)` | `(options?)` | `SignedHydratedTransactionWithHashMeta[]` |

### Staking — `connection.viewer.stake`

| Method | Parameters | Returns |
|--------|-----------|---------|
| `.stake.stakeById(...)` | `(id)` | `Position` |
| `.stake.stakesByStaker(...)` | `(staker)` | `Position[]` |
| `.stake.stakesByStaked(...)` | `(staked)` | `Position[]` |
| `.stake.activeStakes()` | `()` | `Position[]` |

### Other Sub-Viewers — `connection.viewer.*`

| Sub-viewer | Type | Purpose |
|------------|------|---------|
| `.networkStake` | `NetworkStakeViewer` | Network-level staking queries |
| `.step` | `StepViewer` | Step/epoch queries |
| `.time` | `TimeSyncViewer` | Time synchronization queries |

### Transaction Methods — on `XyoGatewayRunner` directly

Transaction submission is done through high-level methods on the gateway itself (not through `connection.viewer`). These require a wallet connection:

| Method | Parameters | Returns |
|--------|-----------|---------|
| `gateway.addPayloadsToChain(...)` | `(onChain, offChain, options?)` | `[Hash, SignedHydratedTransactionWithHashMeta]` |
| `gateway.addTransactionToChain(...)` | `(tx, offChain?)` | `[Hash, SignedHydratedTransactionWithHashMeta]` |
| `gateway.send(...)` | `(to, amount, options?)` | `Hash` |
| `gateway.sendMany(...)` | `(transfers, options?)` | `Hash` |
| `gateway.confirmSubmittedTransaction(...)` | `(txHash, options?)` | `SignedHydratedTransaction` |

See [Gateway Usage — Submitting Transactions](../xl1-patterns/gateway-usage.md) for details.

---

## Connection Properties

The gateway object (`XyoGateway` or `XyoGatewayRunner`) exposes chain access through `gateway.connection`:

| Property | Type | Description |
|----------|------|-------------|
| `.viewer` | `XyoViewer \| undefined` | Read-only chain state (sub-viewers for blocks, transactions, balances, etc.) |
| `.storage` | `DataLakeViewer \| undefined` | Read-only datalake attached to this connection. May not point to the dApp's desired endpoint. |
| `.runner` | `XyoRunner \| undefined` | Low-level runner (internal — use gateway methods instead) |
| `.network` | `XyoNetwork \| undefined` | Network metadata |

**`connection.storage` is not the recommended datalake path.** It is a read-only `DataLakeViewer` populated from the connection's configuration — it cannot write, and it may not point to the endpoint the dApp wants to use. For datalake access, create standalone `RestDataLakeRunner` / `RestDataLakeViewer` clients. See [Gateway Usage — Accessing the Datalake](../xl1-patterns/gateway-usage.md) and [Datalakes](datalakes.md).

---

## Transports

| Transport | Use Case |
|-----------|----------|
| `HttpRpcTransport` | Network — connect to a remote gateway over HTTP |
| `PostMessageRpcTransport` | Browser — cross-window communication (wallet ↔ dApp) |
| `MemoryRpcTransport` | Testing — in-memory JSON-RPC engine |

---

## Providers

`@xyo-network/xl1-providers` offers environment-specific provider bundles:

- **Browser provider** — for web dApps, uses PostMessage transport
- **Node provider** — for backend services, uses HTTP transport
- **Neutral provider** — platform-agnostic

Use `buildProviderLocator()` to wire up the standard provider dependency tree.

---

## Running the Gateway

### Via CLI
```bash
xl1 start api                    # Start API server only
xl1 start api producer validator # Start multiple actors
```

### Via pnpm (from xyo-chain repo)
```bash
pnpm run-api
```

### Configuration

100% environment-driven via `XL1_*` variables:

| Variable | Purpose |
|----------|---------|
| `XL1_CHAIN__ID` | Staking contract address on backing EVM |
| `XL1_EVM__CHAIN_ID` | EVM chain (Sepolia, Mainnet, Ganache) |
| `XL1_ACTORS__API_*` | API server configuration |
| `XL1_STORAGE__ROOT` | LMDB data directory |
| `XL1_STORAGE__MONGO__*` | MongoDB connection settings |
