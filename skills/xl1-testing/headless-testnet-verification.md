# Headless Testnet Verification

Read this when you need to prove that a dApp's chain interactions work end-to-end against a live (test)network — without launching a browser or driving the wallet extension. It signs with a seed-phrase-derived signer **in-process** (Node + `GatewayBuilder.build(signer)`) and asserts on-chain outcomes. The verification mode of choice for agentic development, CI smoke tests, and regression scripts.

This is one of several headless verification approaches under [xl1-testing](SKILL.md); it is the **network / testnet** variant (in-process signer against `sequence` or `local`). For an external, unattended CLI-wallet actor on Sequence, see [Unattended Sequence via CLI wallet](sequence-cli-wallet.md).

**Builds on:**
- [Node Gateway](../xl1-knowledge/gateway-node.md) — `GatewayBuilder` and the seed-phrase signer
- [XL1 Identity & Wallets](../xl1-knowledge/identity.md) — canonical `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')` derivation, then `buildSimpleXyoSignerV2` to produce a runner-compatible signer
- [Gateway](../xl1-knowledge/gateway.md) — viewer API, transaction methods, capability detection

---

## The Ethos

A dApp's UX may live in the browser — wallet popups, React components, gateway providers — but its **on-chain behavior does not depend on any of that**. The chain doesn't care whether a transaction was signed by the Chrome extension or by a Node process holding the same seed. Both paths submit the same `TransactionBoundWitness` to the same gateway RPC.

That symmetry is the verification surface:

> Anything a connected browser user can do, a headless Node script holding the same seed can do too.

Build the dApp the way users will use it (browser wallet, React, providers). Verify it the way agents and CI can drive it (Node + `GatewayBuilder.build(signer)` + a seed phrase from `.env`). When both paths produce the same on-chain outcome, you have high-confidence verification without the operational cost of a headless browser.

---

## When to Use

- **Agent-driven development** — an agent building a dApp can run the same end-to-end flow it expects users to run, without needing browser automation or a manually-installed extension.
- **CI smoke tests** — assert that a deployment can submit and read back at least one transaction per release.
- **Regression scripts** — replay a known-good user flow against a new build before promoting it.
- **Multi-account scenarios** — verify atomic exchanges, commit-reveal pairs, or other multi-party flows by deriving multiple accounts from the same seed (or different seeds) and orchestrating them deterministically from one process.

The pattern complements browser testing — it does not replace user-facing UX validation. A passing headless run says "the chain side works"; it does not say "the UI works".

---

## Prompt Shape

Agents recognize this pattern from prompts of the form:

> Given the `.env` file in this empty repository which holds a seed phrase for a wallet with Sequence XL1 in accounts 0 and 1, build me a [dApp] …

The cues:

- An `.env` file with a seed phrase is the signal that headless verification is expected.
- A note about which **accounts** (indices) hold funds tells the agent how to derive signers.
- The network (mainnet / sequence / local) tells the agent which `DefaultNetworks` entry to point at.

The agent should: (1) build the dApp normally, with browser wallet wiring intact; (2) write a Node verification script that exercises the full happy path through `GatewayBuilder.build(signer)`; (3) run that script to prove the dApp works before reporting completion.

---

## Setup

### 1. Configure environment

```sh
# .env
XL1_NETWORK=sequence
XL1_SEED_PHRASE="word1 word2 ... word12"
```

Treat the seed phrase like any other secret — never commit, never log, never echo. Load with `dotenv/config` at the very top of the script.

### 2. Derive accounts and wrap them as signers

`GatewayBuilder.build(signer)` requires an `XyoSigner`. The seed-phrase derivation produces an `AccountInstance` per index — wrap each one with `buildSimpleXyoSignerV2` to get a signer the runner accepts.

