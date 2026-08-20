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

> The XYO team's internal `api-local` vitest harness is **not** used here — it
> reaches the same chain through `@xyo-network/xl1-vitest-config` /
> `@xyo-network/chain-test`, both `access: restricted`, so external developers
> cannot install it. Launching the chain through the public `xl1` CLI is the
> accessible equivalent.
>
> **XYO-internal developers should prefer the harness** — it boots and tears
> down a chain per spec file instead of leaving you to babysit a background
> process. See [Local chain via the vitest harness](local-chain-vitest.md).
> Note that a restricted package returns `E404` to an unauthenticated
> `npm view`, so check `npm whoami` before concluding one does not exist.

## What the local chain is (and isn't)

`xl1 start` runs a **dev chain**: `api` + `producer` + `finalizer` actors in one
process, in-memory storage, on `http://localhost:8080`, producing and finalizing
blocks every few hundred ms. It uses simplified dev consensus (`minStake: 1`,
`minCandidates: 1`) and a built-in **insecure** genesis wallet.

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

## Funding — none needed

With no `--mnemonic`, the dev chain uses the well-known insecure mnemonic
**`test test test test test test test test test test test junk`**. Its accounts
are the standard Hardhat/Foundry test accounts, and **account 0 is genesis-funded**:

| Account | derivePath | Address | Genesis balance |
|---|---|---|---|
| 0 | `'0'` | `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266` | 20,000 XL1 |
| 1 | `'1'` | `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` | 0 |

Sign with account 0 to fund anything else. (Account 0 is also the producer, so it
additionally accrues block rewards while the chain runs.) To use your own
identity instead, pass `--mnemonic "<phrase>"` to `xl1 start` and derive from the
same phrase in your script.

## Verify script

Point the SDK at the local RPC. This is the same shape as headless testnet
verification — read, sign, submit, confirm, read back — just against `localhost`.

The gateway construction below is the 5.x SDK API. CLI and SDK versions move
independently: this script was last run end-to-end against a chain from a
globally installed `@xyo-network/xl1-cli` **4.4.0** with `@xyo-network/xl1-sdk`
**5.2.3** — read, a 1 XL1 transfer, `confirmSubmittedTransaction`, and the
balance read-back all passed. A pre-5.0 CLI does not require a pre-5.0 SDK
construction.

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
- Local blocks land in well under a second, so `confirmSubmittedTransaction`'s
  poll can be tight (`{ attempts: 30, delay: 1_000 }` is plenty; the Sequence-tuned
  `10_000` delay is unnecessary locally).
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

## Teardown

Stop the foreground process with Ctrl-C (or `kill` the backgrounded PID in CI).
Because storage is in-memory, nothing is left behind — the next `xl1 start` is a
clean chain.

## Cross-References

- [Local chain via the vitest harness](local-chain-vitest.md) — the XYO-internal route to the same chain, with vitest owning the lifecycle.
- [Headless testnet verification](headless-testnet-verification.md) — the same signer/verify pattern against the live Sequence testnet; validate there before production.
- [Local chain + Aries data-lake fixture](local-chain-datalake.md) — add an independently hosted data/object lake to the local chain.
- [Full local XL1 dApp stack](local-dapp-stack.md) — add a real reducer, coherent state/index publication, and public consumer verification.
- [Unattended Sequence via CLI wallet](sequence-cli-wallet.md) — external CLI actor on Sequence.
- [xl1-testing](SKILL.md) — the testing barrel this approach belongs to.
- [Node Gateway](../xl1-knowledge/gateway-node.md) — `GatewayBuilder` API and the `local` network entry.
