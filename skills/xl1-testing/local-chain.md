# Local Dev-Chain Verification

> Sub-doc of [xl1-testing](SKILL.md). A headless verification method that runs
> against a **local** XL1 chain you launch yourself — free, deterministic,
> offline, and with a pre-funded account so there's no funding step.

This is the local analog of [Headless testnet verification](headless-testnet-verification.md):
same in-process seed-phrase signer + `GatewayBuilder`, but pointed at a chain
running on `localhost` instead of Sequence. Ideal for CI, TDD loops, and
multi-account flows where you want fast, repeatable runs without testnet tokens
or network latency.

## Accessibility — public packages only

This method uses only **publicly installable** packages:

- `@xyo-network/xl1-cli` (the `xl1` binary) — a self-contained bundle; `npm i`
  pulls no restricted `@xyo-network/*` runtime packages.
- `@xyo-network/xl1-sdk` — the client SDK you already use for dApp code.

> Prefer **[`@xyo-network/dapp-kit-vitest-config`](local-chain-dapp-kit-vitest.md)**
> when you want vitest to own the chain lifecycle (public packages, one chain per
> spec file). This `xl1 start` doc is the manual / session escape hatch.
>
> The XYO-internal `apiLocal` harness
> (`@xyo-network/xl1-vitest-config` / `chain-test`, restricted) is documented in
> [local-chain-vitest.md](local-chain-vitest.md) for internal monorepos only.
> A restricted package returns `E404` to an unauthenticated `npm view` — check
> `npm whoami` before concluding one does not exist.

## What the local chain is (and isn't)