```ts
import 'dotenv/config'

import {
  buildSimpleXyoSignerV2, DefaultNetworks, GatewayBuilder, NetworkDataLakeUrls,
} from '@xyo-network/xl1-sdk'
import { ConfigZod, generateXyoBaseWalletFromPhrase } from '@xyo-network/xl1-sdk/protocol-sdk'
import { type XyoGatewayRunner } from '@xyo-network/xl1-protocol/protocol-lib'

const id = process.env.XL1_NETWORK ?? 'sequence'
const network = DefaultNetworks.find((n) => n.id === id)
if (!network) throw new Error(`Unknown network "${id}"`)

const baseWallet = await generateXyoBaseWalletFromPhrase(process.env.XL1_SEED_PHRASE!)
const context = { config: ConfigZod.parse({}), caches: {}, singletons: {} }

// Account 0 — primary actor (m/44'/60'/0'/0/0)
const player1Account = await baseWallet.derivePath('0')
const player1Signer = await buildSimpleXyoSignerV2(context, player1Account)

// Account 1 — counterparty (m/44'/60'/0'/0/1)
const player2Account = await baseWallet.derivePath('1')
const player2Signer = await buildSimpleXyoSignerV2(context, player2Account)
```

`derivePath` takes a *bare account index string* relative to the base wallet's path — `generateXyoBaseWalletFromPhrase` has already applied `DEFAULT_WALLET_PATH` (`m/44'/60'/0'/0`) internally. These addresses match what MetaMask and the XYO browser extension show for accounts 1 and 2 on the same seed. That alignment is the whole point — the headless run is provably the same identity a browser user would hold.

### 3. Build a runner per signer

Each signer needs its own `GatewayBuilder.build(signer)` call. Cache them with the lazy-promise pattern from [Node Gateway — Caching](../xl1-knowledge/gateway-node.md#caching) if the script reuses them across phases.

```ts
const runner1: XyoGatewayRunner = await new GatewayBuilder()
  .name(`${id}-player1`)
  .rpcUrl(`${network.url}/rpc`)
  .dataLakeEndpoint(NetworkDataLakeUrls[id])
  .build(player1Signer)

const runner2: XyoGatewayRunner = await new GatewayBuilder()
  .name(`${id}-player2`)
  .rpcUrl(`${network.url}/rpc`)
  .dataLakeEndpoint(NetworkDataLakeUrls[id])
  .build(player2Signer)
```

Use distinct `.name()` values so logs and traces can tell the actors apart. The same `context` object can be reused across `buildSimpleXyoSignerV2` calls — it carries no per-account state.

---

## Verification Script Shape

A headless verification script is a deterministic happy-path replay of one user flow. Keep it linear and explicit — assertions over abstractions.

```ts
import type { BrandedHash } from '@xylabs/sdk-js'

// 1. Pre-flight: confirm both accounts have balance
const balance1 = await runner1.connection.viewer?.account.balance.accountBalance(player1Account.address)
if (!balance1 || balance1 === 0n) throw new Error('player1 has no XL1 — fund the account first')

// 2. Submit the dApp's actual on-chain action through the same code path the UI uses.
//    Import the dApp's domain functions — do not rebuild logic in the script.
const [txHash] = await submitMove(runner1, { game: 'rps', choice: 'rock', salt }) as [BrandedHash, unknown]

// 3. Wait for inclusion. The default poll budget can time out before Sequence finalizes;
//    pass explicit options when the network's block cadence is slower than local devnet.
const confirmed = await runner1.confirmSubmittedTransaction(txHash, { attempts: 30, delay: 10_000 })

// 4. Read back through the viewer to verify shape
const tx = await runner1.connection.viewer?.transaction.byHash(txHash)
if (!tx) throw new Error('transaction not found after confirmation')

