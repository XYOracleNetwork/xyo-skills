# Commit-Reveal Prediction Markets

Read this pattern when building a game, prediction market, or any application where participants stake on hidden choices and outcomes are settled on-chain. This is a composite pattern that combines the [Commit-Reveal Primitive](commit-reveal.md), [Chain Data Indexing](chain-data-indexing.md), and [In-Page Data Lakes](in-page-datalakes.md) into a complete recipe.

**Builds on:**
- [Commit-Reveal Primitive](commit-reveal.md) — two-phase fairness protocol
- [Chain Data Indexing](chain-data-indexing.md) — schema-based querying and polling
- [In-Page Data Lakes](in-page-datalakes.md) — read-only browsing without wallet
- [Browser Wallet](../xl1-knowledge/wallet.md) — transaction submission, React integration
- [Protocol Primitives](../xyo-knowledge/primitives.md) — payloads, bound witnesses, hashing

---

## The Pattern

A prediction market follows a five-phase lifecycle:

```
CREATE ──► COMMIT ──► REVEAL ──► SETTLE ──► CLOSED
  │          │          │          │
  │          │          │          └─ Winnings distributed
  │          │          └─ Choices verified against commits
  │          └─ Players submit hash(prediction + salt)
  └─ Market created with question, options, deadlines
```

Each phase is represented by on-chain payloads. The chain becomes the single source of truth for the market's state.

---

## Schema Design

Define a schema for each phase of the lifecycle:

```ts
import { asSchema } from '@xyo-network/sdk-js'
import { zodIsFactory, zodAsFactory, zodToFactory } from '@xylabs/sdk-js'
import { z } from 'zod'

// --- Market Definition ---

export const MarketSchema = asSchema('network.xyo.market', true)

export const MarketPayloadZod = z.object({
  schema: z.literal('network.xyo.market'),
  /** Unique market identifier */
  marketId: z.string(),
  /** The question or contest being predicted */
  question: z.string(),
  /** Valid choices participants can commit to */
  options: z.array(z.string()),
  /** Block number deadline for commits */
  commitDeadline: z.number().int(),
  /** Block number deadline for reveals */
  revealDeadline: z.number().int(),
  /** Minimum number of participants to proceed */
  minParticipants: z.number().int().min(2),
})

export type MarketPayload = z.infer<typeof MarketPayloadZod>
export const isMarketPayload = zodIsFactory(MarketPayloadZod)

// --- Market Commit (extends the generic commit with market-specific fields) ---

export const MarketCommitSchema = asSchema('network.xyo.market.commit', true)

export const MarketCommitPayloadZod = z.object({
  schema: z.literal('network.xyo.market.commit'),
  /** References the market this commit belongs to */
  marketId: z.string(),
  /** hash(prediction + salt) */
  commitment: z.string(),
  /** Block at which this commit was recorded */
  commitBlock: z.number().int(),
})

export type MarketCommitPayload = z.infer<typeof MarketCommitPayloadZod>
export const isMarketCommitPayload = zodIsFactory(MarketCommitPayloadZod)

// --- Market Reveal ---

export const MarketRevealSchema = asSchema('network.xyo.market.reveal', true)

export const MarketRevealPayloadZod = z.object({
  schema: z.literal('network.xyo.market.reveal'),
  marketId: z.string(),
  /** The actual prediction */
  prediction: z.string(),
  /** The salt used in the commitment */
  salt: z.string(),
})

export type MarketRevealPayload = z.infer<typeof MarketRevealPayloadZod>
export const isMarketRevealPayload = zodIsFactory(MarketRevealPayloadZod)

// --- Market Settlement ---

export const MarketSettlementSchema = asSchema('network.xyo.market.settlement', true)

export const MarketSettlementPayloadZod = z.object({
  schema: z.literal('network.xyo.market.settlement'),
  marketId: z.string(),
  /** The correct outcome */
  outcome: z.string(),
  /** Addresses that predicted correctly */
  winners: z.array(z.string()),
  /** Addresses that predicted incorrectly or failed to reveal */
  losers: z.array(z.string()),
})

export type MarketSettlementPayload = z.infer<typeof MarketSettlementPayloadZod>
export const isMarketSettlementPayload = zodIsFactory(MarketSettlementPayloadZod)
```

---

## Phase 1: Create Market

