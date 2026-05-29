# Commit-Reveal Prediction Markets

Read this pattern when building a game, prediction market, or any application where participants stake on hidden choices and outcomes are settled on-chain. This is a composite pattern that combines the [Commit-Reveal Primitive](commit-reveal.md), [Chain Data Indexing](chain-data-indexing-protocol.md), and [In-Page Data Lakes](in-page-datalakes.md) into a complete recipe.

**Builds on:**
- [Commit-Reveal Primitive](commit-reveal.md) — two-phase fairness protocol
- [Chain Data Indexing](chain-data-indexing-protocol.md) — schema-based querying and polling
- [In-Page Data Lakes](in-page-datalakes.md) — read-only browsing without wallet
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — transaction submission, React integration
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

Define a schema for each phase of the lifecycle. Validity windows reuse `BlockDurationZod` from the protocol, matching the same `nbf`/`exp` convention used on `TransactionBoundWitness` itself — see [Commit-Reveal — Validity Windows](commit-reveal.md#validity-windows-nbf--exp).

```ts
import { asSchema } from '@xyo-network/sdk-js'
import { BlockDurationZod } from '@xyo-network/xl1-sdk'
import { zodIsFactory, zodAsFactory, zodToFactory } from '@xylabs/sdk-js'
import { z } from 'zod'

// --- Market Definition ---

export const MarketSchema = asSchema('com.example.market', true)

export const MarketPayloadZod = z.object({
  schema: z.literal('com.example.market'),
  /** Unique market identifier */
  marketId: z.string(),
  /** The question or contest being predicted */
  question: z.string(),
  /** Valid choices participants can commit to */
  options: z.array(z.string()),
  /** Block window in which commits are accepted */
  commit: BlockDurationZod,
  /** Block window in which reveals are accepted; reveal.nbf must be >= commit.exp */
  reveal: BlockDurationZod,
  /** Minimum number of participants to proceed */
  minParticipants: z.number().int().min(2),
  /**
   * Addresses authorized to sign the settlement outcome.
   * For computable outcomes (e.g. RPS), this can be the market creator —
   * the signature only attests "this game completed", not the result itself.
   * For observed outcomes (sports, real-world events), one of these addresses
   * must sign the outcome value.
   */
  outcomeAuthorities: z.array(z.string()).min(1),
})

export type MarketPayload = z.infer<typeof MarketPayloadZod>
export const isMarketPayload = zodIsFactory(MarketPayloadZod)

// --- Market Commit (extends the generic commit with market-specific fields) ---

export const MarketCommitSchema = asSchema('com.example.market.commit', true)

export const MarketCommitPayloadZod = z.object({
  schema: z.literal('com.example.market.commit'),
  /** References the market this commit belongs to */
  marketId: z.string(),
  /** hash(prediction + salt) */
  commitment: z.string(),
})

export type MarketCommitPayload = z.infer<typeof MarketCommitPayloadZod>
export const isMarketCommitPayload = zodIsFactory(MarketCommitPayloadZod)

// --- Market Reveal ---

export const MarketRevealSchema = asSchema('com.example.market.reveal', true)

export const MarketRevealPayloadZod = z.object({
  schema: z.literal('com.example.market.reveal'),
  marketId: z.string(),
  /** The actual prediction */
  prediction: z.string(),
  /** The salt used in the commitment */
  salt: z.string(),
})

export type MarketRevealPayload = z.infer<typeof MarketRevealPayloadZod>
export const isMarketRevealPayload = zodIsFactory(MarketRevealPayloadZod)

// --- Market Settlement (lean outcome) ---

export const MarketSettlementSchema = asSchema('com.example.market.settlement', true)

export const MarketSettlementPayloadZod = z.object({
  schema: z.literal('com.example.market.settlement'),
  marketId: z.string(),
  /** The declared outcome — must be one of MarketPayload.options */
  outcome: z.string(),
})

export type MarketSettlementPayload = z.infer<typeof MarketSettlementPayloadZod>
export const isMarketSettlementPayload = zodIsFactory(MarketSettlementPayloadZod)

// --- Optional: Market Results View (non-authoritative cache) ---
//
// Indexers MAY publish this for ergonomic UI rendering on large markets.
// It is a derived view, not the source of truth — winners/losers are
// computable from the settlement BW + verified reveals at any time.

export const MarketResultsViewSchema = asSchema('com.example.market.results-view', true)

export const MarketResultsViewPayloadZod = z.object({
  schema: z.literal('com.example.market.results-view'),
  marketId: z.string(),
  /** Hash of the authoritative settlement payload this view derives from */
  settlement: z.string(),
  /** Addresses with a valid reveal matching MarketSettlementPayload.outcome */
  winners: z.array(z.string()),
  /** Addresses that committed but did not reveal validly, or revealed an incorrect choice */
  losers: z.array(z.string()),
})

export type MarketResultsViewPayload = z.infer<typeof MarketResultsViewPayloadZod>
export const isMarketResultsViewPayload = zodIsFactory(MarketResultsViewPayloadZod)
```

**Schema notes:**

- `MarketCommitPayload` no longer carries `commitBlock` — the wrapping `TransactionBoundWitness` already records the inclusion block, and the commit's validity is checked against `market.commit` at submission time.
- The settlement payload is intentionally tiny. The full evidence (verified reveals, timestamp) lives as **co-payloads** in the wrapping BoundWitness — see [Phase 4](#phase-4-settle).
- The `MarketResultsViewPayload` is a *cache*, not the source of truth. UIs should derive winners locally for any markets where the participant set is small; the view exists only to amortize that work for very large markets.

> Examples below use `asMarketPayload(... .build(), true)` etc. to narrow `PayloadBuilder.build()`'s result to the specific Zod-inferred type at runtime. See [PayloadBuilder — Narrowing the built payload](../xyo-knowledge/primitives.md#payloadbuilder) for the full rationale.

---

## Validation Gates

Each phase has a distinct validation responsibility. Treating them as separate gates — rather than scattering checks inline — keeps the contract for each transition explicit and lets a settler re-run earlier gates rigorously without trusting the caller. This is the same discipline the XYO/XNS escrow flow enforces with its three-tier validators.

| Gate | Runs at | Checks |
|------|---------|--------|
| **Commit gate** | Before submitting a `MarketCommitPayload` | Market exists; `current ∈ [market.commit.nbf, market.commit.exp)`; participant has not already committed; (if staked) participant has stake available |
| **Reveal gate** | Before submitting a `MarketRevealPayload` | `current ∈ [market.reveal.nbf, market.reveal.exp)`; participant has a recorded commit for this market; `prediction ∈ market.options`; `hash(prediction + salt)` matches the recorded commitment |
| **Settlement gate** | Before signing a `MarketSettlementPayload` | `current >= market.reveal.exp`; `outcome ∈ market.options`; settlement signer's address ∈ `market.outcomeAuthorities`; every reveal included in the settlement BW co-payloads has been re-verified against its commit |

The settlement gate explicitly **re-runs** the reveal-gate hash check on every reveal it bundles. This matters because a settler may receive reveals from an untrusted source (a relayer, an indexer cache); the cryptographic check is cheap and removes the trust assumption.

---

## Datalake Setup

The phase functions below use a `datalakeRunner` to persist payloads independently of the wallet. Create it once and share across your application. See [Gateway — Accessing the Datalake](../xl1-knowledge/gateway.md#accessing-the-datalake) for full details.

```ts
import { createRestDataLakeRunner } from '@xyo-network/xl1-sdk'

const datalakeRunner = await createRestDataLakeRunner('https://api.archivist.xyo.network/dataLake')
```

---

## Phase 1: Create Market

The market creator defines the question, valid options, validity windows, and the addresses authorized to settle. This is the first payload recorded on-chain:

```ts
import { PayloadBuilder } from '@xyo-network/sdk-js'
import { asXL1BlockNumber } from '@xyo-network/xl1-sdk'

async function createMarket(
  gateway: XyoGatewayRunner,
  question: string,
  options: string[],
  outcomeAuthorities: Address[],
  currentBlock: number,
): Promise<{ marketId: string; txHash: Hash }> {
  // crypto.randomUUID is the correct native API — the SDK does not wrap UUID generation
  const marketId = crypto.randomUUID()

  // Commit window: ~100 blocks. Reveal window: ~100 blocks immediately after.
  // reveal.nbf === commit.exp ensures the reveal phase opens exactly when commits close.
  const commit = {
    nbf: asXL1BlockNumber(currentBlock),
    exp: asXL1BlockNumber(currentBlock + 100),
  }
  const reveal = {
    nbf: commit.exp,
    exp: asXL1BlockNumber(commit.exp + 100),
  }

  const marketPayload: MarketPayload = asMarketPayload(
    new PayloadBuilder({ schema: MarketSchema })
      .fields({
        marketId,
        question,
        options,
        commit,
        reveal,
        minParticipants: 2,
        outcomeAuthorities,
      })
      .build(),
    true,
  )

  // Insert into the dApp's datalake first — the wallet does not do this automatically.
  await datalakeRunner.insert([marketPayload])

  const [txHash] = await gateway.addPayloadsToChain([], [marketPayload])
  return { marketId, txHash }
}
```

**Choosing `outcomeAuthorities`:**

- **Computable outcome** (RPS, deterministic from reveals): pass `[creatorAddress]` — the signature only attests "this game completed correctly", not the result itself. Anyone can verify the outcome by re-running the deterministic function on the verified reveals.
- **Observed outcome** (sports, real-world events): pass one or more oracle addresses. Settlement will only validate if signed by one of them.

---

## Phase 2: Commit Predictions

Participants commit their predictions using the [Commit-Reveal Primitive](commit-reveal.md). The commit-gate checks (see [Validation Gates](#validation-gates)) run before submission. The commit payload uses `$sources` to bind itself to the market by hash:

```ts
async function commitPrediction(
  gateway: XyoGatewayRunner,
  market: MarketPayload,
  prediction: string,
): Promise<{ txHash: Hash; salt: string }> {
  const salt = generateSalt()
  const commitment = await createCommitment(prediction, salt)
  const marketHash = await PayloadBuilder.dataHash(market)

  const commitPayload: MarketCommitPayload = asMarketCommitPayload(
    new PayloadBuilder({ schema: MarketCommitSchema })
      .fields({ marketId: market.marketId, commitment })
      .meta({ $sources: [marketHash] })
      .build(),
    true,
  )

  await datalakeRunner.insert([commitPayload])
  const [txHash] = await gateway.addPayloadsToChain([], [commitPayload])

  // Store salt locally — needed for reveal phase
  return { txHash, salt }
}
```

The `$sources` reference is what lets indexers and validators traverse from a commit back to the exact market terms it was made under, without trusting the (mutable) `marketId` string alone.

---

## Phase 3: Reveal Predictions

Once `current >= market.reveal.nbf`, participants reveal. The reveal `$sources` to the *commit* it satisfies — building the commit→reveal chain that the settlement gate later walks:

```ts
async function revealPrediction(
  gateway: XyoGatewayRunner,
  market: MarketPayload,
  commit: MarketCommitPayload,
  prediction: string,
  salt: string,
): Promise<Hash> {
  const commitHash = await PayloadBuilder.dataHash(commit)

  const revealPayload: MarketRevealPayload = asMarketRevealPayload(
    new PayloadBuilder({ schema: MarketRevealSchema })
      .fields({ marketId: market.marketId, prediction, salt })
      .meta({ $sources: [commitHash] })
      .build(),
    true,
  )

  await datalakeRunner.insert([revealPayload])
  const [txHash] = await gateway.addPayloadsToChain([], [revealPayload])
  return txHash
}
```

---

## Phase 4: Settle

After `market.reveal.exp`, an address listed in `market.outcomeAuthorities` settles. Settlement is intentionally a **lean outcome payload + thick BoundWitness** — the authority signs only the *outcome value*; the verified-reveal evidence travels as co-payloads inside the same BW:

```ts
import { BoundWitnessBuilder } from '@xyo-network/sdk-js'

async function settleMarket(
  gateway: XyoGatewayRunner,
  authority: Account,
  market: MarketPayload,
  outcome: string,
  reveals: MarketRevealPayload[],
  commitsByHash: Record<Hash, MarketCommitPayload>,
): Promise<Hash> {
  // Settlement gate: re-verify every reveal against its commit. Never trust the caller.
  const verifiedReveals: MarketRevealPayload[] = []
  for (const reveal of reveals) {
    const [commitHash] = reveal.$sources ?? []
    const commit = commitHash ? commitsByHash[commitHash] : undefined
    if (!commit || commit.marketId !== reveal.marketId) continue

    const expected = await createCommitment(reveal.prediction, reveal.salt)
    if (expected === commit.commitment) verifiedReveals.push(reveal)
  }

  const marketHash = await PayloadBuilder.dataHash(market)

  // The authoritative outcome payload — small, signed, references the market by hash.
  const settlementPayload: MarketSettlementPayload = asMarketSettlementPayload(
    new PayloadBuilder({ schema: MarketSettlementSchema })
      .fields({ marketId: market.marketId, outcome })
      .meta({ $sources: [marketHash] })
      .build(),
    true,
  )

  // The BW co-payloads carry the verified reveals — the *evidence* the
  // outcome was settled against. Reading the BW gives anyone everything
  // they need to re-derive winners locally.
  const [bw, payloads] = await new BoundWitnessBuilder()
    .signer(authority)
    .payloads([settlementPayload, ...verifiedReveals])
    .build()

  await datalakeRunner.insert([bw, ...payloads])
  const [txHash] = await gateway.addPayloadsToChain([], [bw, ...payloads])
  return txHash
}
```

**Why the BW carries reveals as co-payloads:** with this shape, an indexer or UI does not need to query for reveals separately at settlement time — the settlement BW is self-contained evidence. The `addresses` field on the BW also proves *which authority* signed the outcome, which the validation gate then checks against `market.outcomeAuthorities`.

### Deriving winners (and losers)

Winners and losers are not stored on the settlement payload — they are a **pure function** of the outcome and the verified reveals embedded in the BW. Compute them where you need them:

```ts
function deriveWinners(
  settlement: MarketSettlementPayload,
  bw: BoundWitness,
  payloads: Payload[],
): { winners: Address[]; losers: Address[] } {
  // The reveals included in the settlement BW are, by construction, the verified set.
  const verifiedReveals = payloads.filter(isMarketRevealPayload)

  // Map each reveal to the address that signed its commit.
  // (See "Binding Commits to Identity" in commit-reveal.md — the commit signer
  //  is the participant of record. Resolve via the commit's TransactionBoundWitness.)
  const winners: Address[] = []
  const losers: Address[] = []
  for (const reveal of verifiedReveals) {
    const participant = participantFor(reveal)  // app-specific resolver
    if (reveal.prediction === settlement.outcome) winners.push(participant)
    else losers.push(participant)
  }
  return { winners, losers }
}
```

### Optional: publishing a `MarketResultsView` cache

For markets with many participants, an indexer or the settler may publish a non-authoritative `MarketResultsViewPayload` to amortize derivation. **The view is a cache, never the source of truth** — any consumer should be able to recompute it from the settlement BW alone.

```ts
async function publishResultsView(
  gateway: XyoGatewayRunner,
  settlement: MarketSettlementPayload,
  settlementBw: BoundWitness,
  payloads: Payload[],
): Promise<Hash> {
  const settlementHash = await PayloadBuilder.dataHash(settlement)
  const { winners, losers } = deriveWinners(settlement, settlementBw, payloads)

  const view: MarketResultsViewPayload = asMarketResultsViewPayload(
    new PayloadBuilder({ schema: MarketResultsViewSchema })
      .fields({
        marketId: settlement.marketId,
        settlement: settlementHash,
        winners,
        losers,
      })
      .meta({ $sources: [settlementHash] })
      .build(),
    true,
  )

  await datalakeRunner.insert([view])
  const [txHash] = await gateway.addPayloadsToChain([], [view])
  return txHash
}
```

UIs that consume the view **must** treat it as advisory. If `view.settlement` does not match the hash of the actual settlement payload, or if a consumer's local derivation disagrees with the view, the settlement BW wins.

---

## Querying Market State

Use the [Chain Data Indexing](chain-data-indexing-protocol.md) pattern to reconstruct market state from on-chain payloads. Group by `marketId` to build a complete view. The filters below use the Zod-factory guards exported earlier in this skill — `isMarketCommitPayload`, `isMarketRevealPayload`, `isMarketSettlementPayload` — which validate schema name *and* shape on every chain read.

```ts
interface MarketState {
  market: MarketPayload
  commits: MarketCommitPayload[]
  reveals: MarketRevealPayload[]
  settlement?: MarketSettlementPayload
  phase: 'pending' | 'commit' | 'reveal' | 'settled' | 'expired'
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
    : currentBlock >= market.reveal.exp
      ? 'expired'
      : currentBlock >= market.reveal.nbf
        ? 'reveal'
        : currentBlock >= market.commit.nbf
          ? 'commit'
          : 'pending'

  return { market, commits, reveals, settlement, phase }
}
```

The `pending` phase covers the (usually short) window before `commit.nbf` — the market exists on-chain but is not yet open for commits. UIs typically render this as "Starts at block N".

---

## React Integration

Use [In-Page Data Lakes](in-page-datalakes.md) so visitors can browse markets without connecting a wallet. Gate commit/reveal actions behind wallet connection. The parent app must use `GatewayProvider` (with `InPageGatewaysProvider` ancestor) — not `WalletGatewayProvider` — for read-only browsing to work without a wallet:

```tsx
import { useProvidedGateway } from '@xyo-network/xl1-react-client-sdk'
import { StorageArchivist, StorageArchivistConfigSchema } from '@xyo-network/archivist-storage'

function MarketPage({ marketId }: { marketId: string }) {
  const { defaultGateway } = useProvidedGateway()
  const [market, setMarket] = useState<MarketState>()
  const [address, setAddress] = useState<string>()
  const [secretStore, setSecretStore] = useState<StorageArchivist>()

  const canWrite = defaultGateway && 'addPayloadsToChain' in defaultGateway

  // Create a StorageArchivist for persisting commit-reveal secrets (salts, choices).
  // Namespace-scoped to this market so secrets don't collide across markets.
  useEffect(() => {
    StorageArchivist.create({
      account: 'random',
      config: {
        schema: StorageArchivistConfigSchema,
        type: 'local',
        namespace: `market-secrets-${marketId}`,
      },
    }).then(setSecretStore)
  }, [marketId])

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

      <ConnectAccountsStack onAccountConnected={setAddress} />

      {canWrite && address && market.phase === 'commit' && (
        <CommitForm
          market={market.market}
          gateway={defaultGateway}
          secretStore={secretStore}
        />
      )}

      {canWrite && address && market.phase === 'reveal' && (
        <RevealForm
          market={market.market}
          gateway={defaultGateway}
          secretStore={secretStore}
        />
      )}
    </div>
  )
}
```

---

## Lifecycle Summary

| Phase | Who Acts | On-Chain Payload | Validity Window | Wallet Required |
|-------|----------|------------------|-----------------|-----------------|
| Create | Market creator | `MarketPayload` | — | Yes |
| Commit | Each participant | `MarketCommitPayload` (`$sources: [marketHash]`) | `[market.commit.nbf, market.commit.exp)` | Yes |
| Reveal | Each participant | `MarketRevealPayload` (`$sources: [commitHash]`) | `[market.reveal.nbf, market.reveal.exp)` | Yes |
| Settle | An address in `outcomeAuthorities` | `MarketSettlementPayload` co-signed in BW with verified reveals | `current >= market.reveal.exp` | Yes |
| (cache) | Indexer or settler | `MarketResultsViewPayload` (advisory) | After settlement | Optional |
| Browse | Anyone | _(read only)_ | Any | No |

---

## Adapting This Pattern

This recipe is intentionally generic. To adapt it to a specific application:

| Application | Options | Outcome Source | `outcomeAuthorities` |
|-------------|---------|----------------|----------------------|
| Rock Paper Scissors | `['rock', 'paper', 'scissors']` | Deterministic from both players' reveals | Either player or game host — signature only attests "game completed" |
| Binary Prediction | `['yes', 'no']` | Oracle or external data feed | Oracle address(es) |
| Multi-choice Vote | `['option-a', 'option-b', ...]` | Tally from all reveals | Vote moderator (signs the announced winner) |
| Sealed-bid Auction | Bid amounts as strings | Highest valid reveal wins | Auctioneer — signature attests "auction closed" |

The schema namespace, validity windows, and authority list change — the commit-reveal structure and on-chain recording pattern stay the same.

---

## When to Introduce a Sentinel

This recipe is dApp-shaped: every transition is signed by a participant or authority directly from the browser (or a Node script), and the chain is the integration point. There is no server-side module managing state.

If your application instead needs a **neutral, always-on attesting party** — for example, a multi-tenant escrow service, a payment-mediated registrar, or a flow where the protocol must hold custody of an artifact between commit and release — that is the shape XYO's [Sentinel](../xyo-knowledge/modules.md) module covers. The XYO/XNS escrow flow is the canonical example: an `EscrowSentinel` runs server-side, signs every state transition with its own account, and gates settlement on multi-party signature evidence. If you build one, derive the operator identity through the canonical seed-phrase pattern in [XL1 Identity & Wallets](../xl1-knowledge/identity.md) and wrap it via `buildSimpleXyoSignerV2` (see [Node Gateway](../xl1-knowledge/gateway-node.md)) so the operator address is reproducible across restarts and inspectable in MetaMask.

For a dApp, the Sentinel pattern is overkill and conflicts with "the chain is the source of truth." Reach for it only when an off-chain notary is genuinely required.

For two-or-more party atomic exchanges (where settlement requires *both* sides to have committed and revealed before either side gets the asset), see the [Atomic Exchange](atomic-exchange.md) pattern — it's the dApp-shaped projection of the same escrow shape.
