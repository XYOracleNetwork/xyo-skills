# Atomic Exchange

Read this pattern when two or more parties need to exchange assets (or a payment for an asset) **atomically** — neither side gets what they want unless every side has irreversibly committed. Classic examples: an asset-for-payment purchase, a swap of two on-chain artifacts, a multi-signer release of a held resource.

This is the dApp-shaped projection of the multi-party escrow flow used in the XYO/XNS registrar. The full escrow flow uses a server-side [Sentinel](../xyo-knowledge/modules.md) module to mediate; this pattern shows how to achieve the same atomic-exchange guarantees on XL1 with the chain as the only integration point.

**Builds on:**
- [Commit-Reveal Primitive](commit-reveal.md) — each party's secret commit is one half of the proof
- [Protocol Primitives — Multi-Signer BoundWitnesses](../xyo-knowledge/primitives.md#multi-signer-co-witnessed-boundwitnesses) — joint signatures and authority verification
- [Chain Data Indexing](chain-data-indexing-protocol.md) — schema-based reads of exchange state
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `addPayloadsToChain` for transaction submission via the wallet

---

## Why a separate pattern

Commit-reveal alone gives **fairness** for symmetric games (RPS, sealed-bid auctions): the loser of the protocol simply forfeits and the winner takes their share.

Atomic exchange is different. The setup is asymmetric — *one side has an asset, the other side has payment* — and "you forfeit, I take all" is exactly the failure mode it must prevent. If the buyer commits but the seller never signs, the buyer's payment must not be released. If the seller commits but the buyer never reveals, the asset must remain with the seller.

The structural rule: **settlement only proceeds when every required party has signed their secret reveal.** Missing reveals do not forfeit; they prevent settlement entirely.

---

## Concepts

### Terms

A single immutable payload (`ExchangeTerms`) declaring:
- The set of parties involved (one or more addresses per party)
- The hashed secret each party will reveal at settlement
- The asset(s) being exchanged
- The authority addresses authorized to sign appraisals, receipts, or outcomes
- The validity window (`nbf`/`exp`)

Both (or all) parties co-sign the terms in a single `BoundWitnessBuilder().signers([...]).payload(terms)` call — see [Multi-Signer BoundWitnesses](../xyo-knowledge/primitives.md#multi-signer-co-witnessed-boundwitnesses). The co-signed terms BW is the entry point of the exchange.

### Party secrets

Each party generates a random secret payload, hashes it, and that hash is recorded in `ExchangeTerms`. The plaintext secret is held privately until settlement. At settlement, the party reveals their secret and **all of that party's listed addresses must co-sign the reveal** — proving the party has irrevocably committed to releasing their side of the exchange.

This is the same shape as commit-reveal, but used as a *gating mechanism for asset release* rather than a hidden-choice protocol. The secret's content is irrelevant — its *signed reveal* is the proof.

### Authorities

Some exchanges depend on third-party attestations:
- **Appraisal authority** signs a price/value claim on the asset
- **Payment authority** signs a receipt confirming payment was received
- **Outcome authority** signs the final outcome (analogous to the `outcomeAuthorities` in [prediction markets](commit-reveal-prediction-markets.md#phase-1-create-market))

Each authority's signature is verified with `addressesContainsAny(bw, market.<...>Authorities)` — any one signer in the configured list suffices.

### Outcome

A lean payload — just `{ outcome: 'fulfilled' | 'rejected', terms: <hash> }` — wrapped in a BW co-signed by every required party. The supporting evidence (the secret reveals, the authority attestations) lives as co-payloads in the same BW. See the same lean-outcome shape used in [prediction markets settlement](commit-reveal-prediction-markets.md#phase-4-settle).

---

## Schema Design

The `network.xyo.exchange.*` namespace is a canonical XYO Foundation–blessed protocol, reserved in `network.xyo.*` pending migration into the SDK. Use these schema names verbatim when participating in the protocol; application schemas you author on top still belong under your own `com.<your-org>.<app>.*` namespace (see [Schema Naming](../xyo-knowledge/best-practices.md#schema-naming)).

```ts
import { asSchema, PayloadBuilder } from '@xyo-network/sdk-js'
import { BlockDurationZod } from '@xyo-network/xl1-sdk'
import { zodIsFactory, zodAsFactory, zodToFactory } from '@xylabs/sdk-js'
import { z } from 'zod'

// --- Party-secret commitment (the hash recorded in terms) ---

export const PartySecretRevealSchema = asSchema('network.xyo.exchange.party-secret', true)

export const PartySecretRevealPayloadZod = z.object({
  schema: z.literal('network.xyo.exchange.party-secret'),
  /** Random opaque value — the bytes don't matter, only that the party signed them */
  nonce: z.string(),
})

export type PartySecretRevealPayload = z.infer<typeof PartySecretRevealPayloadZod>
export const isPartySecretRevealPayload = zodIsFactory(PartySecretRevealPayloadZod)

// --- Exchange terms ---

export const ExchangeTermsSchema = asSchema('network.xyo.exchange.terms', true)

export const ExchangeTermsPayloadZod = z.object({
  schema: z.literal('network.xyo.exchange.terms'),
  /** Stable identifier for this exchange */
  exchangeId: z.string(),
  /**
   * Each party is a *set* of addresses (most parties have one wallet, but a
   * multi-sig org might have several). All addresses in the set must sign
   * the party's secret reveal at settlement.
   */
  parties: z.array(z.array(z.string())).min(2),
  /** One hash per party — `dataHash(PartySecretRevealPayload)` for that party's secret */
  partySecrets: z.array(z.string()),
  /** Hashes of the asset payload(s) being exchanged */
  assets: z.array(z.string()),
  /** Optional — addresses whose signature on appraisal/receipt payloads is accepted */
  appraisalAuthorities: z.array(z.string()).optional(),
  paymentAuthorities: z.array(z.string()).optional(),
  /** Settlement validity window — same convention as TransactionBoundWitness */
  ...BlockDurationZod.shape,
})

export type ExchangeTermsPayload = z.infer<typeof ExchangeTermsPayloadZod>
export const isExchangeTermsPayload = zodIsFactory(ExchangeTermsPayloadZod)

// --- Lean outcome ---

export const ExchangeOutcomeSchema = asSchema('network.xyo.exchange.outcome', true)

export const ExchangeOutcomePayloadZod = z.object({
  schema: z.literal('network.xyo.exchange.outcome'),
  /** Hash of the ExchangeTermsPayload this outcome settles */
  terms: z.string(),
  outcome: z.enum(['fulfilled', 'rejected']),
})

export type ExchangeOutcomePayload = z.infer<typeof ExchangeOutcomePayloadZod>
export const isExchangeOutcomePayload = zodIsFactory(ExchangeOutcomePayloadZod)
```

The `ExchangeTermsPayload` deliberately spreads `BlockDurationZod.shape` — `nbf`/`exp` appear at the top level of the terms payload, just as they do on `TransactionBoundWitness`. Keep the convention identical so consumers can use the same window-state checks.

---

## Validation Gates

Three gates, each with a single responsibility. The settlement gate re-runs the entry gate; never trust that the caller already validated upstream.

| Gate | Runs at | Checks |
|------|---------|--------|
| **Entry** | Before signing `ExchangeTerms` | `parties.length >= 2`; `partySecrets.length === parties.length`; `assets.length >= 1`; valid `nbf`/`exp`; current block ∈ `[nbf, exp)` |
| **Authority** | Before counting an appraisal/receipt | The authority payload's wrapping BW is signed by an address in the relevant `*Authorities` list (use `addressesContainsAny`) |
| **Settlement** | Before signing `ExchangeOutcome` | Re-run entry gate; for every party `i`, locate a BW where (a) all addresses in `parties[i]` signed (`addressesContainsAll`), and (b) the BW's payloads include the secret whose hash equals `partySecrets[i]`; `current < exp` |

---

## Lifecycle

```
PROPOSE ──► COUNTERSIGN ──► AUTHORITY ATTEST (optional) ──► REVEAL & SETTLE
   │             │                    │                            │
   ▼             ▼                    ▼                            ▼
 Party A      Party B            Appraisers /              All parties co-sign
 drafts       co-signs           Payment provider          their secret reveals;
 terms        terms BW           sign attestations         Outcome BW emitted
```

### Phase 1: Propose

Party A drafts `ExchangeTermsPayload` with their `partySecrets[A]` filled in (the hash of their generated nonce). The other parties' entries are placeholders the counterparty will fill. Party A signs the draft terms in a single-signer BW and shares it off-chain (link, QR, message).

### Phase 2: Counter-sign

Party B verifies the terms, generates their own party secret, fills in `partySecrets[B]`, and emits a **co-signed** BW:

```ts
import { BoundWitnessBuilder } from '@xyo-network/sdk-js'

const [termsBw, payloads] = await new BoundWitnessBuilder()
  .signers([accountA, accountB])
  .payload(termsWithBothSecrets)
  .build()
```

This is the canonical "exchange opened" event. `addressesContainsAll(termsBw, [...partyAAddresses, ...partyBAddresses])` is the entry-gate check any consumer can run on this BW.

### Phase 3: Authority attestation (optional)

If the exchange depends on appraisals or payment receipts, the relevant authority signs a payload (e.g. `network.xyo.exchange.appraisal`, `network.xyo.exchange.receipt`) referencing the terms by hash and is included in the supporting evidence.

The authority gate validates each attestation: `addressesContainsAny(attestationBw, terms.appraisalAuthorities)` (or `paymentAuthorities`). Any one address in the list suffices.

### Phase 4: Reveal and settle

Each party reveals their secret. Crucially, the reveal must be **co-signed by all addresses in that party's set** — so a multi-sig party cannot have one signer release the secret unilaterally:

```ts
// Each party emits one of these (they can be in the same BW or separate BWs)
const [revealBw, revealPayloads] = await new BoundWitnessBuilder()
  .signers(partyAAccounts)         // all addresses in parties[A]
  .payload(partyASecretReveal)     // dataHash matches terms.partySecrets[A]
  .build()
```

Once every party's reveal BW exists, any party (or an indexer) can emit the settlement:

```ts
const outcome: ExchangeOutcomePayload = asExchangeOutcomePayload(
  new PayloadBuilder({ schema: ExchangeOutcomeSchema })
    .fields({ terms: termsHash, outcome: 'fulfilled' })
    .meta({ $sources: [termsHash] })
    .build(),
  true,
)

const [settlementBw, settlementPayloads] = await new BoundWitnessBuilder()
  .signers([...allPartyAccounts])
  .payloads([
    outcome,
    ...partySecretReveals,         // co-payloads: the actual revealed secrets
    ...authorityAttestations,      // co-payloads: appraisals, receipts
  ])
  .build()

await datalakeRunner.insert([settlementBw, ...settlementPayloads])
await gateway.addPayloadsToChain([], [settlementBw, ...settlementPayloads])
```

### Rejection

If `current >= exp` and not every party has revealed, the exchange is implicitly rejected — no settlement BW will ever validate. Any party may explicitly emit a `rejected` outcome (signed only by themselves) to mark the exchange closed for indexer convenience, but the absence of a `fulfilled` outcome before `exp` is sufficient evidence that the exchange did not happen.

---

## Verifying an Exchange

A consumer (an indexer, a UI, a counter-party) walks the audit DAG:

```ts
import { addressesContainsAll, addressesContainsAny } from '@xyo-network/boundwitness-validator'

async function isExchangeFulfilled(
  outcome: ExchangeOutcomePayload,
  outcomeBw: BoundWitness,
  terms: ExchangeTermsPayload,
  attestations: { bw: BoundWitness; payload: Payload }[],
): Promise<boolean> {
  if (outcome.outcome !== 'fulfilled') return false
  if (outcome.terms !== await PayloadBuilder.dataHash(terms)) return false

  // Every party must have signed the outcome BW
  for (const party of terms.parties) {
    if (!addressesContainsAll(outcomeBw, party)) return false
  }

  // Every party's secret hash must appear as a co-payload in the outcome BW
  // (settlement bundles the reveals — see Phase 4)
  for (const secretHash of terms.partySecrets) {
    if (!outcomeBw.payload_hashes.includes(secretHash)) return false
  }

  // Authority attestations, if required, must be signed by an authority of the right kind
  if (terms.appraisalAuthorities?.length) {
    const appraisalBws = attestations.filter(a => isAppraisal(a.payload))
    if (!appraisalBws.some(a => addressesContainsAny(a.bw, terms.appraisalAuthorities!))) return false
  }

  return true
}
```

The check is local and deterministic — every input is on-chain (or in the datalake referenced by on-chain hash). No trusted third party needed at verification time.

---

## Atomic-exchange vs. symmetric commit-reveal

| | **Symmetric commit-reveal** ([prediction markets](commit-reveal-prediction-markets.md)) | **Atomic exchange** (this pattern) |
|---|---|---|
| What is committed | A hidden *choice* (rock/paper/scissors, a bid) | A *party secret* gating asset release |
| Failure mode | Missing reveal → forfeit; opponent wins | Missing reveal → no settlement; nobody gets anything |
| Settlement requires | The outcome value + verified reveals | All parties' co-signed reveals + (optional) authority attestations |
| Authority shape | One address signs the outcome value | Per-purpose lists (appraisal, payment, outcome) |
| BW signer cardinality | One participant per phase | Multi-signer BWs throughout |

If a project oscillates between these (e.g. "swap if fair, otherwise game"), pick one shape and commit to it. Mixing them produces brittle gates.

---

## Anti-patterns

| Anti-pattern | Why it fails | Do this instead |
|---|---|---|
| Treating a missing reveal as forfeit (releasing the asset to the revealer) | Inverts the safety property of atomic exchange — turns it into "first to commit wins" | Settlement requires *all* reveals; missing reveal → exchange does not settle |
| Storing the party-secret plaintext in `ExchangeTerms` | Anyone can pre-compute the reveal; settlement is no longer gated on the party | Store only `dataHash(secretPayload)`; reveal at settlement time |
| Letting one address from a multi-sig party reveal alone | Defeats the multi-sig requirement | Use `addressesContainsAll` against the full party set; require co-signed reveal BWs |
| Using `addressesContainsAny` for party reveals | A single party member can release the secret unilaterally | Use `addressesContainsAll` for parties; reserve `addressesContainsAny` for authority lists |
| Embedding winners/asset-recipients inside `ExchangeOutcome` | Authority gains discretion to omit a party | Keep the outcome lean (`fulfilled` / `rejected`); recipients are derivable from `parties` and `assets` |
| Skipping the entry-gate re-run inside the settlement gate | Caller-supplied state may have drifted; bypasses validation | Always re-run the entry gate inside the settlement gate |