The market creator defines the question, valid options, and deadlines. This is the first payload recorded on-chain:

```ts
import { PayloadBuilder } from '@xyo-network/sdk-js'

async function createMarket(
  gateway: XyoGatewayRunner,
  question: string,
  options: string[],
  currentBlock: number,
): Promise<{ marketId: string; txHash: Hash }> {
  // crypto.randomUUID is the correct native API — the SDK does not wrap UUID generation
  const marketId = crypto.randomUUID()

  // Deadlines: commit window of ~100 blocks, reveal window of ~100 blocks after that
  const commitDeadline = currentBlock + 100
  const revealDeadline = commitDeadline + 100

  const marketPayload = new PayloadBuilder({ schema: MarketSchema })
    .fields({
      marketId,
      question,
      options,
      commitDeadline,
      revealDeadline,
      minParticipants: 2,
    })
    .build()

  // Insert into the dApp's datalake first — the wallet does not do this automatically.
  // datalakeRunner is a RestDataLakeRunner from @xyo-network/xl1-sdk.
  await datalakeRunner.insert([marketPayload])

  const [txHash] = await gateway.addPayloadsToChain([], [marketPayload])
  return { marketId, txHash }
}
```

---

## Phase 2: Commit Predictions

Participants commit their predictions using the [Commit-Reveal Primitive](commit-reveal.md). The prediction must be one of the market's valid `options`:

```ts
async function commitPrediction(
  gateway: XyoGatewayRunner,
  marketId: string,
  prediction: string,
  currentBlock: number,
): Promise<{ txHash: Hash; salt: string }> {
  const salt = generateSalt()
  const commitment = await createCommitment(prediction, salt)

  const commitPayload = new PayloadBuilder({ schema: MarketCommitSchema })
    .fields({
      marketId,
      commitment,
      commitBlock: currentBlock,
    })
    .build()

  await datalakeRunner.insert([commitPayload])
  const [txHash] = await gateway.addPayloadsToChain([], [commitPayload])

  // Store salt locally — needed for reveal phase
  return { txHash, salt }
}
```

**Validation before commit:** The UI should fetch the market payload and verify:
- The prediction is in the market's `options` array
- The current block is before `commitDeadline`
- The market has not already been settled

---

## Phase 3: Reveal Predictions

After the commit deadline passes, participants reveal their predictions:

```ts
async function revealPrediction(
  gateway: XyoGatewayRunner,
  marketId: string,
  prediction: string,
  salt: string,
): Promise<Hash> {
  const revealPayload = new PayloadBuilder({ schema: MarketRevealSchema })
    .fields({ marketId, prediction, salt })
    .build()

  await datalakeRunner.insert([revealPayload])
  const [txHash] = await gateway.addPayloadsToChain([], [revealPayload])
  return txHash
}
```

**Validation before reveal:**
- Current block is after `commitDeadline` and before `revealDeadline`
- The participant has a recorded commit for this market

---

## Phase 4: Settle

After the reveal deadline, the market creator (or any authorized party) settles the market by recording the outcome and categorizing participants:

```ts
async function settleMarket(
  gateway: XyoGatewayRunner,
  marketId: string,
  outcome: string,
  commits: Array<{ address: Address; commitment: string }>,
  reveals: Array<{ address: Address; prediction: string; salt: string }>,
): Promise<Hash> {
  // Verify all reveals against their commits
  const verified = new Map<Address, string>()
  for (const reveal of reveals) {
    const commit = commits.find(c => c.address === reveal.address)
    if (!commit) continue

    const expected = await createCommitment(reveal.prediction, reveal.salt)
    if (expected === commit.commitment) {
      verified.set(reveal.address, reveal.prediction)
    }
  }

  // Determine winners and losers
  const winners = [...verified.entries()]
    .filter(([, prediction]) => prediction === outcome)
    .map(([address]) => address)

  const losers = [
    // Committed but didn't reveal
    ...commits
      .filter(c => !verified.has(c.address))
      .map(c => c.address),
    // Revealed but predicted wrong
    ...[...verified.entries()]
      .filter(([, prediction]) => prediction !== outcome)
      .map(([address]) => address),
  ]

  const settlementPayload = new PayloadBuilder({ schema: MarketSettlementSchema })
    .fields({ marketId, outcome, winners, losers })
    .build()

  await datalakeRunner.insert([settlementPayload])
  const [txHash] = await gateway.addPayloadsToChain([], [settlementPayload])
  return txHash
}
```

