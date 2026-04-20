# XL1 Chain

**Key npm packages:**
- `@xyo-network/xl1-protocol-model` — Zod schemas and TypeScript types for all chain data structures
- `@xyo-network/xl1-protocol-lib` — Viewer/Runner interface definitions
- `@xyo-network/xl1-validation` — Composable validation functions

For full type details, read the `.d.ts` files at `dist/neutral/index.d.ts` in each package.

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

  // Block metadata ($ prefix, excluded from _dataHash):
  $epoch: number               // Epoch timestamp (milliseconds)
}
```

### Hydrated Blocks

Blocks are tuples pairing the BoundWitness with its resolved payloads:

```ts
type HydratedBlock = [BlockBoundWitness, Payload[]]
```

**9 variant combinations** exist for each hydrated type:
- Signing: default / `Signed` / `Unsigned`
- Metadata: plain / `WithHashMeta` / `WithStorageMeta`
- Example: `SignedHydratedBlockWithHashMeta`

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

### Gas Costs

| Operation | Gas Cost |
|-----------|----------|
| Character storage (per JSON char) | 10 |
| Payload validation (per payload) | 1,000 |
| Signature validation (per signature) | 1,000 |
| Hash validation (per hash) | 100 |
| Balance validation (per state change) | 100 |

### Minimum Transaction Fees

| Field | Minimum (AttoXL1) | Human Readable |
|-------|--------------------|----------------|
| `base` | 1,000 × 10^9 | 1,000 NanoXL1 |
| `gasPrice` | 10 × 10^9 | 10 NanoXL1/gas |
| `gasLimit` | 1,000,000 × 10^9 | 1M NanoXL1 |
| `priority` | 0 | 0 |

### Currency Units

| Unit | Decimal Places | Relation to AttoXL1 |
|------|----------------|---------------------|
| XL1 | 18 | 1 XL1 = 10^18 AttoXL1 |
| MilliXL1 | 15 | 10^15 AttoXL1 |
| MicroXL1 | 12 | 10^12 AttoXL1 |
| NanoXL1 | 9 | 10^9 AttoXL1 |
| PicoXL1 | 6 | 10^6 AttoXL1 |
| FemtoXL1 | 3 | 10^3 AttoXL1 |
| **AttoXL1** | 0 | Base unit (like wei) |

---

## Block Rewards

| Constant | Value |
|----------|-------|
| Starting reward | 500 XL1 (500 × 10^18 AttoXL1) |
| Blocks per step | 1,000,000 |
| Step decay | 5% reduction per step (multiply by 95/100) |
| Minimum reward | 10 AttoXL1 |
| Creator reward | 20,000,000,000 AttoXL1 per block (fixed) |

Formula: `reward(step) = max(startingReward × (95/100)^step, minReward)` where `step = floor(blockNumber / 1,000,000)`

Integer arithmetic only — numerator 95, denominator 100, no floating point.

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

### Hex Encoding Convention

All hex values in XL1 use:
- **Lowercase** characters (`a-f`, not `A-F`)
- **No `0x` prefix** (unless explicitly specified)
- Hash: 64 chars, Address/ChainId: 40 chars, Signature: 128 chars
