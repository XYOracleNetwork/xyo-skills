# Gateway

The env-agnostic gateway file — what the gateway is, the JSON-RPC surface, networks, the `connection.viewer` API, transaction methods, datalake access, and anti-patterns. Reference + cross-environment recipes in one place.

Environment-specific construction lives in sibling files:

- [Browser Gateway](gateway-browser.md) — React providers, the wallet extension, `useProvidedGateway`
- [Node Gateway](gateway-node.md) — server-side construction via `GatewayBuilder` (`.build()` for read-only, `.account(account).buildRunner()` for write-capable, `*Session()` variants for an owned, stoppable gateway)

**Key npm packages** (subpaths of the `@xyo-network/xl1-sdk` monolith; all
re-exported from its root barrel):
- `@xyo-network/xl1-sdk/providers` — provider implementations and the locator helpers the builders compose (one platform-neutral build; see [Providers](#providers))
- `@xyo-network/xl1-sdk` — `createRestDataLakeRunner`, `createRestDataLakeViewer`, network constants, the phased transaction functions, and the composed RPC engine helpers

Note: The gateway API server itself is part of the `xyo-chain` runtime repo (not published as a standalone npm package). The packages above cover the client-side provider interfaces needed for dApp development.

---

## XL1 Gateway

The gateway is a JSON-RPC 2.0 API server that exposes XL1 chain data and operations.

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rpc` | POST | JSON-RPC 2.0 — viewer and runner methods |
| `/rpc/indexed` | POST | JSON-RPC 2.0 — indexed-surface methods (transaction-inclusion lookups and friends), mounted when the node has an indexed branch |

Indexed methods are migrating off `/rpc` onto `/rpc/indexed`. The `api` actor's
`legacyMixedRpc` setting defaults to **true**, so `/rpc` currently still serves
the full connection; set `XL1_ACTORS__API__LEGACY_MIXED_RPC=false` to enforce
node-surface-only there. Indexed methods are available at `/rpc/indexed`
regardless. New indexed clients should target `/rpc/indexed`.

The datalake is a **separate service** on its own host (see
[Networks](#networks) below), not an endpoint on the gateway.

---

## Never Issue Raw RPC Calls

**This is never done.** The XL1 gateway is reached exclusively through the SDK. Two rules apply equally to dApp code, services, indexers, tests, and verification scripts:

### 1. Raw XL1 JSON-RPC method names

The gateway speaks JSON-RPC 2.0 under the hood and exposes method names like `blockViewer_blocksByNumber`, `blockViewer_currentBlock`, `transactionViewer_byHash`, `accountBalanceViewer_qualifiedAccountBalances`, etc. **Never call these directly** — not via `fetch('/rpc', { body: '{"method":"blockViewer_..."}' })`, not via a hand-rolled JSON-RPC client, not by importing internal transport classes.

Calling them directly:
- Loses the SDK's type definitions for params and return shapes
- Skips the SDK's per-method Zod validation of params and results (the SDK's RPC transports parse every call against its method schema)
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
| `eth_accounts` / `personal_sign` | Signing is a gateway concern (browser: wallet extension; Node: `GatewayBuilder.account(account).buildRunner()`) |

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

A clean grep is a precondition for calling any XL1 work done.

---

## Networks

XL1 has three networks. The gateway name (`'mainnet'`, `'sequence'`, `'local'`) is the network identifier — pass it to the React providers in browser dApps (see [Browser Gateway](gateway-browser.md)). In Node services, resolve it to URLs with `DefaultNetworks` / `NetworkDataLakeUrls` and pass those to the builder (see [Node Gateway](gateway-node.md)): the network is whatever `.rpcUrl(...)` points at, and `GatewayBuilder().name(...)` is only a diagnostic label.

| Network | Gateway Name | REST root | Gateway RPC | Datalake | Explorer |
|---------|-------------|-----------|-------------|----------|----------|
| **Mainnet** | `'mainnet'` | `https://mainnet.xyo.space` | `https://api.chain.xyo.network/rpc` | `https://api.archivist.xyo.network/dataLake` | `https://explore.xyo.network` |
| **Sequence** (beta) | `'sequence'` | `https://sequence.xyo.space` | `https://beta.api.chain.xyo.network/rpc` | `https://beta.api.archivist.xyo.network/dataLake` | `https://beta.explore.xyo.network` |
| **Local** | `'local'` | `https://chain.aries.test:8791` (`layout: 'path'`) ‡ | `http://localhost:8080/rpc` | `http://localhost:8080/dataLake` † | `http://localhost:3000` |

**REST is the preferred read transport.** The REST root serves the published
static layout (finalized blocks, index, chain state). For the public networks
the in-page gateway reads `https://<gateway name>.xyo.space` with the default
`subdomain` layout, which derives the `blocks.`, `state.`, and `indexes.`
buckets from that root (`restGatewayConfigFromEndpoint`); mempool submission
still goes to the Gateway RPC URL. See
[Browser Gateway — REST over RPC](gateway-browser.md#rest-over-rpc) and, for
Node, [Node Gateway — REST/S3 gateway](gateway-node.md#rests3-gateway--reading-from-the-static-layout).

† The local datalake URL is what the SDK's `NetworkDataLakeUrls` constant
carries, but a plain `xl1 start` **does not serve it** — the local `api` actor
mounts only `/rpc`, `/rpc/indexed`, and probe routes. A local datalake is not
part of the node: composing one beside a local chain is a test-stack concern,
and local code that reads off-chain bodies must point at a datalake that is
actually running.

‡ The local REST root is not a `DefaultNetworks` field. It is the
`InPageGatewaysProvider` default (override with its `localEndpoint` prop), read
with `layout: 'path'` (`<root>/blocks`, `/state`, `/indexes`) instead of
per-bucket subdomains. A plain `xl1 start` publishes nothing there: REST
readers see a local chain only after its blocks and state are published to
that root.

The Explorer URL and `NetworkId` for each network are also exposed on `MainNetwork` / `SequenceNetwork` / `LocalNetwork` (and via `DefaultNetworks`) from `@xyo-network/xl1-sdk`. Pair them with `ExplorerLinks` from the same barrel to build canonical Explorer URLs for addresses, blocks, transactions, and payloads — never hand-concatenate explorer paths. UI conventions for *when* to render those links live in [Browser UX — Display Conventions](../xl1-patterns/browser-ux.md#display-conventions).

**When to use each:**
- **Mainnet** — production deployments. Real XL1 tokens, real transactions.
- **Sequence** — testing and staging. Use this for development against a live network without affecting production. This is the default for beta/staging deployments.
- **Local** — local development with a locally running gateway (`xl1 start api`). No network dependency.

For dApp development, start with **Sequence** (beta) to test against a live chain, then switch to **Mainnet** for production.

---

## Getting a Gateway

The construction step is environment-specific. Pick the file that matches your runtime:

- **Browser / React dApp** — wrap the app in `WalletGatewayProvider` or `GatewayProvider` + `InPageGatewaysProvider transport="rest"`, then call `useProvidedGateway()` in components. See [Browser Gateway](gateway-browser.md).
- **Any other browser realm** — plain websites, web workers, service workers, and extension backgrounds launch `launchXl1BrowserGatewaySystem` from `@xyo-network/xl1-browser-system` with `transport: 'rest'`. See [Browser Gateway — Integrating XL1 Into a Website](gateway-browser.md#integrating-xl1-into-a-website).
- **Node / server-side / headless** — use `GatewayBuilder` from `@xyo-network/xl1-sdk`. `.build()` for read-only, `.account(account).buildRunner()` for write-capable, or the `.buildSession()` / `.buildRunnerSession()` variants when the process must release the gateway with `stop()`. See [Node Gateway](gateway-node.md).
- **Tests** — use `MemoryRpcTransport` (see [Transports](#transports) below).

The variable named `gateway` in the recipes below stands for whatever you got back from your environment's construction. In React it is typically `defaultGateway` from `useProvidedGateway()`; in Node it is the result of `new GatewayBuilder().rpcUrl(...).build()` (or `.account(account).buildRunner()`, or a session's `session.gateway`). Both expose the same method surface.

The type is a union:
- **`XyoGatewayRunner`** — write-capable (has `addPayloadsToChain`, `send`, etc.). Available when the wallet extension is installed (browser — installed, not necessarily connected, so also require a granted account before writing; see [Browser Gateway](gateway-browser.md)) or a signer is wired in (Node, via `GatewayBuilder.buildRunner()`).
- **`XyoGateway`** — read-only (has `connection.viewer` but no write methods). Available from the in-page gateway (browser) or `GatewayBuilder.build()` (Node).
- **`undefined` / `null`** — loading or no gateway available (React context only).

---

## Connection Properties

The gateway object (`XyoGateway` or `XyoGatewayRunner`) exposes chain access through `gateway.connection`:

| Property | Type | Description |
|----------|------|-------------|
| `.viewer` | `XyoViewer \| undefined` | Read-only chain state (sub-viewers for blocks, transactions, balances, etc.) |
| `.storage` | `DataLakeRunner \| DataLakeViewer \| undefined` | Datalake attached to this connection — a `DataLakeRunner` on a write-capable gateway built with a datalake endpoint, otherwise a read-only `DataLakeViewer` (or absent). May not point to the dApp's desired endpoint. |
| `.runner` | `XyoRunner \| undefined` | Low-level runner (internal — use gateway methods instead) |
| `.network` | `XyoNetwork \| undefined` | Network metadata |

**`connection.storage` is not the recommended datalake path.** It is populated from the connection's configuration — a `DataLakeRunner` when a write-capable gateway was built with a datalake endpoint (the datalake `addTransactionToChain` writes to), a read-only `DataLakeViewer` on a read-only gateway, absent when none was configured — so whether it can write depends on how the gateway was built, and it may not point to the endpoint the dApp wants to use. For datalake access, see [Accessing the Datalake](#accessing-the-datalake) below and [Datalakes](datalakes.md).

---

## Reading Chain State

Chain state is read through sub-viewers on `gateway.connection.viewer`. **`connection.viewer` is optional** (`XyoViewer | undefined`). The in-page gateway populates it once it finishes resolving, but a wallet-only or runner-only gateway may not have a viewer. Always guard access with `?.` or an explicit null check.

For exact type signatures, read the `.d.ts` files in `@xyo-network/xl1-sdk`.

### Sub-viewer summary

| Sub-viewer | When to use |
|------------|-------------|
| `.block` | Query blocks, get latest block number (for polling/deadlines), resolve payloads the gateway's store holds by hash |
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
| Find the finalized block that includes a transaction (`null` until it is indexed) | `.block.blockByTransactionHash(txHash)` |
| Scan a window of blocks ending at a hash or number (descending, newest-first) | `.block.blocksByHash(hash, limit?)` / `.block.blocksByNumber(n, limit?)` |
| Fetch a published step-summary batch of blocks | `.block.blocksByStep(stepLevel, stepIndex)` |
| Resolve payloads by hash from the gateway's own store (on-chain payloads — off-chain bodies come from your datalake) | `.block.payloadsByHash(hashes)` / `.block.payloadByHash(hash)` (single, `null` when unresolved) |
| Get the chain id in force at a block height (varies across forks — see [Chain Forks](chain.md#chain-forks)) | `.block.chainId(blockNumber?)` |
| Measure block production rate (`BlockRate`) over a block range, a run of fixed-size steps, or a time window | `.block.rate(range, timeUnit?)` / `.block.stepSizeRate(start, stepIndex, count?, timeUnit?)` / `.block.timeDurationRate(timeConfig, …)` |

`blocksByStep` returns a whole step-aligned batch as a single index/summary
fetch. Large `blocksByNumber` / `blocksByHash` walks delegate to it internally
(via `deepCalculateFramesFromRange`) so most of a window loads from
`blocksByStep` index files instead of N per-block requests.

**Direction gotcha.** `blocksByNumber(n, limit)` and `blocksByHash(hash, limit)`
walk **descending** from the given block — they return up to `limit` blocks
*ending at* `n` (i.e. `[n - limit + 1 … n]`), newest-first, **not** ascending
from `n`. (Fewer than `limit` near genesis; the walk stops at block 0.) To sweep
a range `[lo, hi]` ascending, request successive windows *by their high end* —
`blocksByNumber(hi, hi - lo + 1)` for the window, advancing `hi` upward — rather
than passing `lo` as the start.

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

They **do not include the off-chain application payloads referenced by each `TransactionBoundWitness.payload_hashes[]`** — and no `connection.viewer` read fetches those from a datalake, even when the gateway locator binds `DataLakeViewer` / `DataLakeRunner` (or, through 5.x, when it was built with the deprecated `dataLakeEndpoint`, removed in 6.0). That binding backs `connection.storage` and the runner's pre-broadcast write; viewer reads never consult it. Every viewer read returns what the gateway's own payload store holds — the node's finalized archivist over RPC, or the bucket's `payload/<hash>.json` files over REST. A produced block carries only its transaction bound witnesses and on-chain payloads, so that is all the store is guaranteed to hold; off-chain (Path-A) bodies appear there only if the operator also publishes datalake content into it. Do not rely on that.

| Entrypoint | What it returns |
|---|---|
| `viewer.block.blockByNumber(n)` (and the other block.* readers) | The block's on-chain payloads — the nested `TransactionBoundWitness` instances, **not** the off-chain payloads they reference |
| `viewer.transaction.byHash(txHash)` | The `TransactionBoundWitness` plus whichever of its `payload_hashes` the gateway's store holds — the on-chain ones; unresolved hashes are silently omitted |
| `viewer.block.payloadsByHash(hashes)` | Payloads from the same gateway store; unresolved hashes are silently omitted |
| `createRestDataLakeViewer(endpoint).get(hashes)` | Off-chain bodies from **your** datalake, by hash — the explicit second step |

**The two-step pattern.** When you walk blocks and need the off-chain content of a transaction in that block, do not assume `block[1]` (or `transaction.byHash`) contains it:

1. Walk blocks via `viewer.block.*` and collect the payload hashes you care about from each `TransactionBoundWitness.payload_hashes[]` (filtering by the parallel `payload_schemas[]` is usually how you decide which ones to keep).
2. Fetch them in one batch with `createRestDataLakeViewer(endpoint).get(hashes)` against the datalake the content was written to (see [Accessing the Datalake](#accessing-the-datalake)).

```ts
import { asXL1BlockNumber, createRestDataLakeViewer, isTransactionBoundWitness } from '@xyo-network/xl1-sdk'

const dataLake = await createRestDataLakeViewer(dataLakeUrl) // construct once, reuse

const block = await viewer.block.blockByNumber(asXL1BlockNumber(n, true))
const hashes = (block?.[1] ?? [])
  .filter(isTransactionBoundWitness)
  .flatMap(tx => tx.payload_hashes.filter((_, i) => tx.payload_schemas[i] === MySchema))
const bodies = hashes.length > 0 ? await dataLake.get(hashes) : []
// validate each body before use — see Datalakes — How to read (trust boundary)
```

This is the canonical shape for indexer block walks — one combined datalake fetch per block instead of one per transaction. See also [Chain Data Indexing — Step 3](../xl1-patterns/chain-data-indexing-protocol.md#step-3-query-by-schema) for the full recipe (incremental walks, read models, scan strategies).

### Transaction Queries — `connection.viewer.transaction`

| When you need to... | Use |
|---------------------|-----|
| Look up a transaction by its hash (e.g., after `addPayloadsToChain`) | `.transaction.byHash(txHash)` |
| Look up a transaction by its position within a block | `.transaction.byBlockNumberAndIndex(n, i)` or `.transaction.byBlockHashAndIndex(hash, i)` |

```ts
const tx = await gateway?.connection.viewer?.transaction.byHash(txHash)
// tx: SignedHydratedTransactionWithHashMeta | null
// tx[0] = TransactionBoundWitness, tx[1] = payloads the gateway's store resolved
// (on-chain only — fetch off-chain bodies from your datalake by tx[0].payload_hashes)
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

### Finalized block stream

For **ordered, gap-aware delivery of finalized blocks** (indexers, reducers, statement-graph folds), use `FinalizedBlockStream` — do **not** treat deprecated `headUpdated` viewer events as an ordered block feed (`headUpdated` is an unordered head signal; *n* blocks may have passed between emissions).

This is a **client helper over viewers**, not a JSON-RPC method. Prefer the gateway helper:

```ts
import {
  finalizedBlockStreamFromGateway,
  type FinalizedBlockStream,
} from '@xyo-network/xl1-sdk'

const stream: FinalizedBlockStream = await finalizedBlockStreamFromGateway(gateway, {
  // after: previousCursor.hash,  // hot resume by hash when continuing a live session
  // fetchWindow / maxCatchUp / pollIntervalMs — see SimpleFinalizedBlockStreamOptions
})

stream.on('nextBlock', async ({ block, head }) => {
  // process SignedHydratedBlockWithHashMeta in order
})
stream.on('gap', ({ before, resumedAt, skipped }) => {
  // catch-up exceeded maxCatchUp — skipped range announced; batch-read if needed
})
stream.on('desynced', () => { /* terminal: previous-hash continuity failed */ })
stream.on('stopped', () => { /* terminal: clean stop */ })

// Durable indexers: cold replay from a checkpoint hash, then follow head.
// Each item is a { block, head } event. Omitting `after` starts at the current
// finalized head (yielded first) — no history replay.
// for await (const { block } of stream.blocks({ after: checkpointHash })) { … }

await stream.stop()
```

**Cursor:** `{ block, hash }` — hash is the authoritative identity for resume/idempotency; block is for ordering math and display.

| Approach | Use when |
|----------|----------|
| Cold `stream.blocks({ after })` | Durable indexer/reducer — gapless replay from checkpoint, then follow head; desync throws `FinalizedBlockStreamDesyncError` |
| Hot `on('nextBlock'…)` | Shared live timeline — late subscribers miss history; may emit `gap` when lag exceeds `maxCatchUp` |
| Poll `finalization.headNumber()` alone | Head watermark only — still need ordered block reads to process payloads |

Also available: `buildFinalizedBlockStream({ blocks, finalization }, options?)` and provider `SimpleFinalizedBlockStream`. See [Chain Data Indexing — Service](../xl1-patterns/chain-data-indexing-service.md#finalized-block-stream) for indexer wiring.

### Chain ID — `connection.viewer.chainId` / `.block.chainId`

XL1 chains fork, so chain id is a function of block height — see [Chain Forks](chain.md#chain-forks).

| When you need to... | Use |
|---------------------|-----|
| Current (tip) chain id | `.chainId()` or `.block.chainId()` (`'latest'` is the default) |
| Chain id in force at a height | `.chainId(n)` / `.block.chainId(n)` — reads block `n`'s own `chain` field |
| Chain id of the finalized head | `.finalization.chainId()` |

All resolve to a `ChainId`. Every block records the `chain` in force at its
height, so the height lookup is authoritative across forks without walking any
lineage.

The fork-lineage reads — `chainIdAtBlockNumber`, `forkedAtBlockNumber()` /
`forkedAtHash()`, `forkedChainId()`, `forkedChainContractViewer()` — belong to
`ChainContractViewer`, which is **not** on the typed `connection.viewer`. It is
reachable only through a provider locator
(`locator.getInstance<ChainContractViewer>(ChainContractViewerMoniker)`) in
node/server-side provider code. `viewer.forkHistory()` is declared on
`XyoViewer`, but the node's `SimpleXyoViewer` throws "not implemented" — do not
depend on it.

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
| `.stakeTotals` | Querying aggregate stake totals (optional — check presence before use) |
| `.step` | Querying step/epoch boundaries and progression |
| `.time` | Time synchronization between client and chain |

`.mempool` and `.stakeTotals` are optional on the connection; guard with an
`if (viewer.stakeTotals)` check before calling. Other viewer types in the
protocol (IndexViewer, ChainStateViewer, Sync, EvmChain) back the gateway's REST
and EVM data paths and are not exposed as `connection.viewer.*` accessors.

---

## Submitting Transactions

Transaction submission is done through high-level methods on the gateway itself (not through `connection.viewer`). These exist only on `XyoGatewayRunner` (write-capable gateway). Always check capability first — see [Detecting Capabilities](#detecting-capabilities).

| When you need to... | Use |
|---------------------|-----|
| Record application data on-chain (game moves, attestations) | `gateway.addPayloadsToChain(onChain, offChain, options?)` |
| Submit a transaction you built manually | `gateway.addTransactionToChain(tx, offChain?)` |
| Send XL1 tokens to one address | `gateway.send(to, amount, options?)` |
| Send XL1 tokens to multiple addresses | `gateway.sendMany(transfers, options?)` |
| Wait for a submitted transaction to be included in a block | `gateway.confirmSubmittedTransaction(txHash, options?)` |
| Submit so a crash cannot strand the transaction (effect journals, services that resume) | The phased functions — see [Durable submission](#durable-submission) |

### Adding application data to the chain

```ts
if (gateway && 'addPayloadsToChain' in gateway) {
  // onChain: AllowedBlockPayload[] — system types only
  // offChain: Payload[] — application data of any schema
  const [txHash, signedTx] = await gateway.addPayloadsToChain([], appPayloads)
}
```

This single call builds a `TransactionBoundWitness`, signs it (in the browser this triggers the wallet popup; in Node the in-memory signer signs directly), and broadcasts to the network. It returns after broadcast, not after inclusion or finality, and it is not a crash-safe boundary: nothing signed is kept if the process dies mid-call, and calling it again signs a new transaction. When that matters, use [Durable submission](#durable-submission).

### Transaction options

`addPayloadsToChain`, `send`, and `sendMany` take an optional `TransactionOptions` as their last argument:

| Option | Default | Effect |
|--------|---------|--------|
| `chain` | the viewer's `chainId()` | Assertion only — building throws if it differs from the gateway's chain |
| `from` | the signer's address | Assertion only — an explicit `from` must equal the signer's address; it never selects another signer |
| `nbf` | the viewer's `currentBlockNumber()` | First block the transaction may be included in |
| `exp` | `nbf + 10` | Exclusive expiration block |
| `fees` | `defaultTransactionFees` | `TransactionFeesBigInt` (`base`, `gasLimit`, `gasPrice`, `priority`) |

```ts
import { asXL1BlockNumber } from '@xyo-network/xl1-sdk'

const viewer = gateway.connection.viewer
if (!viewer) throw new Error('Gateway has no viewer')

// Allow 100 blocks instead of the default 10 (slow wallet approval, congested network)
const nbf = await viewer.currentBlockNumber()
const [txHash, signedTx] = await gateway.addPayloadsToChain([], appPayloads, {
  exp: asXL1BlockNumber(nbf + 100, true),
  nbf,
})
```

### Token transfers

```ts
const txHash = await gateway.send(toAddress, amount)
const txHash = await gateway.sendMany({ [addr1]: amount1, [addr2]: amount2 })
```

### Pre-built transactions

```ts
const [txHash, signedTx] = await gateway.addTransactionToChain(unsignedTx, offChainPayloads)
```

The transaction may be unsigned (the gateway signs it) or already signed. Every `offChainPayloads` entry must be referenced by the transaction's `payload_hashes`; unreferenced content is rejected before anything is written or broadcast.

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

Also pass the transaction's own `exp`. Between attempts the poll then checks the chain head and throws an expired error once the head moves past `exp`, instead of spending the whole budget on a transaction that can no longer be included:

```ts
const [txHash, signedTx] = await gateway.addPayloadsToChain([], appPayloads)
await gateway.confirmSubmittedTransaction(txHash, { attempts: 30, delay: 10_000, exp: signedTx[0].exp })
```

Running out of attempts throws `TransactionConfirmationTimeoutError` (`inconclusive: true`). The poll reads only finalized transactions, so a timeout does not prove the transaction was dropped — it may still be pending or be included later. Recheck with `viewer.block.blockByTransactionHash(txHash)` (or keep polling) before treating it as failed.

### Durable submission

`addPayloadsToChain` is a convenience path that the SDK documents as not a crash-safe effect-journal boundary, and `addTransactionToChain` with an unsigned transaction has the same shape. Build, sign, content write, and broadcast happen inside one call, so a crash leaves no signed transaction to resume, and retrying signs a different one. When a submission must survive restarts (services with an effect journal, settlement jobs, anything that resumes), drive the phases yourself with these functions from `@xyo-network/xl1-sdk` and **persist the signed evidence before any write or broadcast**:

| Phase | Function | Result |
|-------|----------|--------|
| Build | `buildXl1Transaction(viewer, signer, onChain, offChain, options?)` | Unsigned hydrated transaction, with `chain` / `from` / `nbf` / `exp` / `fees` resolved as in [Transaction options](#transaction-options) |
| Sign | `signXl1Transaction(signer, unsigned)` | `SignedXl1TransactionEvidence`: the exact signed `transaction`, `transactionHash`, `content` / `contentHashes`, `chainId`, `from`, `nbf`, `exp`. Persist `evidence.transaction` now |
| Rebuild | `createSignedXl1TransactionEvidence(signedTx, additionalContent?)` | Re-validated evidence after loading it back (or for a transaction signed elsewhere); additional content must be referenced by the transaction |
| Write content | `writeXl1TransactionContent(dataLakeRunner, evidence)` | Inserts every content payload and checks the acknowledged hashes |
| Verify content | `verifyXl1TransactionContent(dataLakeViewer, evidence)` | Reads the content back and recomputes every hash |
| Broadcast | `broadcastXl1Transaction(gateway.connection.runner, evidence)` | Broadcasts the exact signed transaction and rejects a mismatched returned hash. Re-broadcasting persisted evidence after a crash resends the same transaction, not a new one |
| Inclusion | `observeXl1TransactionInclusion(viewer.block, transactionHash)` | `TransactionInclusion` (`blockHash`, `blockNumber`, `transactionHash`, `transactionIndex`), or `null` |
| Finality | `observeXl1TransactionFinality(viewer.block, inclusion)` | The same inclusion if it is still in finalized history, or `null` — record inclusion first, recheck finality across a later restart |

```ts
import {
  broadcastXl1Transaction,
  buildXl1Transaction,
  createRestDataLakeRunner,
  createRestDataLakeViewer,
  createSignedXl1TransactionEvidence,
  observeXl1TransactionInclusion,
  signXl1Transaction,
  verifyXl1TransactionContent,
  writeXl1TransactionContent,
} from '@xyo-network/xl1-sdk'

const viewer = gateway.connection.viewer
const chainRunner = gateway.connection.runner
if (!viewer || !chainRunner) throw new Error('Gateway has no viewer or runner')

// journal: your own durable store (database row, file, effect journal)
const unsigned = await buildXl1Transaction(viewer, gateway.signer, [], appPayloads)
const evidence = await signXl1Transaction(gateway.signer, unsigned)
await journal.saveSigned(evidence.transactionHash, evidence.transaction)

await writeXl1TransactionContent(await createRestDataLakeRunner(dataLakeUrl), evidence)
await verifyXl1TransactionContent(await createRestDataLakeViewer(dataLakeUrl), evidence)
await broadcastXl1Transaction(chainRunner, evidence)
await journal.markBroadcast(evidence.transactionHash)

// After a restart: rebuild the evidence from the journal, re-broadcast if needed, then observe
const resumed = await createSignedXl1TransactionEvidence(await journal.loadSigned(pendingTxHash))
const inclusion = await observeXl1TransactionInclusion(viewer.block, resumed.transactionHash)
```

The content write is the same one a datalake-configured runner gateway performs inside `addTransactionToChain`; skip it (and the verify) when no datalake should hold the content. dapp-kit's effect journals build their staged-receipt model on these same phases.

---

## Detecting Capabilities

Check whether the gateway supports write operations before attempting transactions:

```ts
const canSubmitToChain = gateway && 'addPayloadsToChain' in gateway
const canRead = !!gateway

// Chain reads: work for any gateway (read-only or write-capable)
// Datalake reads/writes: work via the dApp's own HTTP client, independent of the gateway
// Chain transactions: require an XyoGatewayRunner (signer-wired in Node; in a browser the
// runner only means the wallet is installed — also require a granted account)
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

**Reads:** gateway reads never hydrate from a datalake. `gateway.connection.viewer.transaction.byHash(...)`, `block.payloadsByHash(...)`, and block reads return only what the gateway's own payload store holds — the on-chain payloads. Off-chain (Path-A) bodies are fetched from your datalake by hash: take the hashes from the chain (`TransactionBoundWitness.payload_hashes[]`) and call `viewer.get(hashes)` on a `createRestDataLakeViewer(endpoint)` instance. See [What `block.blockByNumber` returns](#what-blockblockbynumber-and-friends-returns--hydration-is-shallow) above for the full read semantics.

**Writes:** a write-capable gateway whose locator binds `DataLakeRunner` to a `rest` connection (build the client with `createRestDataLakeRunner(url)`; bind both monikers through the locator) registers a `RestDataLakeRunner`, and `addPayloadsToChain` / `addTransactionToChain` write the transaction's full content — including every `offChain` payload — to that datalake before broadcasting. Through 5.x, `GatewayBuilder.dataLakeEndpoint(url)` and the browser `dataLakeEndpoint` launch option are adapters that perform that same binding; they are removed in 6.0. An explicit `runner.insert(...)` is needed only when the gateway has no datalake runner (e.g. a wallet gateway, which writes only to the wallet's own configured datalake, if any) or when the content must also land in a different datalake.

The wallet and dApp are independent datalake clients — they may point to different endpoints, or either may have no datalake at all. For the full breakdown (factory internals, two-client semantics, endpoint independence), see [Datalakes](datalakes.md).

---

## Transports

Two different things are called "transport" around the gateway. Keep them apart.

**Chain-read transport** — how a browser gateway reads chain data. `'rest'` or
`'rpc'`, selected by the `transport` prop on `InPageGatewaysProvider` or the
`transport` option on `launchXl1BrowserGatewaySystem`. **REST is the preferred
choice**: reads come from the network's cacheable static bucket layout rather
than a live gateway call per read, while mempool submission still uses the RPC
URL. See [Browser Gateway — REST over RPC](gateway-browser.md#rest-over-rpc).

**RPC transport classes** — how a JSON-RPC message physically travels. These are
independent of the choice above; a REST-configured browser system still uses one
for writes.

| Transport | Use Case |
|-----------|----------|
| `HttpRpcTransport` | Network — connect to a remote gateway over HTTP |
| `PostMessageRpcTransport` | Browser — cross-window communication (wallet ↔ dApp) |
| `MemoryRpcTransport` | Testing — in-memory JSON-RPC engine |

Most consumers never instantiate transports directly. In the browser, the React providers select the transport based on whether a wallet is present. In Node, `GatewayBuilder` selects between HTTP and PostMessage based on whether you call `.rpcUrl()` or `.postMessage()`.

### Serving a gateway over JSON-RPC (composed RPC engine)

This is for building a gateway **server** (e.g. an HTTP adapter like
`@xyo-network/xl1-rpc-server`), not for dApp reads/writes. From
`@xyo-network/xl1-sdk/rpc/server` (also on the root barrel):

- `composedRpcEngineFromConnection(connection, logger?)` — builds a composed
  engine of per-viewer/runner typed sub-engines from a gateway connection.
- `composedRpcEngineFromGateway(gateway, logger?)` — same, from a full gateway;
  when the gateway is a runner with a signer it also mounts the signer methods
  (`XyoSignerRpcSchemas` / `rpcMethodHandlersFromSigner`), then delegates to
  `composedRpcEngineFromConnection`.
- `composedRpcServerFromGateway(gateway, logger?)` — returns a `JsonRpcServer`.

The composed (V2) engine replaces the original `rpcEngineFromConnection` /
`rpcServerFromConnection`, which are now `@deprecated`. Prefer the composed
variants for any new server code.

---

## Providers

`@xyo-network/xl1-sdk/providers` (subpath of the SDK monolith; also on the root
barrel) is a single platform-neutral build — there are no browser or node
provider bundles. It holds the locator helpers (`basicRemoteViewerLocator`,
`basicRemoteRunnerLocator`), `buildSimpleXyoSigner`, and the `Simple*` / `Rest*`
connection and viewer providers the builders compose. The only SDK export with a
`node` condition is `./protocol-sdk`, whose node build adds the file-based
`getFileConfig`.

The environment difference lives in construction, not in the provider package:

- **Browser** — page-owned gateways come from `@xyo-network/xl1-browser-system` (React: `InPageGatewaysProvider`); wallet gateways reach the extension over PostMessage. See [Browser Gateway](gateway-browser.md).
- **Node** — `GatewayBuilder` over HTTP JSON-RPC, or `getRestGateway` for REST reads, with `basicRemoteViewerLocator` as an advanced escape hatch. See [Node Gateway](gateway-node.md).

---

## Running the Gateway

### Via CLI
```bash
xl1 start api                    # Start API server only
xl1 start api producer validator # Start multiple actors
```

### Via pnpm (from xyo-chain repo)
```bash
pnpm run-xl1 start api mempool finalizer   # the actor set the deprecated `xl1 api` booted
```

The per-actor `run-*` scripts (`run-api`, `run-producer`, …) still call the
per-actor commands (`xl1 api`, `xl1 producer`, …), which the CLI marks
deprecated in favour of `xl1 start <actor>`. Use `xl1 start <actors..>` for new
work.

### Configuration

100% environment-driven via `XL1_*` variables:

| Variable | Purpose |
|----------|---------|
| `XL1_CHAIN__ID` | Staking contract address on backing EVM |
| `XL1_ACTORS__API_*` | API server configuration (e.g. `XL1_ACTORS__API__LEGACY_MIXED_RPC`) |
| `XL1_CONNECTIONS__<NAME>__TYPE` | Declares a named connection's driver (`lmdb`, `mongo`, `rpc`, `s3`, …) |
| `XL1_CONNECTIONS__<NAME>__*` | That connection's settings — e.g. `__ROOT` for LMDB, `__CONNECTION_STRING` / `__DATABASE` for Mongo |

Backing stores, RPC endpoints, EVM RPC, and S3 buckets are all declared as
**named connections** under `connections`, then bound to roles via
`providerBindings`. The pre-3.0 `storage`, `remote`, `transports`, and
`evm.jsonRpc` / `evm.infura` fields — including `XL1_STORAGE__ROOT`,
`XL1_STORAGE__MONGO__*`, and `XL1_EVM__CHAIN_ID` — are no longer supported. A
remote API is reached with a `default-rpc` connection of `type: "rpc"`, not the
old `remote.rpc`. Run `xl1 start --dump-config` to see the resolved shape.

A binding can also pin an implementation by provider id, for example
`"ChainContractViewer": { "provider": "SimpleChainContractViewer" }`. SDK
provider ids equal their source class names (see
[Provider identity](development.md#provider-identity)). A pin that matches
nothing fails startup with `UnknownProviderError`, whose message lists the ids
that do satisfy the moniker. On `@xyo-network/xl1-cli` 5.6.x (which bundles
`@xyo-network/xl1-sdk` 5.8) the pin is **required** for a dev chain that
publishes chain state to S3: without an `evm-rpc`-backed `ChainContractViewer`,
startup refuses to plan `S3ChainStatePublishRunner` unless the binding
explicitly pins `SimpleChainContractViewer` with no connection.

---

## Anti-Patterns

| Anti-Pattern | Why it fails | Do this instead |
|---|---|---|
| Calling XL1 RPC methods by name (`blockViewer_blocksByNumber`, `transactionViewer_byHash`, etc. — whether via `fetch` to `/rpc`, a hand-rolled JSON-RPC client, or a string dispatch like `gateway.call(...)`, which does not exist) | Loses type safety, params/result validation, provenance, validators, and transport abstraction. See [Never Issue Raw RPC Calls](#never-issue-raw-rpc-calls) | Use `connection.viewer` sub-viewers for reads, gateway methods for writes |
| Calling Ethereum RPC methods (`eth_getBalance`, `eth_blockNumber`, `eth_call`, `eth_sendTransaction`, `personal_sign`, etc.) against the XL1 gateway | XL1 is not an EVM chain — these methods do not exist on the gateway. Address compatibility (shared BIP44 path) is the *only* thing XL1 borrows from Ethereum. See [Never Issue Raw RPC Calls](#never-issue-raw-rpc-calls) | Use the XL1 viewer/runner equivalents — `connection.viewer.account.balance`, `connection.viewer.block.*`, `gateway.send`, etc. |
| Using Ethereum SDKs (`ethers`, `viem`, `web3.js`, `@ethersproject/*`, EIP-1193 providers) to talk to XL1 | These speak the Ethereum JSON-RPC protocol — XL1 does not. They will never work | Use `@xyo-network/xl1-sdk` (`GatewayBuilder` in Node, `useProvidedGateway` in browser) |
| `gateway.datalake` or `gateway.dataLake` | Does not exist on the gateway object | Use `createRestDataLakeRunner` / `createRestDataLakeViewer` |
| `gateway.connection.storage.insert(...)` | `connection.storage` is typed `DataLakeRunner \| DataLakeViewer` — a viewer with no `insert` on read-only gateways or when no datalake runner was configured — and may not point to the dApp's desired endpoint | Use `createRestDataLakeRunner`, or a datalake-configured runner gateway, which writes transaction content itself |
| Using `datalakeRunner` / `datalakeViewer` without creating them | These are not globals — they must be instantiated | See [Accessing the Datalake](#accessing-the-datalake) above |
| `datalakeViewer.next(...)` to browse or scan a remote XL1 datalake | XL1 datalakes have no cursor pagination — `.next()` is an unbounded scan with no chain context | Iterate the chain via `viewer.block.*`, then read the datalake by hash — the [two-step pattern](#what-blockblockbynumber-and-friends-returns--hydration-is-shallow). See [Datalakes — How to read](datalakes.md#how-to-read--iterate-the-chain-fetch-by-hash) |
