# Local Chain via the Vitest Harness (`apiLocal`)

> Sub-doc of [xl1-testing](SKILL.md). Boots a real local XL1 chain **inside the
> vitest run** — one chain per spec file, started in `beforeAll` and stopped in
> `afterAll` — instead of hand-managing a background `xl1 start` process.
> **XYO-internal track only:** needs npm access to restricted `@xyo-network/*`
> packages.
>
> **Public / dapp-kit consumers:** use
> **[Local chain via dApp Kit Vitest](local-chain-dapp-kit-vitest.md)**
> (`@xyo-network/dapp-kit-vitest-config`) instead — same vitest-owned lifecycle,
> published packages. Manual [local `xl1 start`](local-chain.md) remains the
> zero-preset escape hatch.

The chain, the signer, and the app-level surface are the same as
[local dev-chain verification](local-chain.md); only the *lifecycle* differs.

## Which route to take

| | [Public `xl1 start`](local-chain.md) | [dapp-kit `local-xl1`](local-chain-dapp-kit-vitest.md) | `apiLocal` (this doc) |
|---|---|---|---|
| Packages | public CLI + SDK | **public** `dapp-kit-vitest-config` | restricted `xl1-vitest-config` (+ `chain-test`) |
| Chain lifecycle | you start and stop | vitest per spec file | vitest per spec file |
| Chain runtime | published `xl1` CLI | published `xl1` CLI | in-process / restricted orchestrator |
| Actors | `api producer finalizer` | `api producer finalizer` | `api producer finalizer mempool` |
| RPC URL | fixed `http://localhost:8080/rpc` | per-file port (`localXl1RpcUrl()`) | per-file port (test global) |
| Who | anyone | **preferred public default** | XYO-internal only |

