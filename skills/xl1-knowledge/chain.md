# XL1 Chain

**Key npm package:** `@xyo-network/xl1-protocol` — the protocol monolith. It
exposes the former standalone packages as export subpaths (import from the
subpath, not the old package name):
- `@xyo-network/xl1-protocol/protocol-model` — Zod schemas and TypeScript types for all chain data structures
- `@xyo-network/xl1-protocol/protocol-lib` — Viewer/Runner interface definitions (also re-exports `protocol-model`)
- `@xyo-network/xl1-protocol/validation` — Composable validation functions

The `@xyo-network/xl1-protocol` root barrel re-exports `protocol-lib`,
`network-model`, `schema`, and `validation` (and, transitively via
`protocol-lib`, `protocol-model`). In SDK/dApp code, everything here is also
re-exported from the `@xyo-network/xl1-sdk` root barrel, so a single import from
`@xyo-network/xl1-sdk` covers protocol types and SDK runtime alike.

For full type details, read the `.d.ts` files under `dist/neutral/` for the
relevant subpath.

---

## XL1 Fundamentals

XL1 is the XYO Layer One blockchain — a data-focused L1 optimized for high-throughput data applications (AI, DePIN, RWA tracking).

XL1 extends XYO's BoundWitness and Payload model (see [XYO Knowledge](../xyo-knowledge/SKILL.md)) with blockchain primitives: blocks, transactions, fees, staking, and consensus.

### Dual Token Model
- **XYO** — governance and staking token (deflationary, fixed supply)
- **XL1** — gas and utility token (inflationary ~0.7% annually, transaction burning offsets inflation)

---

## BlockBoundWitness

A block is a BoundWitness extended with chain-specific fields:

```ts
interface BlockBoundWitness extends BoundWitness {
  // Block-specific fields (included in _dataHash):
  block: XL1BlockNumber        // Block height (integer, 0 = genesis)
  chain: ChainId               // Chain identifier (40-char hex, same format as Address)
  previous: Hash | null        // Previous block hash (null for genesis)
  protocol?: number            // Protocol version
  step_hashes?: Hash[]         // Step checkpoint hashes
  supersedes?: Hash            // Signed hash of the same-height candidate this block replaces

  // Optional unsigned client meta ($ prefix, excluded from _dataHash). Not the clock.
  $epoch?: number
}
```

`supersedes` is a signed field on purpose: it is what separates an honest
re-proposal at the same height from double-signing, so a producer cannot add or
drop it after signing.

The block clock is the signed `network.xyo.time` payload elevated into the block (`epoch` in milliseconds). Read it with `timePayloadOfBlock` / `epochOfBlock` from `@xyo-network/xl1-sdk`. `$epoch` is leftover client meta: producers no longer write it, and nothing that gates (qualification, finality, head selection) should accept it. `epochOfBlock` falls back to `$epoch` only so reads over pre-time-payload history keep working.

### Hydrated Blocks

Blocks are tuples pairing the BoundWitness with its resolved payloads:

```ts
type HydratedBlock = [BlockBoundWitness, Payload[]]
```

