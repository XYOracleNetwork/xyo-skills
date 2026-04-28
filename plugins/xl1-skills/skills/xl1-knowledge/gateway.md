# Gateway

The generic gateway reference — what it is, the JSON-RPC surface, networks, transports, and the API exposed by `connection.viewer`. Environment-specific construction lives in sibling files:

- [Browser Gateway](gateway-browser.md) — React providers, the wallet extension, `useProvidedGateway`
- [Node Gateway](gateway-node.md) — server-side construction via `basicRemoteViewerLocator`

For cross-environment recipes (read latest block, submit + confirm, datalake access, capability detection, anti-patterns) see [Gateway Usage](../xl1-patterns/gateway-usage.md).

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

---

## Networks

XL1 has three networks. The gateway name (`'mainnet'`, `'sequence'`, `'local'`) is the network identifier — pass it to the React providers in browser dApps (see [Browser Gateway](gateway-browser.md)) or directly to the locator in Node services (see [Node Gateway](gateway-node.md)). The SDK's `DefaultNetworks` maps these to the correct URLs automatically.

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

Chain state is read through sub-viewers on `gateway.connection.viewer`. See [Gateway Usage](../xl1-patterns/gateway-usage.md) for full code examples. For exact type signatures, read the `.d.ts` files in `@xyo-network/xl1-sdk`.

**`connection.viewer` is optional** (`XyoViewer | undefined`). The in-page gateway populates it once it finishes resolving, but a wallet-only or runner-only gateway may not have a viewer. Always guard access with `?.` or an explicit null check.

### Block Queries — `connection.viewer.block`

| When you need to... | Use |
|---------------------|-----|
| Get the latest block number (polling, deadlines) | `.block.currentBlockNumber()` |
| Get the full latest block (header + payloads) | `.block.currentBlock()` |
| Get the latest block hash | `.block.currentBlockHash()` |
| Look up a specific block you already have a hash for | `.block.blockByHash(hash)` |
| Look up a specific block by its number | `.block.blockByNumber(n)` |
| Scan a range of blocks starting from a hash or number | `.block.blocksByHash(hash, limit?)` / `.block.blocksByNumber(n, limit?)` |
| Resolve off-chain payloads referenced in a transaction | `.block.payloadsByHash(hashes)` |
| Get the chain ID at a given block height | `.block.chainId(blockNumber?)` |

### Transaction Queries — `connection.viewer.transaction`

| When you need to... | Use |
|---------------------|-----|
| Look up a transaction by its hash (e.g., after `addPayloadsToChain`) | `.transaction.byHash(txHash)` |
| Look up a transaction by its position within a block | `.transaction.byBlockNumberAndIndex(n, i)` or `.transaction.byBlockHashAndIndex(hash, i)` |

### Account Balances — `connection.viewer.account.balance`

| When you need to... | Use |
|---------------------|-----|
| Check a single account's XL1 balance | `.account.balance.accountBalance(address)` |
| Check multiple account balances in one call | `.account.balance.accountBalances(addresses)` |
| Show balance history over time (charts, audit trails) | `.account.balance.accountBalanceHistory(address)` |

### Finalization — `connection.viewer.finalization`

| When you need to... | Use |
|---------------------|-----|
| Get the latest finalized block (confirmed, irreversible) | `.finalization.head()` |
| Get just the finalized block number or hash | `.finalization.headNumber()` / `.finalization.headHash()` |
| Get the chain ID from the finalized state | `.finalization.chainId()` |

Use finalization viewers when you need confirmed state. Use block viewers when you need the latest state including unfinalized blocks.

### Mempool — `connection.viewer.mempool`

| When you need to... | Use |
|---------------------|-----|
| See pending blocks not yet included in the chain | `.mempool.pendingBlocks()` |
| See pending transactions awaiting inclusion | `.mempool.pendingTransactions()` |

### Staking — `connection.viewer.stake`

| When you need to... | Use |
|---------------------|-----|
| Look up a specific staking position by ID | `.stake.stakeById(id)` |
| List all positions staked by a given address | `.stake.stakesByStaker(address)` |
| List all positions staked on a given address | `.stake.stakesByStaked(address)` |
| List all currently active staking positions | `.stake.activeStakes()` |

### Other Sub-Viewers — `connection.viewer.*`

| Sub-viewer | When to use |
|------------|-------------|
| `.networkStake` | Querying network-level staking aggregates |
| `.step` | Querying step/epoch boundaries and progression |
| `.time` | Time synchronization between client and chain |

### Transaction Methods — on `XyoGatewayRunner` directly

Transaction submission is done through high-level methods on the gateway itself (not through `connection.viewer`). These require a wallet connection:

| When you need to... | Use |
|---------------------|-----|
| Record application data on-chain (game moves, attestations) | `gateway.addPayloadsToChain(onChain, offChain)` |
| Submit a transaction you built manually | `gateway.addTransactionToChain(tx, offChain?)` |
| Send XL1 tokens to one address | `gateway.send(to, amount)` |
| Send XL1 tokens to multiple addresses | `gateway.sendMany(transfers)` |
| Wait for a submitted transaction to be included in a block | `gateway.confirmSubmittedTransaction(txHash)` |

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

- **Browser provider** — for web dApps, uses PostMessage transport. See [Browser Gateway](gateway-browser.md).
- **Node provider** — for backend services, uses HTTP transport. See [Node Gateway](gateway-node.md).
- **Neutral provider** — platform-agnostic primitives shared by both.

The construction helpers (`basicRemoteViewerLocator`, `buildProviderLocator`, the React provider components) live with their respective environment-specific files.

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
