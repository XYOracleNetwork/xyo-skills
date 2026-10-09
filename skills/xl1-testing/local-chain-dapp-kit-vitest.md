# Local Chain via dApp Kit Vitest (`local-xl1`)

> Sub-doc of [xl1-testing](SKILL.md). Boots a real local XL1 chain **inside the
> vitest run** — one chain per spec file — using the **public**
> [`@xyo-network/dapp-kit-vitest-config`](https://www.npmjs.com/package/@xyo-network/dapp-kit-vitest-config)
> preset. Prefer this over babysitting a background `xl1 start` process whenever
> the consumer can depend on published dapp-kit packages.

This is the publicly installable analog of the XYO-internal
[apiLocal harness](local-chain-vitest.md): no restricted `@xyo-network/chain-test`
packages, and the chain is the published `xl1` CLI. This doc covers the choice,
a first green spec, and the gotchas; the package README on
[npm](https://www.npmjs.com/package/@xyo-network/dapp-kit-vitest-config) is the
full reference (installer table and override shapes, `optInOnly` resolution
order, globs, exports, Event Kit receiver configuration).

A green local run proves dApp chain interactions. It is **not** Sequence or
mainnet qualification.

## Which route to take

| | [Public `xl1 start`](local-chain.md) | **This preset (`local-xl1`)** | [Internal `apiLocal`](local-chain-vitest.md) |
|---|---|---|---|
| Packages | public CLI + SDK | **public** `@xyo-network/dapp-kit-vitest-config` | restricted `xl1-vitest-config` (+ chain-test) |
| Chain lifecycle | you start/stop | vitest `beforeAll` / `afterAll`, per spec file | same (vitest-owned) |
| Chain runtime | published `xl1` CLI | published `xl1` CLI (`api` + `producer` + `finalizer`) | in-process / restricted orchestrator |
| Who should use it | any public consumer | **default for new public / dapp-kit consumers** | XYO-internal monorepos only |

## Install

```sh
pnpm add -D @xyo-network/dapp-kit-vitest-config @ariestools/vitest-config vitest
# optional browser project
pnpm add -D @vitest/browser-playwright playwright
```

Peers include `@xyo-network/xl1-sdk` (`^5.8` at preset 3.2.2, and related),
`@ariestools/vitest-config` `^10.1`, and `vitest` `^5.0`. `@xyo-network/xl1-cli`
(`~5.6.1`) arrives as a dependency and is spawned by setup — **do not import the
CLI from application source**. **Run on Node 26:** the preset and CLI declare
`>=24`, but the `xl1-sdk` `^5.8` peer declares `>=26`.

## Config

```ts
import { defineDappKitVitestConfig } from '@xyo-network/dapp-kit-vitest-config'

export default defineDappKitVitestConfig({
  installers: { localXl1: { optInOnly: true } },
})
```

```json
{ "scripts": { "test": "vitest run", "test:local-xl1": "vitest run --project local-xl1" } }
```

`pnpm test` stays offline. `pnpm test:local-xl1` boots one chain per spec file.
`optInOnly: true` is already the catalog default for every installer, so
`installers: { localXl1: true }` behaves the same; the explicit flag only
documents intent. With no `installers` it is an offline-only config that keeps
`@ariestools/vitest-config`'s node project name (`node`) and browser routing
(shared specs re-run), so adoption avoids the
[internal preset's](local-chain-vitest.md) silent topology changes.

`installers: true` enables all six catalog ids, and every one stays opt-in
(registers only when selected with `--project <name>`). Only three boot a chain:
`localXl1` (`local-xl1`); `apiLocal` (`api-local` — the same public chain for
`spec/api-local/**` specs, so a public repo can keep that layout without the
restricted [`xl1-vitest-config`](local-chain-vitest.md)); and
`localEventPublisher` (its own chain **plus** a wake publisher — see
[below](#local-chain-with-event-kit-publication)). `localDatalake`,
`localSystem`, and `localBrowser` boot **nothing** — they only serialize heavier
suites out of the offline project, whose specs still own their infrastructure.

## Where specs must live

The `local-xl1` include globs come from the catalog, **not** from your `include`:
put live specs in a `spec/local-xl1/` directory (`src/**/spec/local-xl1/**`,
`src/e2e/spec/local-xl1/**`, or `packages/**/src/**/spec/local-xl1/**`). A live
spec anywhere else is not picked up by `--project local-xl1` and runs in the
offline project instead — where no chain exists and `localXl1RpcUrl()` throws.

## Globals and gateway

**Read `localXl1RpcUrl()` (or `globalThis.rpcUrl`) — never hardcode
`http://localhost:8080/rpc`.** Parallel workers boot chains on other ports.
`apiPort` and `chainId` (fresh per boot) are set alongside it; ambient types:
`@xyo-network/dapp-kit-vitest-config/globals`.

Build the gateway as an owning session and release it in `afterAll`
(`buildSession()` / `buildRunnerSession()`, `@xyo-network/xl1-sdk` ≥ 5.1). The
README sample's plain `build()` keeps no handle to free its provider graph:

```ts
import { assertEx } from '@ariestools/sdk'
import type {
  GatewaySession, XyoGateway, XyoViewer,
} from '@xyo-network/xl1-sdk'
import { GatewayBuilder } from '@xyo-network/xl1-sdk'
import { localXl1RpcUrl } from '@xyo-network/dapp-kit-vitest-config'
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest'

let session: GatewaySession<XyoGateway> | undefined
let viewer: XyoViewer

beforeAll(async () => {
  session = await new GatewayBuilder()
    .name('local')
    .rpcUrl(localXl1RpcUrl())
    .buildSession()
  viewer = assertEx(session.gateway.connection.viewer, () => 'local chain gateway exposed no viewer')
})

afterAll(async () => {
  await session?.stop()
})

describe('finalized head (live local chain)', () => {
  it('advances as the chain finalizes blocks', async () => {
    const start = await viewer.finalization.headNumber()
    let head = start
    for (let attempt = 0; attempt < 40 && head <= start; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 250))
      head = await viewer.finalization.headNumber()
    }
    expect(head).toBeGreaterThan(start)
  })
})
```

To sign, derive from `LOCAL_XL1_DEV_MNEMONIC` (exported by the preset). Account
`'0'` is genesis-funded; its address is exported as
`LOCAL_XL1_DEV_ACCOUNT_0_ADDRESS` for balance assertions. Storage is in-memory;
chain id is ephemeral.

**Verify it ran:** setup logs `dapp-kit local XL1 started: API on <port>, chain
<id>` per spec file, and the post-run footer lists `local-xl1` with pass/fail
counts. `not run` there, or `(none — CLI filter matched no registered project)`,
means no spec touched a chain — check the installer and the spec path.

## Local chain with Event Kit publication

For a dApp that consumes finalized-head **wakes**
([Events and wakes](../xl1-dapp-kit/events-and-wakes.md)), enable
`installers: { localEventPublisher: true }`, put specs under
`spec/local-event-publisher/**` (the same three glob shapes as `local-xl1`), and
run `pnpm vitest run --project local-event-publisher`. The project boots **its
own** chain and publisher identity per spec file and sets the same `rpcUrl` /
`apiPort` / `chainId` globals — do not add the `local-xl1` setup too.

After your dApp's admission endpoint is up, register it with
`localEventPublisher().subscribe({ endpoint, audience, deploymentId, ... })`.
Each subscription runs a real Event Kit `WakePublisherActor` that POSTs signed
wakes for **finalized** blocks to a loopback endpoint, retrying the same wake
until the receiver answers `200` or `202`. Teardown runs `assertHealthy()` and
stops every subscription and the chain; stop a subscription yourself before
closing its endpoint. Cursor and outbox state last only for the fixture — this
is not a restart-durability test, and it creates no Statement Graph grants.

The Event Kit packages are **optional peers** needed only by this project:
`@ariestools/actor` `^2.0` and `@xyo-network/event-kit-actor`,
`@xyo-network/event-kit-protocol`, `@xyo-network/event-kit-schemas` `^2.2`
(2.2.x declares Node `>=26`). Trust the preset's `package.json` here — its
README's "Optional Event Kit packages" paragraph still lists older ranges. The
README section "Local chain with Event Kit publication" has the full receiver
configuration.

## What the local chain is (and isn't)

Same caveats as [local-chain.md](local-chain.md#what-the-local-chain-is-and-isnt):
simplified dev consensus, no EVM staking layer, proves interactions not full
network behavior. Confirm against [Sequence](headless-testnet-verification.md)
before shipping.

## Cross-references

- [XL1 dApp Kit](../xl1-dapp-kit/SKILL.md) / [Conformance](../xl1-dapp-kit/conformance.md)
- [Local chain via apiLocal](local-chain-vitest.md) — XYO-internal only (restricted `xl1-vitest-config`, not this preset's public `apiLocal`)
- [Local `xl1 start`](local-chain.md) — manual public escape hatch
- [Package README](https://www.npmjs.com/package/@xyo-network/dapp-kit-vitest-config) — full installer, glob, and export reference
