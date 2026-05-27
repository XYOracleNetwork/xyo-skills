# Gateway

The env-agnostic gateway file — what the gateway is, the JSON-RPC surface, networks, the `connection.viewer` API, transaction methods, datalake access, and anti-patterns. Reference + cross-environment recipes in one place.

Environment-specific construction lives in sibling files:

- [Browser Gateway](gateway-browser.md) — React providers, the wallet extension, `useProvidedGateway`
- [Node Gateway](gateway-node.md) — server-side construction via `GatewayBuilder` (`.build()` for read-only, `.build(signer)` for write-capable)

**Key npm packages:**
- `@xyo-network/xl1-providers` — Browser, Node, and Neutral provider implementations
- `@xyo-network/xl1-sdk` — `createRestDataLakeRunner`, `createRestDataLakeViewer`, network constants

Note: The gateway API server itself is part of the `xyo-chain` runtime repo (not published as a standalone npm package). The packages above cover the client-side provider interfaces needed for dApp development.

---

## XL1 Gateway

The gateway is a JSON-RPC 2.0 API server that exposes XL1 chain data and operations.

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rpc` | POST | JSON-RPC 2.0 — all viewer and runner methods |
| `/chain` | Various | Archivist middleware for finalized chain data (datalake) |

---

## Never Issue Raw RPC Calls

**This is never done.** The XL1 gateway is reached exclusively through the SDK. Two rules apply equally to dApp code, services, indexers, tests, and verification scripts:

### 1. Raw XL1 JSON-RPC method names

The gateway speaks JSON-RPC 2.0 under the hood and exposes method names like `blockViewer_blocksByNumber`, `blockViewer_currentBlockNumber`, `transactionViewer_byHash`, `accountBalanceViewer_accountBalance`, etc. **Never call these directly** — not via `fetch('/rpc', { body: '{"method":"blockViewer_..."}' })`, not via a hand-rolled JSON-RPC client, not by importing internal transport classes.

Calling them directly:
- Loses the SDK's type definitions for params and return shapes
- Skips off-chain payload hydration (the SDK's `ViewerWithDataLake` wrapper handles this — the raw RPC does not)
- Skips block validators and provenance checks
- Bypasses the transport abstraction (HTTP vs PostMessage vs Memory)
- Will silently break when method names or shapes change

**Always go through `gateway.connection.viewer.*` sub-viewers for reads and gateway methods (`addPayloadsToChain`, `send`, etc.) for writes.** If a method seems missing, read the `.d.ts` files in `@xyo-network/xl1-sdk` — the wrapper covers everything the raw RPC does.

### 2. Ethereum RPC method names

**XL1 is not an EVM chain.** Method names from the Ethereum JSON-RPC spec do not exist on the XL1 gateway and will return errors:

| Ethereum method (does not work on XL1) | XL1 equivalent |
|---|---|
| `eth_blockNumber` | `gateway.connection.viewer.block.currentBlockNumber()` |
| `eth_getBlockByNumber` | `gateway.connection.viewer.block.blockByNumber(n)` |
| `eth_getBalance` | `gateway.connection.viewer.account.balance.accountBalance(address)` |
| `eth_getTransactionByHash` | `gateway.connection.viewer.transaction.byHash(hash)` |
| `eth_sendTransaction` / `eth_sendRawTransaction` | `gateway.addPayloadsToChain(...)` / `gateway.send(...)` |
| `eth_call` | (no equivalent — XL1 has no contract execution model) |
| `eth_chainId` | `gateway.connection.viewer.block.chainId()` |
| `eth_accounts` / `personal_sign` | Use `XyoSigner` (browser: wallet extension; Node: `buildSimpleXyoSignerV2`) |

XL1 shares Ethereum's secp256k1 keys and BIP44 derivation path (`m/44'/60'/0'/0/0`), so a single seed phrase produces the same address in MetaMask and the XYO wallet — but **the chain protocol is entirely different**. Address compatibility is the *only* thing the two chains share. Anything else borrowed from Ethereum tooling (`ethers`, `web3.js`, `viem`, hardhat helpers, EIP-1193 providers) will not work against XL1.

