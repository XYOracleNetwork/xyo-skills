# Local Chain via the Vitest Harness (`apiLocal`)

> Sub-doc of [xl1-testing](SKILL.md). Boots a real local XL1 chain **inside the
> vitest run** — one chain per spec file, started in `beforeAll` and stopped in
> `afterAll` — instead of hand-managing a background `xl1 start` process.
> **XYO-internal track only:** needs npm access to restricted `@xyo-network/*`
> packages. "`apiLocal`" in this doc means the installer from the restricted
> `@xyo-network/xl1-vitest-config`.
>
> **Public / dapp-kit consumers:** use
> **[Local chain via dApp Kit Vitest](local-chain-dapp-kit-vitest.md)**
> (`@xyo-network/dapp-kit-vitest-config`) instead — same vitest-owned lifecycle,
> published packages. That preset has its own public `apiLocal` installer
> (project `api-local`, same `spec/api-local/**` globs) that boots the published
> `xl1` CLI chain, so a public repo with existing `spec/api-local` specs can keep
> them without this package. Manual [local `xl1 start`](local-chain.md) remains
> the zero-preset escape hatch.

The chain, the signer, and the app-level surface are the same as
[local dev-chain verification](local-chain.md); only the *lifecycle* differs.
This doc covers the choice, the adoption gotchas, and a first green spec. The
full reference — installer catalog, `installers` shapes and per-installer
overrides, `optInOnly` resolution order, `runActorScript`, exports — is the
package README. The package is restricted and its source is private, so that
README is readable only from an install (XYO-internal):
`node_modules/@xyo-network/xl1-vitest-config/README.md`.

## Which route to take

| | [Public `xl1 start`](local-chain.md) | [dapp-kit `local-xl1`](local-chain-dapp-kit-vitest.md) | `apiLocal` (this doc) |
|---|---|---|---|
| Packages | public CLI + SDK | **public** `dapp-kit-vitest-config` | restricted `xl1-vitest-config` (+ `chain-test`) |
| Chain lifecycle | you start and stop | vitest per spec file | vitest per spec file |
| Chain runtime | published `xl1` CLI | published `xl1` CLI | in-process / restricted orchestrator |
| Actors | `api producer finalizer` | `api producer finalizer` | `api producer finalizer mempool` |
| RPC URL | fixed `http://localhost:8080/rpc` | per-file port (`localXl1RpcUrl()`) | per-file port (test global) |
| Who | anyone | **preferred public default** | XYO-internal only |