// 5. If the flow is multi-party, drive the counterparty through runner2 and assert outcome
```

`runner.addPayloadsToChain` returns `[BrandedHash, SignedHydratedTransactionWithHashMeta]`. Use the `BrandedHash` type from `@xylabs/sdk-js` for the txHash variable so downstream `viewer.transaction.byHash` calls type-check.

**Import the dApp's own functions.** A verification script that re-implements payload construction or transaction submission proves nothing — it only proves the script works. The script is valuable because it exercises *the same code* the UI calls. Domain functions (`submitMove`, `revealMove`, `settleGame`, etc.) should accept a runner as a parameter so they work in both contexts. Use `asSchema('your.app.schema', true)` from `@xyo-network/sdk-js` when constructing payload schemas — raw string literals bypass the schema validator.

---

## Verifying Derived State Through the Service

The script in the previous section proves the chain accepted the transaction and that `connection.viewer` can read it back. That is the **chain edge** of the dApp. If the UI reads from a service (indexer REST API, GraphQL endpoint, WebSocket subscription) rather than calling `connection.viewer` directly, the chain edge is *not* the user-facing surface. The verification script must round-trip through the service too, or the path the user actually exercises remains untested.

**The escape hatch this section forbids.** When the indexer's API returns empty for state you know is on chain, **do not** reach for `viewer.block.payloadsByHash([appPayloadHash])` to confirm "the data is really there" and call verification done. That synthesizes the indexer's output from chain primitives the indexer also has access to — it proves the agent can do the indexer's job, not that the indexer is doing it. The whole point of the service round-trip is to exercise the path the UI takes. Bypassing it via direct hash lookups defeats the purpose.

### The two-gate poll

After `confirmSubmittedTransaction` returns, two watermarks must **both** advance past the tx's block before the service is expected to surface the data:

1. **Chain availability gate** — `viewer.finalization.headNumber() >= blockContaining(txHash)`. The data is finalized on chain.
2. **Indexer progress gate** — `indexer.lastIndexedBlock >= blockContaining(txHash)`. The indexer has walked past that block. Read this from the indexer's [progress endpoint](../xl1-patterns/chain-data-indexing-service.md#progress-endpoint).

Once both gates pass, hit the application surface (e.g., `GET /api/games/:id`). If it returns the expected state, verification passes. If it doesn't, the indexer is **buggy, not behind** — and the verify script must fail loudly.

```ts
async function awaitIndexed(blockOfTx: number, timeoutMs = 5 * 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const finalizedHead = Number(await runner.connection.viewer!.finalization.headNumber())
    const status = await fetch('http://localhost:3001/api/indexer/status').then(r => r.json())
    if (finalizedHead >= blockOfTx && status.lastIndexedBlock >= blockOfTx) return
    await new Promise(r => setTimeout(r, 10_000))
  }
  throw new Error(
    `Watermarks did not advance past block ${blockOfTx} within ${timeoutMs}ms ` +
    `— either the chain or the indexer is stuck`,
  )
}

// After submission + confirmation:
await awaitIndexed(blockOfTx)

// Now assert the application surface — the path the UI exercises
const game = await fetch(`http://localhost:3001/api/games/${gameId}`).then(r => r.json())
if (!game) {
  throw new Error(
    `Both watermarks past block ${blockOfTx} but service returned empty for game ${gameId} ` +
    `— this is an indexer bug, not finalization lag`,
  )
}
```

The 5-minute budget mirrors `confirmSubmittedTransaction`'s Sequence-tuned shape (30 × 10s); for local devnets, drop to ~30 seconds. The polling loop **fails on timeout** — silently passing because "the indexer might catch up later" is the bug class this section exists to prevent.

### What this requires of the indexer

The two-gate poll only works if the indexer service exposes `lastIndexedBlock` programmatically. Every indexer service must expose a [progress endpoint](../xl1-patterns/chain-data-indexing-service.md#progress-endpoint) — that requirement is not a debugging affordance, it is part of the indexer service contract. Without it, the verify script cannot distinguish "indexer still working" from "indexer broken," and the agent will fall back to rationalizing the empty result as network slowness.

---

## Cross-Environment Identity Guarantee

Because the script derives via `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')` (and wraps with `buildSimpleXyoSignerV2`), the signing identity is bit-for-bit the identity a browser user would have after importing the same seed into the XYO Chrome wallet or MetaMask. After construction, `await runner.signer.address()` will equal `account.address` — that equality is the contract being verified. Implications:

- A developer can fund the seed in MetaMask, then a CI script using the same seed can submit transactions from those funded accounts. No address mismatch, no separate funding step.
- An agent can set up the seed once in `.env`, exercise the dApp headlessly, then hand the seed to a human reviewer who imports it into the browser wallet and continues from the same state.
- Multi-account flows derived in the script (`derivePath('1')`, `derivePath('2')`, …) match accounts 2, 3, … in MetaMask on the same seed.