### Self-check before completion

Grep your diff for these tells. If any match, the work is not done. The checks are structural — they look at protocol shape, not at an enumerated list of method names, so they stay valid as the XL1 method surface grows:

```shell
# Hand-rolled JSON-RPC envelopes. The "jsonrpc" field is required by JSON-RPC 2.0;
# no legitimate SDK consumer writes it in source. Catches any bypass regardless of
# which method name it carries — current or future.
grep -rE '"jsonrpc"\s*:' src/

# Ethereum JSON-RPC namespaces. These are defined by the Ethereum spec and do not
# exist on the XL1 gateway. Stable list — Ethereum namespaces are not being added.
grep -rE "\b(eth|net|web3|personal|engine)_[a-zA-Z]+\b" src/
```

A clean grep is part of the Definition of Done — see [dApp Checklist — Gateway & Chain Access](../xl1-patterns/dapp-checklist.md#gateway--chain-access).

---

## Networks

XL1 has three networks. The gateway name (`'mainnet'`, `'sequence'`, `'local'`) is the network identifier — pass it to the React providers in browser dApps (see [Browser Gateway](gateway-browser.md)) or to `GatewayBuilder().name(id).rpcUrl(...)` in Node services (see [Node Gateway](gateway-node.md)). The SDK's `DefaultNetworks` maps these to the correct URLs automatically.

| Network | Gateway Name | Gateway RPC | Datalake | Explorer |
|---------|-------------|-------------|----------|----------|
| **Mainnet** | `'mainnet'` | `https://api.chain.xyo.network/rpc` | `https://api.archivist.xyo.network/dataLake` | `https://explore.xyo.network` |
| **Sequence** (beta) | `'sequence'` | `https://beta.api.chain.xyo.network/rpc` | `https://beta.api.archivist.xyo.network/dataLake` | `https://beta.explore.xyo.network` |
| **Local** | `'local'` | `http://localhost:8080/rpc` | `http://localhost:8080/dataLake` | `http://localhost:3000` |

The Explorer URL and `NetworkId` for each network are also exposed on `MainNetwork` / `SequenceNetwork` / `LocalNetwork` (and via `DefaultNetworks`) from `@xyo-network/xl1-sdk`. Pair them with `ExplorerLinks` from the same barrel to build canonical Explorer URLs for addresses, blocks, transactions, and payloads — never hand-concatenate explorer paths. UI conventions for *when* to render those links live in [Browser UX — Display Conventions](../xl1-patterns/browser-ux.md#display-conventions).

**When to use each:**
- **Mainnet** — production deployments. Real XL1 tokens, real transactions.
- **Sequence** — testing and staging. Use this for development against a live network without affecting production. This is the default for beta/staging deployments.
- **Local** — local development with a locally running gateway (`xl1 start api`). No network dependency.

For dApp development, start with **Sequence** (beta) to test against a live chain, then switch to **Mainnet** for production.

---

## Getting a Gateway

The construction step is environment-specific. Pick the file that matches your runtime:

- **Browser / React dApp** — wrap the app in `WalletGatewayProvider` or `GatewayProvider` + `InPageGatewaysProvider`, then call `useProvidedGateway()` in components. See [Browser Gateway](gateway-browser.md).
- **Node / server-side / headless** — use `GatewayBuilder` from `@xyo-network/xl1-sdk`. `.build()` for read-only, `.build(signer)` for write-capable. See [Node Gateway](gateway-node.md).
- **Tests** — use `MemoryRpcTransport` (see [Transports](#transports) below).

The variable named `gateway` in the recipes below stands for whatever you got back from your environment's construction. In React it is typically `defaultGateway` from `useProvidedGateway()`; in Node it is the result of `new GatewayBuilder().rpcUrl(...).build()` (or `.build(signer)`). Both expose the same method surface.

The type is a union:
- **`XyoGatewayRunner`** — write-capable (has `addPayloadsToChain`, `send`, etc.). Available when a wallet is connected (browser) or a signer is wired in (Node, via `GatewayBuilder.build(signer)`).
- **`XyoGateway`** — read-only (has `connection.viewer` but no write methods). Available from the in-page gateway (browser) or `GatewayBuilder.build()` (Node).
- **`undefined` / `null`** — loading or no gateway available (React context only).

---

## Connection Properties

The gateway object (`XyoGateway` or `XyoGatewayRunner`) exposes chain access through `gateway.connection`:

| Property | Type | Description |
|----------|------|-------------|
| `.viewer` | `XyoViewer \| undefined` | Read-only chain state (sub-viewers for blocks, transactions, balances, etc.) |
| `.storage` | `DataLakeViewer \| undefined` | Read-only datalake attached to this connection. May not point to the dApp's desired endpoint. |
| `.runner` | `XyoRunner \| undefined` | Low-level runner (internal — use gateway methods instead) |
| `.network` | `XyoNetwork \| undefined` | Network metadata |

**`connection.storage` is not the recommended datalake path.** It is a read-only `DataLakeViewer` populated from the connection's configuration — it cannot write, and it may not point to the endpoint the dApp wants to use. For datalake access, see [Accessing the Datalake](#accessing-the-datalake) below and [Datalakes](datalakes.md).

---

## Reading Chain State

Chain state is read through sub-viewers on `gateway.connection.viewer`. **`connection.viewer` is optional** (`XyoViewer | undefined`). The in-page gateway populates it once it finishes resolving, but a wallet-only or runner-only gateway may not have a viewer. Always guard access with `?.` or an explicit null check.

For exact type signatures, read the `.d.ts` files in `@xyo-network/xl1-sdk`.

### Sub-viewer summary

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

```ts
const viewer = gateway?.connection.viewer
if (!viewer) return // gateway not ready or no viewer attached

const currentBlock = Number(await viewer.block.currentBlockNumber())
```

#### What `block.blockByNumber` (and friends) returns — hydration is shallow

`viewer.block.blockByNumber(n)`, `blockByHash(h)`, `blocksByNumber(...)`, `blocksByHash(...)`, `currentBlock()` all return the block's **on-chain** payloads only:

- The `BlockBoundWitness` itself
- `TransactionBoundWitness` instances included in the block
- `network.xyo.transfer` (sentinel/value transfer payloads)
- `network.xyo.time`
- Other system payloads listed in `AllowedBlockPayloadSchemas`

They **do not fetch the off-chain application payloads referenced by each `TransactionBoundWitness.payload_hashes[]`**, even when the gateway has a datalake configured (browser in-page provider or Node `GatewayBuilder().dataLakeEndpoint(...)`). This is structural: the SDK's `addDataLakePayloads` step is bound-witness-local — it inspects only the immediate bound witness's `payload_hashes`, never recursing into nested `TransactionBoundWitness` instances. Both the block and transaction viewers share the same `dataLakeViewer`; the asymmetry is purely *which* bound witness's hashes get inspected.

| Entrypoint | What gets hydrated from the datalake |
|---|---|
| `viewer.transaction.byHash(txHash)` | The wrapping `TransactionBoundWitness` **plus** the off-chain payloads it references — full hydration |
| `viewer.block.blockByNumber(n)` (and the other block.* readers) | The block's on-chain payloads only — off-chain payloads referenced inside nested `TransactionBoundWitness` instances are **absent** |
| `viewer.block.payloadsByHash(hashes)` | Off-chain payloads fetched by hash from the datalake — the explicit second step |

**The two-step pattern.** When you walk blocks and need the off-chain content of a transaction in that block, do not assume `block[1]` already contains it. Pick one:

1. For each `TransactionBoundWitness` in `block[1]`, call `viewer.transaction.byHash(txBw._hash)` — returns the tx with its off-chain payloads hydrated.
2. Collect the payload hashes you care about from each `TransactionBoundWitness.payload_hashes[]` (filtering by the parallel `payload_schemas[]` is usually how you decide which ones to keep), then call `viewer.block.payloadsByHash(hashes)` to fetch them in one batch.

Pattern 2 is the canonical shape for indexer block walks because it issues one combined datalake fetch per block instead of one per transaction. See [Chain Data Indexing — Step 3](../xl1-patterns/chain-data-indexing-protocol.md#step-3-query-by-schema) for the full block-walk recipe.

**Tripwire.** A test in the SDK pins this shallow behavior. The intended end-state is deep hydration at the block level — a consistent return-value contract regardless of which entrypoint a caller used. When that lands, the test flips and these docs can be simplified back to "either entrypoint hydrates everything." Until then, teach the two-step pattern.

### Transaction Queries — `connection.viewer.transaction`

| When you need to... | Use |
|---------------------|-----|
| Look up a transaction by its hash (e.g., after `addPayloadsToChain`) | `.transaction.byHash(txHash)` |
| Look up a transaction by its position within a block | `.transaction.byBlockNumberAndIndex(n, i)` or `.transaction.byBlockHashAndIndex(hash, i)` |

```ts
const tx = await gateway?.connection.viewer?.transaction.byHash(txHash)
// tx: SignedHydratedTransactionWithHashMeta | null
// tx[0] = TransactionBoundWitness, tx[1] = resolved payloads (including off-chain)
```

### Account Balances — `connection.viewer.account.balance`

| When you need to... | Use |
|---------------------|-----|
| Check a single account's XL1 balance | `.account.balance.accountBalance(address)` |
| Check multiple account balances in one call | `.account.balance.accountBalances(addresses)` |
| Show balance history over time (charts, audit trails) | `.account.balance.accountBalanceHistory(address)` |

```ts
const balance = await gateway?.connection.viewer?.account.balance.accountBalance(address)
// balance: AttoXL1
```

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

---

## Submitting Transactions

Transaction submission is done through high-level methods on the gateway itself (not through `connection.viewer`). These exist only on `XyoGatewayRunner` (write-capable gateway). Always check capability first — see [Detecting Capabilities](#detecting-capabilities).

| When you need to... | Use |
|---------------------|-----|
| Record application data on-chain (game moves, attestations) | `gateway.addPayloadsToChain(onChain, offChain)` |
| Submit a transaction you built manually | `gateway.addTransactionToChain(tx, offChain?)` |
| Send XL1 tokens to one address | `gateway.send(to, amount)` |
| Send XL1 tokens to multiple addresses | `gateway.sendMany(transfers)` |
| Wait for a submitted transaction to be included in a block | `gateway.confirmSubmittedTransaction(txHash)` |

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

`confirmSubmittedTransaction` polls the gateway until the transaction is included in a block. The defaults are **`attempts: 20`, `delay: 1_000`** (20 attempts at 1-second intervals — a 20-second total budget). That budget is too short for Sequence, where finalization regularly takes a few minutes. Always pass explicit options when running against Sequence:

```ts
// poll up to 30 times, 10s apart — ~5 minutes total budget
await gateway.confirmSubmittedTransaction(txHash, { attempts: 30, delay: 10_000 })
```

The 30 × 10s budget is the verified-working baseline for Sequence. Tune downward for local devnets (`{ attempts: 10, delay: 500 }` is plenty), upward for archival jobs or congested-network conditions. Mainnet block cadence is similar to Sequence — start with 30 × 10s and adjust if you observe systematic timeouts.

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

## Accessing the Datalake

**The datalake is independent of the gateway.** The gateway RPC (`/rpc`) and the datalake (`/dataLake`) are separate services. Use the `createRestDataLakeRunner` / `createRestDataLakeViewer` factory helpers from `@xyo-network/xl1-sdk` — do not look for a `.datalake` property on the gateway.

```ts
import { createRestDataLakeRunner, createRestDataLakeViewer } from '@xyo-network/xl1-sdk'

const runner = await createRestDataLakeRunner('https://api.archivist.xyo.network/dataLake')
await runner.insert(payloads)

const viewer = await createRestDataLakeViewer('https://api.archivist.xyo.network/dataLake')
const results = await viewer.get(hashes)
```

For the typical read flow you do not need to construct a viewer at all — `gateway.connection.viewer.transaction.byHash(...)` hydrates a transaction's off-chain payloads through `ViewerWithDataLake`, and `gateway.connection.viewer.block.payloadsByHash(...)` fetches off-chain payloads by hash through the same path. Block reads (`block.blockByNumber` and friends) return on-chain payloads only — pair them with `payloadsByHash` when walking blocks for application content. See [What `block.blockByNumber` returns](#what-blockblockbynumber-and-friends-returns--hydration-is-shallow) above for the full hydration semantics. Construct a `RestDataLakeViewer` only when you have hashes from outside the gateway path.

The wallet and dApp are independent datalake clients — they may point to different endpoints, or either may have no datalake at all. For the full breakdown (factory internals, two-client semantics, endpoint independence), see [Datalakes](datalakes.md).

---

## Transports

| Transport | Use Case |
|-----------|----------|
| `HttpRpcTransport` | Network — connect to a remote gateway over HTTP |
| `PostMessageRpcTransport` | Browser — cross-window communication (wallet ↔ dApp) |
| `MemoryRpcTransport` | Testing — in-memory JSON-RPC engine |

Most consumers never instantiate transports directly. In the browser, the React providers select the transport based on whether a wallet is present. In Node, `GatewayBuilder` selects between HTTP and PostMessage based on whether you call `.rpcUrl()` or `.postMessage()`.

---

## Providers

`@xyo-network/xl1-providers` offers environment-specific provider bundles:

- **Browser provider** — for web dApps, uses PostMessage transport. See [Browser Gateway](gateway-browser.md).
- **Node provider** — for backend services, uses HTTP transport. See [Node Gateway](gateway-node.md).
- **Neutral provider** — platform-agnostic primitives shared by both.

The construction helpers (`GatewayBuilder` for Node, with `basicRemoteViewerLocator` as an advanced escape hatch; `WalletGatewayProvider` / `GatewayProvider` / `InPageGatewaysProvider` for browser) live with their respective environment-specific files.

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

---

## Anti-Patterns

| Anti-Pattern | Why it fails | Do this instead |
|---|---|---|
| Calling XL1 RPC methods by name (`blockViewer_blocksByNumber`, `transactionViewer_byHash`, etc. — whether via `fetch` to `/rpc` or a hand-rolled JSON-RPC client) | Loses type safety, off-chain payload hydration, provenance, validators, and transport abstraction. See [Never Issue Raw RPC Calls](#never-issue-raw-rpc-calls) | Use `connection.viewer` sub-viewers for reads, gateway methods for writes |
| Calling Ethereum RPC methods (`eth_getBalance`, `eth_blockNumber`, `eth_call`, `eth_sendTransaction`, `personal_sign`, etc.) against the XL1 gateway | XL1 is not an EVM chain — these methods do not exist on the gateway. Address compatibility (shared BIP44 path) is the *only* thing XL1 borrows from Ethereum. See [Never Issue Raw RPC Calls](#never-issue-raw-rpc-calls) | Use the XL1 viewer/runner equivalents — `connection.viewer.account.balance`, `connection.viewer.block.*`, `gateway.send`, etc. |
| Using Ethereum SDKs (`ethers`, `viem`, `web3.js`, `@ethersproject/*`, EIP-1193 providers) to talk to XL1 | These speak the Ethereum JSON-RPC protocol — XL1 does not. They will never work | Use `@xyo-network/xl1-sdk` (`GatewayBuilder` in Node, `useProvidedGateway` in browser) |
| `gateway.datalake` or `gateway.dataLake` | Does not exist on the gateway object | Use `createRestDataLakeRunner` / `createRestDataLakeViewer` |
| `gateway.connection.storage.insert(...)` | `connection.storage` is read-only (`DataLakeViewer`) and may not point to the dApp's desired endpoint | Use `createRestDataLakeRunner` |
| Using `datalakeRunner` / `datalakeViewer` without creating them | These are not globals — they must be instantiated | See [Accessing the Datalake](#accessing-the-datalake) above |
| `datalakeViewer.next(...)` to browse or scan a remote XL1 datalake | XL1 datalakes have no cursor pagination — `.next()` is an unbounded scan with no chain context | Iterate the chain via `viewer.block.*`, then read the datalake by hash. See [Chain Data Indexing](../xl1-patterns/chain-data-indexing-protocol.md) and [Datalakes — How to read](datalakes.md) |
