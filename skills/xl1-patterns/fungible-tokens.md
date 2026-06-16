# Fungible Tokens (XRC-20)

Read this pattern when building a fungible token on XL1 in the style of Bitcoin's BRC-20 — open ticker registration, capped mints, address-to-address transfers, and an off-chain ledger derived from on-chain events.

This pattern is a direct application layer on top of the [Inscription Substrate](inscription-substrate.md). The substrate provides identity, ownership, and finality; XRC-20 adds the rules that turn inscription events into fungible balances.

**Builds on:**
- [Inscription Substrate](inscription-substrate.md) — artifacts, events, content-addressed IDs, finalization-only replay
- [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md) — the rule that the actor is always the BoundWitness signer
- [Chain Data Indexing](chain-data-indexing-protocol.md) — payload submission, schema-filtered queries

---

## The Problem

BRC-20 is a fungible-token convention layered on Bitcoin Ordinals. It works by inscribing JSON of three shapes — `deploy`, `mint`, `transfer` — and letting off-chain indexers derive ticker definitions and balances from those inscriptions in canonical order. The Bitcoin chain orders the inscriptions; it does not interpret them.

XL1's substrate gives us the same property. We can layer an XRC-20 protocol on top of the [Inscription Substrate](inscription-substrate.md) with one strict simplification: because XL1 has explicit signed BoundWitnesses, **transfer is a single step**, not the awkward two-step (inscribe-intent, then send-the-sat) that BRC-20 requires to compensate for Bitcoin's UTXO model. This is the central improvement over BRC-20.

---

## How XRC-20 Differs from BRC-20

| Concern | BRC-20 (Bitcoin) | XRC-20 (XL1) |
|---|---|---|
| Substrate | Ordinals inscriptions on satoshis | Inscription Substrate on XL1 |
| Mint identity | Bound to a sat (UTXO custody) | Authored by BoundWitness signer |
| Transfer | Two-step: inscribe-intent, then send-sat | Single-step: signed transfer event |
| Ticker ownership | Implicit — inscriber of the deploy | Explicit — owner of the deploy inscription artifact |
| Indexer trust model | Multiple competing indexers (UniSat, OKX, Hiro) | Multiple competing diviners encouraged |
| Reorg discipline | "Wait N blocks" rule of thumb | Read only from `viewer.finalization` |

Everything else — open ticker registration, race-to-deploy, capped supply with per-mint limit, drop-malformed semantics — is intentionally identical to BRC-20 to keep the mental model familiar.

---

## Pattern Overview

```
Deploy ──► inscription (artifact) ──► claims a ticker
Mint   ──► event                  ──► credits signer's balance
Transfer ──► event                ──► moves balance signer → recipient
                  │
                  ▼
        Indexer (two passes over finalized blocks)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
  Substrate state      Token state
  (inscriptions,       (tickers,
   owners)              balances)
```

The indexer makes two logical passes over each finalized block:
1. **Substrate pass** — reuses the inscription substrate indexer to materialize inscriptions, transfers of inscriptions, and ownership.
2. **Token pass** — interprets XRC-20 schemas to materialize tickers and balances.

Both passes read the same canonical block stream; they produce independent read models that the application can query.

---

## Step 1: Use the Three XRC-20 Types

Three narrow schemas under `network.xyo.ordinal.token.*` ship from the SDK. Narrow schemas keep types sharp, datalake filtering surgical, and the indexer's discriminated union exhaustive. Import them — these schema names are reserved to the XYO Foundation; any *new* application schemas you author belong under `com.<your-org>.<app>.*` (see [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming)).

```ts
import {
  TokenDeploy, TokenDeploySchema, isTokenDeploy, asTokenDeploy,
  TokenMint, TokenMintSchema, isTokenMint, asTokenMint,
  TokenTransfer, TokenTransferSchema, isTokenTransfer, asTokenTransfer,
  TickerZod, TokenAmountZod,
} from '@xyo-network/xl1-sdk'
```