7 type variants exist: `HydratedBlock` and `SignedHydratedBlock`, each plain or with `WithHashMeta` / `WithStorageMeta`, plus the JSON wire form `SignedHydratedBlockToJson`. There are no `Unsigned` block variants (transactions have them; see [Development — Hydrated Types](development.md#hydrated-types)). Gateway viewer methods typically return `SignedHydratedBlockWithHashMeta`. Hydration is shallow: a viewer fills `Payload[]` only from the gateway's own payload store — a block's transaction bound witnesses and on-chain payloads — never with the off-chain bodies those transactions reference, which come from a datalake by hash (see [Gateway — What `block.blockByNumber` returns](gateway.md#what-blockblockbynumber-and-friends-returns--hydration-is-shallow)).

---

## TransactionBoundWitness

A transaction is a BoundWitness extended with transaction-specific fields:

```ts
interface TransactionBoundWitness extends BoundWitness {
  chain: ChainId               // Target chain
  from: Address                // Sender address
  nbf: number                  // Not-before block number
  exp: number                  // Expiration block number
  fees: TransactionFeesHex     // Fee structure
  script?: string[]            // Optional elevation script commands
}
```

### `from` is the author

`from` must be a valid address listed in the transaction's `addresses`
(`TransactionFromValidator`), so it is always one of the transaction's signers.
It is the structural author of every payload the transaction carries or
references: read the actor from `tx[0].from` on a validated transaction, never
from a `from` / `owner` / `author` field inside an application payload. This is
XYO's structural-authorship rule applied to XL1 — see
[Declarative Payloads, Structural Authorship](../xyo-knowledge/best-practices.md#declarative-payloads-structural-authorship).

The chain's own `network.xyo.transfer` payload (`from`, `epoch`, `transfers`,
optional `context`) is a protocol-owned exception: its `from` names the account
being debited, which need not be the signer. The transfer-authorization
validator (`TransactionTransfersValidatorFactory`) accepts it only when
`tx.from` is authorized for that address — by default, only the address itself.
Do not copy that shape into application payloads.

### Transaction Fees

Fees are hex-encoded AttoXL1 values (no `0x` prefix):

```ts
interface TransactionFeesHex {
  base: HexString              // Base transaction fee
  gasPrice: HexString          // Per-gas cost
  gasLimit: HexString          // Maximum gas allowed
  priority: HexString          // Priority fee (optional incentive)
}
```

### Transaction Validity

Transactions are valid within a block range:
- `nbf` (not-before) — earliest block this transaction can be included
- `exp` (expiration) — latest block (exclusive)
- Must satisfy: `nbf <= currentBlock < exp`

---

## Fee Structure & Gas Model

Gas costs scale with operation complexity: signature and payload validation are expensive (~1,000 gas each), hash and balance validation are moderate (~100 gas), and character storage costs ~10 gas per JSON character. Use these estimates to predict transaction costs for payload-heavy operations. Minimum transaction fees are defined by the protocol (base, gasPrice, gasLimit, priority fields) — check the chain config for current values.

XL1 uses **AttoXL1** as the base unit (like wei in Ethereum). All on-chain amounts are integers in AttoXL1. Key conversions: 1 XL1 = 10^18 AttoXL1, 1 NanoXL1 = 10^9 AttoXL1. Use these for fee calculations, balance display, and token math.

---

## Block Rewards

| Constant | Value |
|----------|-------|
| Starting reward | 500 XL1 (500 × 10^18 AttoXL1) |
| Blocks per step | 1,000,000 |
| Step decay | 5% reduction per step (multiply by 95/100) |
| Minimum reward | 10 XL1 (10 × 10^18 AttoXL1) |
| Creator reward | 20,000,000,000 XL1 (20,000,000,000 × 10^18 AttoXL1), paid once — genesis block 0 only |

Formula (every block after genesis): `reward(step) = max(startingReward × (95/100)^step, minReward)` where `step = floor(blockNumber / 1,000,000)`. `rewardFromBlockNumber(0)` returns the creator reward instead.

Integer arithmetic only — numerator 95, denominator 100, no floating point.

**Producer share:** `defaultRewardRatio = 0.1` (`@xyo-network/xl1-protocol/protocol-model`) —
the block producer receives 10% of the block reward; the remainder funds the
Step Rewards Pool that validators draw from. This is a config default and can be
overridden per chain.

---

## Node Types

### Block Producer
- Creates new blocks from pending transactions
- Includes transaction hashes and elevated payloads in each block
- Requires stake declaration for continued authorization

### Validator
- Confirms blocks are valid before the slashing window expires
- Can propose **rollback repairs** (reset to block before invalid one) or **replacement repairs** (substitute a new block)
- Earns rewards through the Step Rewards Pool

### Efficiency Node
- Provides reference data to reduce redundant calculations
- Tracks transfers and gas payments
- Reduces network congestion

---

## Consensus: Proof of Perfect

XL1 uses a novel consensus mechanism:
- Nodes algorithmically rank chain tips by **"perfectness"** (validity, recency, protocol alignment)
- Eliminates need to process entire chain history
- **Lookback windows**: nodes only actively store recent transactions; older data archived but accessible
- **Step hashes**: sequential data processing checkpoints that reduce bloat

**Hex encoding:** all hex values are lowercase, no `0x` prefix. Hashes are 64 chars, addresses/chain IDs 40, signatures 128.

---

## Chain Forks

An XL1 chain can **fork**: it halts and relaunches under a new chain-contract
identity (a new `ChainId`) while continuing the *same* hash-linked ledger — each
post-fork block's `previous` links unbroken to the pre-fork head, block
numbering stays continuous, and history *below* the fork point is never
re-attributed. A fork assigns a new chain id only to blocks *above* its fork
point. This is a native protocol feature, not an operational anomaly, and it is
distinct from validator **repairs** (rollback/replacement within the slashing
window): a repair corrects a bad block on the *same* chain identity, while a
fork changes the identity itself.

Consequently **`ChainId` is a function of block height.** Every
`BlockBoundWitness` records the `chain` in force at its height, so the chain id
at block `n` is the `chain` field of block `n`.

The chain-contract viewer (`ChainContractViewer`) exposes the fork lineage. It is **not** on the typed `connection.viewer` — dApp code gets the chain id at a height from `connection.viewer.chainId(n)` / `.block.chainId(n)`; the lineage methods below are reachable only through a provider locator in node/server-side code (see [Gateway — Chain ID](gateway.md#chain-id--connectionviewerchainid--blockchainid)):
- `chainId()` — the current (tip) chain id.
- `chainIdAtBlockNumber(n | 'latest')` — the id authoritative at height `n`, walking the fork lineage. The canonical height→id lookup.
- `forkedAtBlockNumber()` / `forkedAtHash()` — where this chain forked from its parent (null on the genesis chain).
- `forkedChainId()` — the parent chain's id (null on the genesis chain).
- `forkedChainContractViewer()` — the parent chain's contract viewer, for walking lineage across multiple forks.

Because a given height's id is fixed forever, any commitment bound to a
finalized block height — an anchored transaction, a checkpoint, an application
state hash — stays stable and independently verifiable across all future forks.
When you stamp a height-bound artifact with a chain id, resolve it *at that
height* (`connection.viewer.chainId(height)`, or `chainIdAtBlockNumber(height)`
server-side), never with a bare "current chain id".