Neither is Sequence qualification — see
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
npm view @xyo-network/xl1-vitest-config version    # 5.1.0 when authenticated
```

The response does mention permissions, but only below the `E404` line most
readers stop at:

```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@xyo-network%2fchain-test - Not found
npm error 404
npm error 404  The requested resource '@xyo-network/chain-test@*' could not be found or you do not have permission to access it.
```

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

Peer ranges at `@xyo-network/xl1-vitest-config` 5.1.0: `@ariestools/vitest-config`
`^9.0`, `vitest` `^4.1`.

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
  directory at all — matches zero files. Measured on `event-kit`: leaving the
  default in place took the suite from **511 tests / 42 files / 2 projects** to
  **271 / 24 / 1**, with the footer reporting `browser — not run`. Exit code
  stayed 0. Any coverage that depended on a spec executing in *both* realms
  (ES256K verify/hash parity, in-page vs node gateway) silently stops being
  evidence.
- **`nodeProjectName`** breaks every existing `--project node` invocation,
  package script, CI job, and doc line in the repo. The run still passes; the
  filter just matches nothing.

A third difference is loud enough to notice but worth pre-empting: the default
`include` is broader here (`src/**/spec/**`, `src/e2e/spec/**`,
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

Then wire the opt-in run as a script:

```json
{ "scripts": { "test": "vitest run", "test:api-local": "vitest run --project api-local" } }
```

### `installers` shapes

| Value | Effect |
|---|---|
| omitted / `false` | no installer projects |
| `true` | every id in `XL1_VITEST_DEFAULT_INSTALLERS` (all but `apiLocalMongodbBeta`) |
| `['apiLocal', 'hardhat']` | just those ids, each with catalog defaults |
| `{ apiLocal: true, hardhat: false, apiLocalS3: { hookTimeout: 240_000 } }` | per-id enable / disable / override |

Per-installer overrides (`Xl1InstallerProjectOptions`): `env`, `hookTimeout`,
`include`, `optInOnly`, `runActorScript`, `setupFiles`, `test`, `testTimeout`.
An unknown installer id throws at config load.

### `optInOnly` — keeping the default suite offline

An enabled installer's globs are **always** stripped from the base node project,
so its specs never run in the offline suite either way. `optInOnly` controls
whether the installer *project* registers at all:

- `optInOnly: false` (the `apiLocal` catalog default) — registers on every run,
  so `pnpm test` boots a chain.
- `optInOnly: true` — registers only when selected by project **name**:
  `vitest run --project api-local`. This is what keeps `pnpm test` offline and
  fast, and it records live qualification as a separate, deliberate run.

Resolution order, highest first: per-installer `installers: { id: { optInOnly } }`
→ top-level `optInOnly: { id: bool }` map → catalog default (`online` and
`profile` are opt-in by default; everything else is not).

The flag matches the project name, not the option id — `apiLocal` → `--project api-local`.

### Post-run footer

`defineXl1VitestConfig` appends a reporter that prints per-project results plus
which installers registered, were skipped as opt-in, or were never enabled — with
the reason for each. Read it to confirm a project actually ran rather than
matching zero files:

```
Registered / eligible to run:
  • node — 271 passed, 0 failed
  • browser — not run
Skipped (opt-in only; not selected via --project):
  • api-local — opt-in only (per-installer override); pass --project api-local to run
```

Disable with `projectSelectionFooter: false`.

## Where specs must live

The `apiLocal` project's include globs come from the catalog, **not** from your
`include`:

| Glob | Use |
|---|---|
| `src/**/spec/api-local/**/*.spec.ts` | single-package repo |
| `src/e2e/spec/api-local/**/*.spec.ts` | root-level e2e package |
| `packages/**/src/**/spec/api-local/**/*.spec.ts` | monorepo package specs |

A live spec outside these paths is not picked up by `--project api-local`, and
(having no matching exclude) still runs in the offline project — where no chain
exists. Default `hookTimeout` for the project is 60 s.

## What the installer does

`installApiLocalSetup()` from `@xyo-network/chain-test` registers a
`beforeAll` / `afterAll` pair, so **each spec file gets its own chain**:

1. picks a port — `8080 + VITEST_WORKER_ID`, falling back to an OS-assigned
   ephemeral port when that one is busy (it deliberately does *not* scan
   upward, since neighboring ports are sibling workers' reserved bases);
2. builds `api`, `producer`, `finalizer`, and `mempool` actors in-process from
   the dev config (block-production check 50 ms, finalization check 25 ms,
   `minCandidates: 1`), starts them, and waits for block > 0;
3. assigns test globals and logs
   `XL1 dev chain started: API on <port>, chain <id>`;
4. stops the orchestrator in `afterAll` (`XL1 dev chain stopped`).

A three-file live run on `event-kit` completed in 3.88 s wall clock, 1.56 s of
that being chain boot across all three files.

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
the published `dist`), so declare the globals you use — same shape as the
harness's own, in a `.d.ts` beside your specs:

```ts
// src/spec/api-local/globals.d.ts
declare global {
  var apiPort: number
  var rpcUrl: string
}
```

Then build the gateway exactly as in the public route:

```ts
import { assertEx } from '@ariestools/sdk'
import type { XyoViewer } from '@xyo-network/xl1-sdk'
import { GatewayBuilder } from '@xyo-network/xl1-sdk'
import {
  beforeAll, describe, expect, it,
} from 'vitest'

let viewer: XyoViewer

beforeAll(async () => {
  const gateway = await new GatewayBuilder().name('local').rpcUrl(globalThis.rpcUrl).build()
  viewer = assertEx(gateway.connection.viewer, () => 'local chain gateway exposed no viewer')
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

## Cross-References

- [Local dev-chain verification](local-chain.md) — the publicly installable route, and the shared "what the local chain is (and isn't)" caveats, funding table, and SDK usage.
- [Headless testnet verification](headless-testnet-verification.md) — validate against Sequence before shipping; a green local run is not network qualification.
- [Headless browser-mode testing](browser-mode.md) — the browser project whose includes `browserOnly` silently narrows.
- [xy-toolchain testing](../xy-toolchain/testing.md) — `@ariestools/vitest-config`, the `spec/` layout, and the defaults this preset overrides.
- [Full local XL1 dApp stack](local-dapp-stack.md) — when the chain alone is not enough and you need reducer + published consumer view.
- [xl1-testing](SKILL.md) — the testing barrel this approach belongs to.