The SDK also exports `TickerZod` (1-8 char string) and `TokenAmountZod` (decimal-string big integer) as the canonical primitives — reuse them in any application-layer schema that needs the same shapes.

### Deploy (artifact)

A deploy is an inscription artifact. It has a content-addressed ID and an owner (the BoundWitness signer). Whoever owns the deploy artifact owns the ticker. Fields:

- `tick` (`Ticker`) — ticker symbol, 1-8 characters; case-folded by the indexer
- `max` (`TokenAmount`) — total supply, decimal string for big-integer safety
- `lim` (`TokenAmount`) — per-mint cap
- `decimals` (optional integer 0-18) — display decimals; defaults to 0

### Mint (event)

Fields:

- `tick` (`Ticker`) — ticker being minted
- `amt` (`TokenAmount`) — amount minted

### Transfer (event)

Fields:

- `tick` (`Ticker`) — ticker being transferred
- `to` (`XyoAddress`) — recipient address (declarative content)
- `amt` (`TokenAmount`) — amount transferred

None of these payloads carry a `from`. The actor is always the BoundWitness signer, derived structurally — see [Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md).

`amt`, `max`, and `lim` are decimal strings rather than numbers to preserve big-integer precision across JSON serialization. The indexer parses them with `BigInt`.

---

## Pinned Sentinel Addresses