None of these is Sequence qualification — see
[What the local chain is (and isn't)](local-chain.md#what-the-local-chain-is-and-isnt).
Everything in that section applies verbatim here: simplified dev consensus,
in-memory storage, no EVM staking layer, ephemeral chain id.

## Access — restricted packages and the misleading 404

`@xyo-network/xl1-vitest-config` and `@xyo-network/chain-test` both publish
`access: restricted`.

> **A logged-out `npm view` on a restricted package returns `E404 Not Found`,
> not `401`** — so a package that exists and is published looks like it was
> never published at all. Run `npm whoami` before concluding a
> `@xyo-network/*` package does not exist.

```sh
npm whoami                                        # error / no output => not authenticated
npm view @xyo-network/xl1-vitest-config version    # 5.6.1 when authenticated
```

The response does mention permissions, but only below the `E404` line most
readers stop at: `... could not be found or you do not have permission to access it.`

## Install

```sh
pnpm add -D @xyo-network/xl1-vitest-config @ariestools/vitest-config vitest
# only if the repo also runs a browser project:
pnpm add -D @vitest/browser-playwright playwright
```

`@xyo-network/chain-test` supplies the installer implementations and arrives
**transitively** as a dependency of `@xyo-network/xl1-vitest-config`. Do **not**
declare it directly: nothing in your own source imports it, so `xy deplint`
reports a direct declaration as an unused devDependency.

Peer ranges at `@xyo-network/xl1-vitest-config` 5.6.1: `@ariestools/vitest-config`
`^10.0`, `vitest` `^5.0`. The spec below imports `@xyo-network/xl1-sdk`, which
declares Node `>=26` — run on Node 26.

## ⚠️ Two silent topology changes on adoption

Swapping `defineXyVitestConfig` for `defineXl1VitestConfig` in an existing repo
changes two defaults **without any error, warning, or failing test**. Both are
xyo-chain conventions, not upgrades.

| | `@ariestools/vitest-config` | `defineXl1VitestConfig` default | Pass this to keep the old behavior |
|---|---|---|---|
| Browser project include | shares the node `include` (cross-realm specs run twice) | `spec/browser/**` only (`browserOnly: true`) | `browserOnly: false` |
| Node project name | `node` | `offline` | `nodeProjectName: 'node'` |

- **`browserOnly`** is the dangerous one. If the repo keeps cross-realm specs
  under plain `spec/` (the [shared-preset routing](browser-mode.md#preferred-ariestoolsvitest-config)),
  the browser project stops re-running them and — with no `spec/browser/**`
  directory at all — matches zero files. Measured on `event-kit`: the suite went
  from **511 tests / 42 files / 2 projects** to **271 / 24 / 1**, footer
  `browser — not run`, exit code still 0. Any coverage that depended on a spec
  executing in *both* realms (ES256K verify/hash parity, in-page vs node
  gateway) silently stops being evidence.
- **`nodeProjectName`** breaks every existing `--project node` invocation,
  package script, CI job, and doc line in the repo. The run still passes; the
  filter just matches nothing.

The default `include` is also broader here (`src/**/spec/**`, `src/e2e/spec/**`,
`packages/**/src/**/spec/**`) than the ariestools default
(`packages/*/src/**/spec/**`). Keep passing the repo's own `include` if it has
one.

## Configuration

Add only the installers the repo can actually run. `installers: true` is the
xyo-chain shape — it enables hardhat, S3, and multiproc-mongo projects too, and
**throws** unless `runActorScript` is supplied for the multiproc entries.

Minimal — a local chain, opt-in, existing topology preserved:

```ts
import { playwright } from '@vitest/browser-playwright'
import { defineXl1VitestConfig } from '@xyo-network/xl1-vitest-config'

export default defineXl1VitestConfig({
  browser: { provider: playwright() },
  browserOnly: false,                                // keep re-running shared specs in Chromium
  include: ['packages/*/src/**/spec/**/*.spec.ts'],  // this repo's own globs
  installers: { apiLocal: { optInOnly: true } },     // registers only with --project api-local
  nodeProjectName: 'node',                           // keep `--project node` working
})
```

```json
{ "scripts": { "test": "vitest run", "test:api-local": "vitest run --project api-local" } }
```

### `optInOnly` — keeping the default suite offline

**`apiLocal` is not opt-in by default here** (unlike every installer in the
public preset). An enabled installer's globs are always stripped from the base
node project; `optInOnly` controls whether the installer *project* registers:

- `optInOnly: false` (the `apiLocal` catalog default) — registers on every run,
  so `pnpm test` boots a chain.
- `optInOnly: true` — registers only when selected by project **name**:
  `vitest run --project api-local` (the name, not the option id `apiLocal`).
  This keeps `pnpm test` offline and fast, and records live qualification as a
  separate, deliberate run.

## Where specs must live

The `api-local` include globs come from the catalog, **not** from your
`include`: put live specs in a `spec/api-local/` directory
(`src/**/spec/api-local/**`, `src/e2e/spec/api-local/**`, or
`packages/**/src/**/spec/api-local/**`). A live spec anywhere else is not picked
up by `--project api-local` and still runs in the offline project — where no
chain exists.

## What the installer does

`installApiLocalSetup()` from `@xyo-network/chain-test` registers a
`beforeAll` / `afterAll` pair, so **each spec file gets its own chain**: it picks
port `8080 + VITEST_WORKER_ID` (an OS-assigned port when that one is busy),
builds `api`, `producer`, `finalizer`, and `mempool` in-process from the dev
config, waits for block > 0, assigns the test globals, and stops the
orchestrator in `afterAll`.

### Test globals

| Global | Type | Contents |
|---|---|---|
| `rpcUrl` | `string` | `http://localhost:<port>/rpc` — use this |
| `apiPort` | `number` | the chosen port |
| `chainId` | `ChainId` | fresh per boot |
| `chainLocators` | `Record<string, ProviderFactoryLocatorInstance>` | per-actor locators plus `_root` |
| `blockProducerWallet` | `WalletInstance` | genesis-funded account 0 of the insecure mnemonic |

**Read `globalThis.rpcUrl`; do not hardcode `http://localhost:8080/rpc`.** Only
the first spec file lands on 8080 — a parallel run boots additional chains on
other ports, so a hardcoded URL either reaches a *different* file's chain or
nothing at all.

`@xyo-network/chain-test` does not ship its ambient `globals.d.ts` (it is not in
the published `dist`), so declare the globals you use in a `.d.ts` beside your
specs:

```ts
// src/spec/api-local/globals.d.ts
declare global {
  var apiPort: number
  var rpcUrl: string
}
```

Then build the gateway as in the public route, as an owning session that
`afterAll` releases (`buildSession()` / `buildRunnerSession()`,
`@xyo-network/xl1-sdk` ≥ 5.1; plain `build()` keeps no handle to free its
provider graph):

```ts
import { assertEx } from '@ariestools/sdk'
import type {
  GatewaySession, XyoGateway, XyoViewer,
} from '@xyo-network/xl1-sdk'
import { GatewayBuilder } from '@xyo-network/xl1-sdk'
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest'

let session: GatewaySession<XyoGateway> | undefined
let viewer: XyoViewer

beforeAll(async () => {
  session = await new GatewayBuilder().name('local').rpcUrl(globalThis.rpcUrl).buildSession()
  viewer = assertEx(session.gateway.connection.viewer, () => 'local chain gateway exposed no viewer')
})

afterAll(async () => {
  await session?.stop()
})

describe('finalized head (live local chain)', () => {
  it('advances as the chain finalizes blocks', async () => {
    const start = await viewer.finalization.headNumber()
    let head = start
    // Local blocks land in well under a second, so a short poll is enough.
    for (let attempt = 0; attempt < 40 && head <= start; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 250))
      head = await viewer.finalization.headNumber()
    }
    expect(head).toBeGreaterThan(start)
  })
})
```

`headNumber()` is the **finalized** head and `block.currentBlockNumber()` the
**current** one; both are plain JS `number`s, not `bigint`. See the
[notes in the public route](local-chain.md#verify-script).

To sign, derive from `globalThis.blockProducerWallet` (or the same insecure
mnemonic) — see [Funding](local-chain.md#funding--none-needed).

## Running

```sh
pnpm test                              # offline: node (+ browser) projects only
pnpm vitest run --project api-local    # live: boots a chain per spec file
pnpm test:api-local                    # the same, via the package script
```

Vitest project filters also accept path filters, so a large monorepo can scope a
live run to the packages that have live specs:
`vitest run --project api-local packages/xl1`.

**Verify it ran.** Setup logs `XL1 dev chain started: API on <port>, chain <id>`
per spec file (`XL1 dev chain stopped` on teardown). `defineXl1VitestConfig`
also appends a post-run footer listing each project's results and why each
installer registered, was skipped as opt-in, or was never enabled — read it to
confirm a project ran rather than matched zero files:

```
Registered / eligible to run:
  • node — 271 passed, 0 failed
  • browser — not run
Skipped (opt-in only; not selected via --project):
  • api-local — opt-in only (per-installer override); pass --project api-local to run
```

## Cross-References

- [Local dev-chain verification](local-chain.md) — the publicly installable route, and the shared "what the local chain is (and isn't)" caveats, funding table, and SDK usage.
- [Headless testnet verification](headless-testnet-verification.md) — validate against Sequence before shipping; a green local run is not network qualification.
- [Headless browser-mode testing](browser-mode.md) — the browser project whose includes `browserOnly` silently narrows.
- [`xy-toolchain` (ariestools-skills) — testing](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-toolchain/testing.md) — `@ariestools/vitest-config`, the `spec/` layout, and the defaults this preset overrides.
- [Full local XL1 dApp stack](local-dapp-stack.md) — when the chain alone is not enough and you need reducer + published consumer view.
- [xl1-testing](SKILL.md) — the testing barrel this approach belongs to.