---

## Querying Market State

Use the [Chain Data Indexing](chain-data-indexing.md) pattern to reconstruct market state from on-chain payloads. Group by `marketId` to build a complete view:

```ts
import { isPayloadOfSchemaType } from '@xyo-network/sdk-js'

interface MarketState {
  market: MarketPayload
  commits: MarketCommitPayload[]
  reveals: MarketRevealPayload[]
  settlement?: MarketSettlementPayload
  phase: 'commit' | 'reveal' | 'settled' | 'expired'
}

function buildMarketState(
  market: MarketPayload,
  allPayloads: Payload[],
  currentBlock: number,
): MarketState {
  const commits = allPayloads
    .filter(isMarketCommitPayload)
    .filter(c => c.marketId === market.marketId)

  const reveals = allPayloads
    .filter(isMarketRevealPayload)
    .filter(r => r.marketId === market.marketId)

  const settlement = allPayloads
    .filter(isMarketSettlementPayload)
    .find(s => s.marketId === market.marketId)

  const phase = settlement
    ? 'settled'
    : currentBlock >= market.revealDeadline
      ? 'expired'
      : currentBlock >= market.commitDeadline
        ? 'reveal'
        : 'commit'

  return { market, commits, reveals, settlement, phase }
}
```

---

## React Integration

Use [In-Page Data Lakes](in-page-datalakes.md) so visitors can browse markets without connecting a wallet. Gate commit/reveal actions behind wallet connection:

```tsx
import { useProvidedGateway } from '@xyo-network/react-chain-client'

function MarketPage({ marketId }: { marketId: string }) {
  const { defaultGateway } = useProvidedGateway()
  const [market, setMarket] = useState<MarketState>()
  const [address, setAddress] = useState<string>()

  const canWrite = defaultGateway && 'addPayloadsToChain' in defaultGateway

  useEffect(() => {
    if (!defaultGateway) return
    // Load market state from chain — works without wallet
    loadMarketState(defaultGateway, marketId).then(setMarket)
  }, [defaultGateway, marketId])

  if (!market) return <p>Loading...</p>

  return (
    <div>
      {/* Always visible — read-only */}
      <MarketHeader market={market.market} phase={market.phase} />
      <CommitCount count={market.commits.length} />

      {market.phase === 'settled' && (
        <SettlementResults settlement={market.settlement!} />
      )}

      {/* Always render — handles both unconnected and connected states */}
      <ConnectAccountsStack onAccountConnected={setAddress} />

      {canWrite && address && market.phase === 'commit' && (
        <CommitForm
          market={market.market}
          gateway={defaultGateway}
          onCommit={(salt) => {
            // Persist salt to localStorage keyed by marketId
            localStorage.setItem(`market:${marketId}:salt`, salt)
          }}
        />
      )}

      {canWrite && address && market.phase === 'reveal' && (
        <RevealForm
          market={market.market}
          gateway={defaultGateway}
          savedSalt={localStorage.getItem(`market:${marketId}:salt`)}
        />
      )}
    </div>
  )
}
```

---

## Lifecycle Summary

| Phase | Who Acts | On-Chain Payload | Wallet Required |
|-------|----------|-----------------|-----------------|
| Create | Market creator | `MarketPayload` | Yes |
| Commit | Each participant | `MarketCommitPayload` | Yes |
| Reveal | Each participant | `MarketRevealPayload` | Yes |
| Settle | Market creator or arbiter | `MarketSettlementPayload` | Yes |
| Browse | Anyone | _(read only)_ | No |

---

## Adapting This Pattern

This recipe is intentionally generic. To adapt it to a specific application:

| Application | Options | Outcome Source |
|-------------|---------|---------------|
| Rock Paper Scissors | `['rock', 'paper', 'scissors']` | Deterministic from both players' reveals |
| Binary Prediction | `['yes', 'no']` | Oracle or external data feed |
| Multi-choice Vote | `['option-a', 'option-b', ...]` | Tally from all reveals |
| Sealed-bid Auction | Bid amounts as strings | Highest valid reveal wins |

The schema namespace, deadline windows, and settlement logic change — the commit-reveal structure and on-chain recording pattern stay the same.