XRC-20 uses two sentinels per operation, following the [Destination as Protocol](chain-data-indexing-protocol.md#destination-as-protocol--a-native-xl1-pattern) pattern. Operations are submitted with a single `Transfer` payload whose `transfers` map carries both:

```ts
import { sentinelAddressFromSchema } from '@xyo-network/xl1-sdk'

// Pinned: equals sentinelAddressFromSchema('network.xyo.ordinal.token')
const XRC20_SENTINEL = 'c17df06bc481b090f7a0e03639fca786df6e8e65'

// Per-payload burn — derived from the operation payload's hash
const burnFor = (payloadHash: string) =>
  sentinelAddressFromSchema('network.xyo.ordinal.token', payloadHash)
```

The static `XRC20_SENTINEL` makes every XRC-20 operation discoverable via `accountBalanceHistory(XRC20_SENTINEL)` — anyone can list the entire protocol's activity chain-side. The per-payload burn binds dust to the specific operation, providing real-cost semantics.

---

## Step 2: Deploy a Ticker

Deploys are inscriptions claiming a ticker. The first finalized deploy for a given `tick` claims it; later deploys for the same ticker exist as artifacts but produce no token state.

```ts
import { PayloadBuilder } from '@xyo-network/sdk-js'

const deploy = new PayloadBuilder<TokenDeploy>({ schema: TokenDeploySchema })
  .fields({ tick: 'XL1', max: '21000000', lim: '1000' })
  .build()

const sentinelTransfer = new PayloadBuilder({ schema: 'network.xyo.transfer' })
  .fields({
    from: walletAddress,
    epoch: Date.now(),
    transfers: {
      [XRC20_SENTINEL]:        '1',
      [burnFor(deploy._hash)]: '1',
    },
  })
  .build()

await datalakeRunner.insert([deploy])
const [txHash] = await defaultGateway.addPayloadsToChain([sentinelTransfer], [deploy])
```

Ticker ownership is the substrate's ownership of the deploy artifact: whoever signed the BoundWitness that introduced the deploy owns the ticker. Transferring the deploy inscription (via `network.xyo.ordinal.transfer`) transfers ticker ownership.

---

## Step 3: Mint

Anyone can attempt to mint, up to the per-deploy `lim` per mint event and the cumulative `max`.

```ts
const mint = new PayloadBuilder<TokenMint>({ schema: TokenMintSchema })
  .fields({ tick: 'XL1', amt: '1000' })
  .build()

const sentinelTransfer = new PayloadBuilder({ schema: 'network.xyo.transfer' })
  .fields({
    from: walletAddress,
    epoch: Date.now(),
    transfers: {
      [XRC20_SENTINEL]:      '1',
      [burnFor(mint._hash)]: '1',
    },
  })
  .build()

await datalakeRunner.insert([mint])
await defaultGateway.addPayloadsToChain([sentinelTransfer], [mint])
```

The indexer credits the signer of the wrapping `TransactionBoundWitness`. Two users submitting byte-identical mint payloads collide on payload hash — that's fine, because mints are events, not artifacts. The wrapping BoundWitnesses differ; the indexer reads them as two separate events with two separate signers. This is what the artifact/event split buys us.

---

## Step 4: Transfer

A single signed payload moves balance from the signer to `to`. No two-step inscribe-intent dance.

```ts
const transfer = new PayloadBuilder<TokenTransfer>({ schema: TokenTransferSchema })
  .fields({ tick: 'XL1', to: 'recipient40HexChars…', amt: '500' })
  .build()

const sentinelTransfer = new PayloadBuilder({ schema: 'network.xyo.transfer' })
  .fields({
    from: walletAddress,
    epoch: Date.now(),
    transfers: {
      [XRC20_SENTINEL]:          '1',
      [burnFor(transfer._hash)]: '1',
    },
  })
  .build()

await datalakeRunner.insert([transfer])
await defaultGateway.addPayloadsToChain([sentinelTransfer], [transfer])
```

The indexer enforces that the signer's balance is sufficient at the moment the transfer is replayed. Insufficient-balance transfers are dropped.

---

## Step 5: Build the Indexer (Dual-Pass)

The XRC-20 indexer composes with the substrate indexer. Reuse the [Inscription Substrate](inscription-substrate.md) replay loop for the substrate pass; the token pass is a second handler on the same block iteration.

### State shape

```ts
type TickerRecord = {
  tick: string                    // case-folded
  deployInscriptionId: string     // ID of the deploy artifact (also acts as ticker-owner pointer)
  max: bigint
  lim: bigint
  decimals: number
  minted: bigint                  // running total
}

type TokenState = {
  tickers: Map<string, TickerRecord>          // case-folded tick -> record
  balances: Map<string, Map<Address, bigint>> // tick -> address -> balance
}
```

### Token pass

```ts
function applyTokenDeploy(
  substrate: IndexerState,
  state: TokenState,
  payload: TokenDeploy,
  signer: Address,
  blockHeight: XL1BlockNumber,
) {
  const tick = payload.tick.toLowerCase()
  if (state.tickers.has(tick)) return // first-finalized wins; later deploys are ignored

  const max = safeBigInt(payload.max)
  const lim = safeBigInt(payload.lim)
  if (max === undefined || lim === undefined) return    // malformed — drop
  if (max <= 0n || lim <= 0n || lim > max) return       // nonsensical bounds — drop

  // Register the deploy as a substrate artifact — ticker ownership tracks artifact ownership,
  // so a substrate transfer of this artifact transfers ticker ownership.
  registerArtifact(substrate, payload, signer, blockHeight)

  state.tickers.set(tick, {
    tick,
    deployInscriptionId: payload._hash,
    max,
    lim,
    decimals: payload.decimals ?? 0,
    minted: 0n,
  })
  state.balances.set(tick, new Map())
}

// Helper to look up the current ticker owner via the substrate's artifact ledger
function tickerOwner(substrate: IndexerState, ticker: TickerRecord): Address | undefined {
  return substrate.artifacts.get(ticker.deployInscriptionId)?.owner
}

function applyTokenMint(
  state: TokenState,
  payload: TokenMint,
  signer: Address,
) {
  const tick = payload.tick.toLowerCase()
  const ticker = state.tickers.get(tick)
  if (!ticker) return                                    // unknown ticker — drop

  const amt = safeBigInt(payload.amt)
  if (amt === undefined || amt <= 0n) return             // malformed — drop
  if (amt > ticker.lim) return                           // exceeds per-mint cap — drop
  if (ticker.minted + amt > ticker.max) return           // exceeds total supply — drop

  ticker.minted += amt
  const balances = state.balances.get(tick)!
  balances.set(signer, (balances.get(signer) ?? 0n) + amt)
}

function applyTokenTransfer(
  state: TokenState,
  payload: TokenTransfer,
  signer: Address,
) {
  const tick = payload.tick.toLowerCase()
  const ticker = state.tickers.get(tick)
  if (!ticker) return                                    // unknown ticker — drop

  const amt = safeBigInt(payload.amt)
  if (amt === undefined || amt <= 0n) return             // malformed — drop

  const balances = state.balances.get(tick)!
  const fromBalance = balances.get(signer) ?? 0n
  if (fromBalance < amt) return                          // insufficient balance — drop

  balances.set(signer, fromBalance - amt)
  balances.set(payload.to, (balances.get(payload.to) ?? 0n) + amt)
}

function safeBigInt(decimal: string): bigint | undefined {
  if (!/^\d+$/.test(decimal)) return undefined
  try { return BigInt(decimal) } catch { return undefined }
}
```

### Wiring into the substrate replay

Inside the second pass of the substrate indexer's `replayFinalizedBlocks` (the per-payload loop after the hash→signer index is built), add discriminated dispatch on the token schemas. The signer is recovered from the same `hashToSigner` index used by the substrate pass — authorship discipline applies uniformly:

```ts
for (const p of payloads) {
  const signer = hashToSigner.get(p._hash)
  if (!signer) continue // payload not wrapped by a transaction in this block

  // Substrate pass (existing — see Inscription Substrate)
  if (isInscription(p))           registerArtifact(substrate, p, signer, n)
  else if (isOrdinalTransfer(p))  applyTransfer(substrate, p, signer)

  // Token pass
  else if (isTokenDeploy(p))   applyTokenDeploy(substrate, token, p, signer, n)
  else if (isTokenMint(p))     applyTokenMint(token, p, signer)
  else if (isTokenTransfer(p)) applyTokenTransfer(token, p, signer)
}
```

Because both passes iterate canonical (block height, payload index) order over finalized blocks, the resulting state is fully deterministic. Two indexers replaying the same finalized stream produce byte-identical `TokenState`. That determinism is the social-consensus glue across competing diviners.

---

## Canonical Ordering Rules

These rules are deterministic and indexer-agnostic. Any indexer that follows them produces the same state.

| Situation | Resolution |
|---|---|
| Multiple deploys for the same `tick` across blocks | Earliest finalized block wins; later are ignored |
| Multiple deploys for the same `tick` in the same block | Lower payload index wins |
| Mint after `max` reached | Drop entirely (no partial credit even if `amt` would still fit) |
| Mint with `amt > lim` | Drop entirely |
| Mint for unknown ticker | Drop |
| Transfer with `signer` balance < `amt` | Drop entirely (no partial transfer) |
| Transfer to the same address as signer | Allowed; effectively a no-op (balance unchanged after debit/credit) |
| Self-mint of zero or negative `amt` | Drop |
| Malformed JSON, missing fields, non-decimal numbers | Drop at the schema-validation layer (`isXxxPayload` guards) |
| Tick case differences (`ORDI` vs `ordi`) | Indexer case-folds to lowercase before lookup; deploys are stored case-folded |

The "drop" pattern is intentional and matches BRC-20: the chain accepted these payloads (it doesn't know XRC-20 rules), but the indexer's canonical interpretation is to ignore them. The user pays gas for a no-op, just as on Bitcoin.

---

## Anti-Patterns

| Anti-Pattern | Why it fails | Do this instead |
|---|---|---|
| Adding a `from` field to mint or transfer payloads | Duplicates BoundWitness signer; can drift from authenticated truth | Derive signer from `transactionBoundWitness.from` |
| Using `Number` for `amt`, `max`, `lim` | Loses precision above 2^53; breaks for any realistic token supply | Decimal strings in payloads, `BigInt` in the indexer |
| Implementing partial mints when remaining supply is less than `amt` | Diverges from BRC-20; creates ambiguity across indexers | Drop the entire mint when it would exceed `max` |
| Treating ticker symbols case-sensitively | `ORDI` and `ordi` deploys race for the same ticker on BRC-20 (case-folded). Diverging here breaks user expectations | Case-fold to lowercase at indexer ingress |
| Replaying from `viewer.block.currentBlockNumber()` | Same finality footgun as the substrate; balances would oscillate during reorgs | Use `viewer.finalization.headNumber()` only |
| Reading transfer authorship from the payload's `to` field | `to` is the recipient (declarative). `from` does not exist on the payload by design | Always use the BoundWitness signer for the source of a transfer |
| Sharing one schema with an `op` discriminator (`{ p: "xrc-20", op: "mint", ... }`) | Loses Zod type sharpness, defeats per-operation schema filtering during chain walks, conflates artifact and event semantics | Three narrow schemas — one each for deploy, mint, transfer |

---

## Key Decisions

| Decision | Guidance |
|---|---|
| Want to support large numeric ranges? | Decimal strings + `BigInt` covers up to arbitrary precision; no extra work needed |
| Need a separate "token holders" index? | Derive from `state.balances` lazily; don't maintain a denormalized index unless query latency demands it |
| Want a public mint function (no per-address rate limit)? | XRC-20 has no rate limit — `lim` caps per-mint, not per-address. Add an application-layer rule if needed |
| Need to expose the indexer over RPC? | Wrap as an XYO diviner module ([Module System](../xyo-knowledge/modules.md)); query payloads return `TickerRecord` or balance lookups |
| Multiple competing indexers? | Encouraged. Determinism guarantees they converge given the same finalized stream — disagreement is a bug in one of them, not a protocol question |
| Want per-block snapshots / historical balance queries? | Persist `(blockHeight, address, tick) -> balance` deltas during replay. Out of scope for v1; layered on later |
| dApp wants to show "user X's XRC-20 activity" without running a global indexer? | Use the dual-sentinel pattern — `accountBalanceHistory(userAddress)` filtered for transactions hitting `XRC20_SENTINEL` returns every XRC-20 op the user submitted ([Scan Strategies §4](chain-data-indexing-protocol.md#strategy-4-sentinel-transfer-typically-backward)) |
| Need a chain-native list of every XRC-20 protocol invocation? | `accountBalanceHistory(XRC20_SENTINEL)` — the static sentinel collects every `Transfer` from any user submitting an XRC-20 op |
| Want fast "list all holders of a ticker"? | Add a per-ticker `holders: Set<Address>` side-index inside the global indexer ([Scan Strategies §3](chain-data-indexing-protocol.md#strategy-3-indexer-maintained-per-address-side-index-forward-iteration)) |
| Need to stop further mints (cap reached, founder pause)? | Out of v1 scope. Either let `max` exhaust naturally or define a dedicated event schema (`network.xyo.ordinal.token.freeze`) |

---

## Putting It Together

A complete XRC-20 stack on XL1 is:

1. The [Inscription Substrate](inscription-substrate.md) — provides identity, ownership, finality discipline
2. The three XRC-20 schemas defined in this document
3. A diviner that runs the dual-pass replay over `viewer.finalization.head()`-bounded blocks
4. A read-only browse UI ([In-Page Data Lakes](in-page-datalakes.md)) that queries the diviner for tickers and balances
5. A wallet-gated UI for deploy / mint / transfer that submits via `addPayloadsToChain`

The substrate is a generic ownable-artifact protocol; XRC-20 is one specific application of it. Other applications (collections, prediction-market shares, recursive content) compose the same way — define artifact and event schemas, extend the indexer with a new pass, reuse the substrate's finality and ordering guarantees.
