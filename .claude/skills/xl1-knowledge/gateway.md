# Gateway

**Key npm packages:**
- `@xyo-network/xl1-rpc` — RPC type definitions, Zod schemas, engine handlers
- `@xyo-network/xl1-providers` — Browser, Node, and Neutral provider implementations

Note: The gateway API server itself is part of the `xyo-chain` runtime repo (not published as a standalone npm package). The packages above cover the client-side RPC and provider interfaces needed for dApp development.

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

## RPC Method Namespaces

Methods follow the pattern `<namespace>_<methodName>`:

### Block Queries (`blockViewer_*`)

| Method | Parameters | Returns |
|--------|-----------|---------|
| `blockViewer_blocksByHash` | `(hash, limit?)` | `SignedHydratedBlockWithHashMeta[]` |
| `blockViewer_blocksByNumber` | `(block, limit?)` | `SignedHydratedBlockWithHashMeta[]` |
| `blockViewer_blockByHash` | `(hash)` | `SignedHydratedBlockWithHashMeta \| null` |
| `blockViewer_blockByNumber` | `(block)` | `SignedHydratedBlockWithHashMeta \| null` |
| `blockViewer_currentBlock` | `()` | `SignedHydratedBlockWithHashMeta` |
| `blockViewer_currentBlockNumber` | `()` | `XL1BlockNumber` |
| `blockViewer_currentBlockHash` | `()` | `Hash` |
| `blockViewer_chainId` | `(blockNumber?)` | `ChainId` |
| `blockViewer_payloadsByHash` | `(hashes)` | `WithHashMeta<Payload>[]` |

### Transaction Queries (`transactionViewer_*`)

| Method | Parameters | Returns |
|--------|-----------|---------|
| `transactionViewer_byHash` | `(txHash)` | `SignedHydratedTransactionWithHashMeta \| null` |
| `transactionViewer_byBlockHashAndIndex` | `(blockHash, index)` | `SignedHydratedTransactionWithHashMeta \| null` |
| `transactionViewer_byBlockNumberAndIndex` | `(blockNumber, index)` | `SignedHydratedTransactionWithHashMeta \| null` |

### Account Balances (`accountBalanceViewer_*`)

| Method | Parameters | Returns |
|--------|-----------|---------|
| `accountBalanceViewer_accountBalance` | `(address, config?)` | `AttoXL1` |
| `accountBalanceViewer_accountBalances` | `(addresses, config?)` | `Record<Address, AttoXL1>` |
| `accountBalanceViewer_accountBalanceHistory` | `(address, config?)` | `AccountBalanceHistoryItem[]` |

### Finalization (`finalizationViewer_*`)

| Method | Parameters | Returns |
|--------|-----------|---------|
| `finalizationViewer_head` | `()` | `SignedHydratedBlockWithHashMeta` |
| `finalizationViewer_headNumber` | `()` | `XL1BlockNumber` |
| `finalizationViewer_headHash` | `()` | `Hash` |
| `finalizationViewer_chainId` | `()` | `ChainId` |

### Mempool (`mempoolViewer_*` / `mempoolRunner_*`)

| Method | Parameters | Returns |
|--------|-----------|---------|
| `mempoolViewer_pendingBlocks` | `(options?)` | `SignedHydratedBlockWithHashMeta[]` |
| `mempoolViewer_pendingTransactions` | `(options?)` | `SignedHydratedTransactionWithHashMeta[]` |
| `mempoolRunner_submitBlocks` | `(blocks)` | `Hash[]` |
| `mempoolRunner_submitTransactions` | `(txs)` | `Hash[]` |

### Staking (`stakeViewer_*`)

| Method | Parameters | Returns |
|--------|-----------|---------|
| `stakeViewer_stakeById` | `(id)` | `Position` |
| `stakeViewer_stakesByStaker` | `(staker)` | `Position[]` |
| `stakeViewer_stakesByStaked` | `(staked)` | `Position[]` |
| `stakeViewer_activeStakes` | `()` | `Position[]` |

### Transaction Operations (`xyoRunner_*` / `xyoSigner_*`)

| Method | Parameters | Returns |
|--------|-----------|---------|
| `xyoRunner_broadcastTransaction` | `(tx)` | `Hash` |
| `xyoSigner_address` | `()` | `Address` |
| `xyoSigner_signTransaction` | `(tx)` | `SignedHydratedTransactionWithHashMeta` |

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