If addresses do not line up, the script bypassed the canonical helpers — the failure is in the script, not the chain. See [Identity & Wallets — Anti-Patterns](../xl1-knowledge/identity.md#anti-patterns).

---

## Anti-Patterns

| Anti-Pattern | Why it fails | Do this instead |
|---|---|---|
| Re-implementing transaction logic inside the verification script | Verifies the script, not the dApp — false confidence | Import the dApp's domain functions; pass the runner in |
| `Account.create({ mnemonic })` for the headless signer | Produces an address that won't match MetaMask / XYO extension on the same seed | Use `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')` + `buildSimpleXyoSignerV2` |
| Passing `DEFAULT_WALLET_PATH` (or any full BIP44 path string) to `derivePath()` | `generateXyoBaseWalletFromPhrase` already roots the wallet at that path; passing it again double-derives | Pass a bare account index string: `'0'`, `'1'`, `'2'`, … |
| Passing the `AccountInstance` from `derivePath()` directly to `.build(signer)` | `AccountInstance` is not an `XyoSigner` — the call will fail or produce a runner that can't sign | Wrap with `buildSimpleXyoSignerV2(context, account)` first |
| Generating a fresh random wallet at script start | Identity changes every run; impossible to fund or reproduce | Load seed from `.env` and derive deterministically |
| Logging or committing the seed phrase | Catastrophic if the repo or CI logs are exposed | Treat the seed like any other secret; load via `dotenv/config`; never `console.log` |
| Building one runner and pretending it represents both parties | Multi-party flows (commit-reveal, atomic exchange) need distinct signers to be meaningful | Derive each party from a different index; build a runner per signer |
| Skipping the read-back step after submission | Confirms the chain accepted the tx, not that the data is queryable as the UI expects | Always round-trip via `connection.viewer` to assert the shape the UI will read |
| Reporting "verified" when only `connection.viewer` was exercised but the UI reads from a service | The chain edge passes; the user-facing flow is untested. Indexer bugs that drop or mis-derive payloads slip through | Round-trip through the service surface the UI uses — see [Verifying Derived State Through the Service](#verifying-derived-state-through-the-service). Do not skip the indexer step just because `viewer.transaction.byHash` returns the data |
| Confirming "the indexer just hasn't caught up" by reaching into the chain to fetch the payload manually | Synthesizes derived state from primitives the indexer also has access to — proves the agent can do the indexer's job, not that the indexer is doing it. "Sequence is slow" becomes a free pass | Wait for the two-gate poll (`finalization.headNumber()` AND `indexer.lastIndexedBlock` both past the tx block), then assert the service surface. If both gates pass and the service is empty, fail loudly — that is an indexer bug |
| Pointing the script at `mainnet` for routine verification | Real funds, real chain pressure | Default to `sequence` in `.env`; require an explicit override for mainnet runs |
| Calling `confirmSubmittedTransaction(txHash)` with no options on Sequence | Defaults are `attempts: 20`, `delay: 1_000` — a 20-second total budget. Sequence finalization regularly takes minutes, so the call rejects before the block lands | Pass `{ attempts: 30, delay: 10_000 }` (the verified-working baseline) or tune for your network's cadence |

---

## Cross-References

- [Node Gateway](../xl1-knowledge/gateway-node.md) — `GatewayBuilder` API, caching, advanced locator escape hatch
- [XL1 Identity & Wallets](../xl1-knowledge/identity.md) — canonical seed-phrase derivation and the cross-environment guarantee
- [Gateway — Submitting Transactions](../xl1-knowledge/gateway.md#submitting-transactions) — `addPayloadsToChain`, `send`, `confirmSubmittedTransaction`
- [Gateway — Reading Chain State](../xl1-knowledge/gateway.md#reading-chain-state) — viewer sub-viewers used for read-back assertions
- [dApp Definition of Done](../xl1-patterns/dapp-checklist.md) — broader completion checklist this verification step plugs into
- [Unattended Sequence via CLI wallet](sequence-cli-wallet.md) — the alternative: an external, keychain-backed `xl1-wallet` CLI actor for unattended Sequence-testnet runs (vs. this in-process seed-phrase signer)
- [xl1-testing](SKILL.md) — the testing barrel this approach belongs to