`xl1 start` runs a **dev chain**: `api` + `producer` + `finalizer` actors in one
process, in-memory storage, on `http://localhost:8080`. Blocks are produced when
there is something to include, plus periodic empty heartbeats — how quickly
depends on how you launch it (see [Block cadence](#block-cadence)). It uses
simplified dev consensus (`minStake: 1`, `minCandidates: 1`) and built-in
**insecure** wallets (see [Funding](#funding--none-needed)).

It **is** good for: chain reads, transaction submission, transfers, payload/
datalake round-trips, viewer behavior, multi-account app logic — the app-level
surface a dApp exercises.

It is **not** a substitute for Sequence validation:
- No EVM staking-contract layer (that is the XYO team's internal `hardhat` test
  projects, which depend on restricted packages — out of reach and out of scope).
- In-memory storage **resets every run** (deterministic, but nothing persists).
- The chain id is generated fresh per boot (ephemeral).

Treat a green local run as "my chain interactions are correct," then validate
against Sequence (see [Headless testnet verification](headless-testnet-verification.md))
before shipping.

## Setup

```sh
npm install -g @xyo-network/xl1-cli   # or: npm i @xyo-network/xl1-cli in a project
```

Start the chain (foreground; it stays running and logs block production):

```sh
xl1 start --skip-insecure-confirm
```

- `xl1 start` defaults to actors `api producer finalizer`. `--skip-insecure-confirm`
  bypasses the interactive "insecure genesis wallet is active" RETURN prompt so it
  runs unattended (in CI, launch it as a background process and wait for
  `http://localhost:8080` to accept connections).
- Inspect the resolved config without starting anything with
  `xl1 start --dump-config` (add `--with-secrets` on a dev machine to see raw values).

## Block cadence

The producer does not mint on a fixed clock. Every `blockProductionCheckInterval`
it checks for work and builds a block if transactions are pending; with nothing
pending it emits an empty heartbeat block only once `heartbeatInterval` has
passed since the head. The finalizer checks for candidates every
`finalizationCheckInterval`. In `@xyo-network/xl1-cli` 5.4.1 the values depend
on whether you launch with a config file:

| Launch | Producer check | Heartbeat | Finalizer check | Idle chain | A submitted transaction |
|---|---|---|---|---|---|
| `xl1 start`, no config file (built-in dev preset) | 500 ms | 5 s | 200 ms | heartbeat block every ~5 s | lands and finalizes in well under a second |
| Config file (e.g. `-c <file>`) that does not set these fields | 10 s | 5 min | 500 ms | sits at block 2 after boot; next heartbeat ~5 min later | lands at the next producer check (0–10 s), finalized within ~0.5 s |

The dev preset applies only when the CLI finds no config file. With one, every
interval the file does not set falls back to the second row's defaults — even a
`-c` file that sets only `chain` fields. `--dump-config` shows which values you got.
To keep the fast cadence in a config file, set the fields explicitly — producer
`"blockProductionCheckInterval": 500, "heartbeatInterval": 5000`, finalizer
`"finalizationCheckInterval": 200, "heartbeatInterval": 5000` — and keep the two
`heartbeatInterval`s equal. The finalizer accepts an empty block only once its
own `heartbeatInterval` has passed since the head, so it refuses a faster
producer's heartbeats (blocks carrying transactions are exempt).

Budget tests for the slow row — a harness or shared config file puts you in it
without warning:

- Allow ~11 s from submit to finalized — longer if the two `heartbeatInterval`s
  disagree. `confirmSubmittedTransaction(hash, { attempts: 30, delay: 1_000 })`
  has ample headroom.
- Do not treat an *idle* chain's head advancing as a liveness signal; it may not
  move for minutes. For readiness, wait for a readable finalized head, which
  exists from boot.

## Benign log lines

With the default actor set (`api`, `producer`, `finalizer`), a healthy chain
logs lines that look like trouble. None of them means the chain has stalled:

- `findBestHead: candidates have failed uncle qualification continuously for N ms`
  — an already-finalized candidate lingers in the pending pool because no
  `mempool` actor prunes it. It repeats every ~5 s whenever that long passes
  without a new block, so it is constant on an idle config-file chain. Adding
  the `mempool` actor silences it: `{ "name": "mempool" }` in `actors`, or
  `xl1 start api producer finalizer mempool`.
- `[xl1-producer] Producer <addr> has insufficient stake.` followed by
  `Add stake to contract address <chain id> …` — the producer's
  intent-redeclaration timer (every 10 minutes; the first pass lands ~20 minutes
  after boot). A dev chain has no staking contract, so the check always fails;
  block production continues regardless. `"disableIntentRedeclaration": true`
  on the producer skips the check.
- `[finalizer] [shadow] block N would fail 'anchor-present': carries no EVM anchor`
  — a shadow-mode rule that only reports, logged for every finalized block
  because no EVM is configured. The startup notices about a missing
  `EvmChainViewer` have the same cause.

## Funding — none needed

Genesis pays **20,000 XL1** to account 0 of the well-known insecure mnemonic
**`test test test test test test test test test test test junk`** (printed at
startup under `INSECURE GENESIS REWARD WALLET WARNING`). Its accounts are the
standard Hardhat/Foundry test accounts:

| Account | derivePath | Address | Genesis balance |
|---|---|---|---|
| 0 | `'0'` | `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266` | 20,000 XL1 |
| 1 | `'1'` | `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` | 0 |

Sign with account 0 to fund anything else. Account 0 is **not** the producer, so
its balance stays at exactly 20,000 XL1 until you spend from it. The actors sign
with a separate root wallet — with no `--mnemonic`, the CLI's built-in
development mnemonic (`crane ribbon cook …`, printed in full at startup under
`DEVELOPMENT WALLET WARNING`). Its account 0,
`4e881c8217945f356900eb5e9e66fcbb05da3829`, is the producer and accrues the block
rewards.

To use your own identity instead, pass `--mnemonic "<phrase>"` (or
`XL1_MNEMONIC`) to `xl1 start` and derive from the same phrase in your script.
That replaces only the actors' root wallet: the producer becomes the phrase's
account 0, and genesis still pays `test … junk` account 0. To move the genesis
funds too, also set `XL1_CHAIN__GENESIS_REWARD_ADDRESS` to your address as 40
lowercase hex characters without `0x` (`chain.genesisRewardAddress` in a config
file — which also changes the cadence, see [Block cadence](#block-cadence)).
Passing the `test … junk` phrase itself as the mnemonic, as the
[Aries data-lake fixture](local-chain-datalake.md) does, makes account 0 the
producer as well.

## Verify script

Point the SDK at the local RPC. This is the same shape as headless testnet
verification — read, sign, submit, confirm, read back — just against `localhost`.

The gateway construction below is the 5.x SDK API. CLI and SDK versions move
independently: this script was last run end-to-end against `@xyo-network/xl1-cli`
**5.4.1** chains with `@xyo-network/xl1-sdk` **5.6.1**, and earlier against a
globally installed CLI **4.4.0** with SDK **5.2.3** — read, a 1 XL1 transfer,
`confirmSubmittedTransaction`, and the balance read-back all passed. A pre-5.0
CLI does not require a pre-5.0 SDK construction.

```ts
import { GatewayBuilder } from '@xyo-network/xl1-sdk'
import { generateXyoBaseWalletFromPhrase } from '@xyo-network/xl1-sdk/protocol-sdk'

const RPC = 'http://localhost:8080/rpc'
const MNEMONIC = 'test test test test test test test test test test test junk'

// Read-only gateway
const ro = await new GatewayBuilder().name('local').rpcUrl(RPC).build()
const viewer = ro.connection.viewer!
console.log('current head:', await viewer.block.currentBlockNumber())
console.log('finalized head:', await viewer.finalization.headNumber())

// Write-capable runner for the genesis-funded account 0
const base = await generateXyoBaseWalletFromPhrase(MNEMONIC)
const account0 = await base.derivePath('0')

const runner = await new GatewayBuilder()
  .name('local-signer')
  .rpcUrl(RPC)
  .account(account0)
  .buildRunner()

// Submit + confirm a transfer, then read back
const to = (await base.derivePath('1')).address
const hash = await runner.send(to, 1_000_000_000_000_000_000n) // 1 XL1 in atto
await runner.confirmSubmittedTransaction(hash, { attempts: 30, delay: 1_000 })
console.log('recipient balance:', await runner.connection.viewer!.account.balance.accountBalance(to))
```

Run it while `xl1 start` is up:

```sh
node verify.mjs
```

Notes:
- `{ attempts: 30, delay: 1_000 }` covers both launch modes in
  [Block cadence](#block-cadence): with a config file that sets the actors, a
  transaction can wait up to one 10 s producer check before it lands. The
  Sequence-tuned `10_000` delay is unnecessary locally.
- The SDK also ships a `local` entry in `DefaultNetworks` (`http://localhost:8080/rpc`);
  the explicit `.rpcUrl(...)` above is equivalent and self-documenting.
- The local `api` actor mounts only `/rpc`, `/rpc/indexed`, and probe routes —
  there is no `/dataLake` route to point `.dataLakeEndpoint(...)` at. For local
  datalake-backed reads, run the composed stack in
  [local chain + Aries data store](local-chain-datalake.md) and use its endpoint.
- Two different heights, both plain JS `number`s (branded `XL1BlockNumber`, not
  `bigint`): `viewer.block.currentBlockNumber()` is the **current** head,
  `viewer.finalization.headNumber()` is the **finalized** head. Finalization
  keeps close pace on a dev chain, so the two are frequently equal — assert on
  the one your code actually trusts. Balances are the values that *are*
  `bigint` (attoXL1).
- As with headless testnet verification, **import your dApp's own domain
  functions** into the script rather than re-implementing submission logic.

## It is not an EVM JSON-RPC endpoint

`/rpc` speaks the XL1 protocol, not Ethereum JSON-RPC. `eth_*` methods are not
registered, so the reflexive liveness probe fails in a way that reads like a
dead chain:

```sh
curl -s -X POST http://localhost:8080/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
# {"jsonrpc":"2.0","id":1,"error":{"code":-32603,
#   "message":"The method does not exist or is not available. (eth_blockNumber)", ...}}
```

Guessing XL1 method names by hand fails the same way (`block.currentBlockNumber`,
`finalization.headNumber` are SDK surfaces, not wire names). **Probe with the
SDK** — build a `GatewayBuilder` gateway and read
`viewer.block.currentBlockNumber()`, as in the script above. For "is the port
up yet" in CI, a TCP connect or the api actor's probe routes is enough; do not
reach for `eth_*`.

## REST readers need a published chain

Plain `xl1 start` serves `/rpc`, not a published-chain layout. Browser code that
reads through `InPageGatewaysProvider transport="rest"` — the XL1 Chrome wallet
UI among it — reads the Local network from `<localEndpoint>/blocks`, `/state`,
and `/indexes`, with `localEndpoint` defaulting to `https://chain.aries.test:8791`
(see [Browser Gateway — REST over RPC](../xl1-knowledge/gateway-browser.md#rest-over-rpc)).
Against a bare `xl1 start` those reads have nothing to fetch.

A working local recipe for `@xyo-network/xl1-cli` 5.4.1:

1. Serve the layout with `@ariestools/aries-chain-serve`
   (`pnpm add -D @ariestools/aries-chain-serve`), a dev-only S3-compatible
   fixture whose bin is `dist/bin/chainServer.mjs`:

   ```sh
   CHAIN_PORT=8791 HOST=127.0.0.1 CHAIN_BACKING=memory pnpm exec aries-chain-serve
   ```

2. Start `xl1` with a config file (`-c`; it runs on the config-file
   [cadence](#block-cadence) unless you set the intervals) that:
   - declares one `s3` connection per bucket — `blocks`, `state`, `indexes` —
     each with `"endpoint": "http://127.0.0.1:8791"`,
     `"readUrl": "http://127.0.0.1:8791/<bucket>"`, `"accessKeyId": "S3RVER"`,
     `"secretAccessKey": "S3RVER"`, and `"accountId": "test"`;
   - binds `BlockPublishRunner` to the `blocks` connection,
     `ChainStatePublishRunner` and `ChainStateViewer` to `state`, and
     `IndexPublishRunner` to `indexes`, with the authority providers on a
     `memory` connection (the same twelve bindings as
     [Declare the XL1 topology](local-chain-datalake.md#declare-the-xl1-topology));
   - sets `"publishOnFinalize": true` on the finalizer and adds the `mempool`
     and `indexer` actors.
3. Point the reader at `http://127.0.0.1:8791` with `InPageGatewaysProvider`'s
   `localEndpoint` prop. A reader that keeps the default needs the layout at
   `https://chain.aries.test:8791`, which `aries chain up --ssl auto`
   (`@ariestools/cli`, macOS) serves in place of step 1 — see that package's
   README for its certificate and hosts-file setup.

Two traps:

- Do **not** bind `"ChainContractViewer": { "provider": "SimpleChainContractViewer" }`,
  as ariestools' `chain-serve-local-s3` `buildXl1Config` does. 5.4.1 exits at
  startup with `UnknownProviderError: Provider "SimpleChainContractViewer" does
  not satisfy capability "ChainContractViewer"`. Omit the binding.
- Restart chain-serve with every `xl1` boot. Its memory buckets outlive the
  chain, so a new chain publishing over the old objects serves a stale head,
  and the indexer fails with `Ceiling N exceeds source head M`.

A reference config lives in the wallet-xl1-chrome repo at
`packages/e2e/fixtures/local-chain/xl1.config.json` once that change lands.

## Teardown

Stop the foreground process with Ctrl-C (or `kill` the backgrounded PID in CI).
Because storage is in-memory, nothing is left behind — the next `xl1 start` is a
clean chain. If you run the [REST recipe](#rest-readers-need-a-published-chain),
stop chain-serve as well; its buckets survive an `xl1` restart.

## Cross-References

- [Local chain via the vitest harness](local-chain-vitest.md) — the XYO-internal route to the same chain, with vitest owning the lifecycle.
- [Headless testnet verification](headless-testnet-verification.md) — the same signer/verify pattern against the live Sequence testnet; validate there before production.
- [Local chain + Aries data-lake fixture](local-chain-datalake.md) — add an independently hosted data/object lake to the local chain.
- [Full local XL1 dApp stack](local-dapp-stack.md) — add a real reducer, coherent state/index publication, and public consumer verification.
- [Unattended Sequence via CLI wallet](sequence-cli-wallet.md) — external CLI actor on Sequence.
- [xl1-testing](SKILL.md) — the testing barrel this approach belongs to.
- [Node Gateway](../xl1-knowledge/gateway-node.md) — `GatewayBuilder` API and the `local` network entry.
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `InPageGatewaysProvider`, the REST transport, and `localEndpoint`.
