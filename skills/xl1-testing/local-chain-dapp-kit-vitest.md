# Local Chain via dApp Kit Vitest (`local-xl1`)

> Sub-doc of [xl1-testing](SKILL.md). Boots a real local XL1 chain **inside the
> vitest run** — one chain per spec file — using the **public**
> [`@xyo-network/dapp-kit-vitest-config`](https://www.npmjs.com/package/@xyo-network/dapp-kit-vitest-config)
> preset. Prefer this over babysitting a background `xl1 start` process whenever
> the consumer can depend on published dapp-kit packages.

This is the publicly installable analog of the XYO-internal
[apiLocal harness](local-chain-vitest.md). It does **not** need restricted
`@xyo-network/chain-test` packages. The chain is the published `xl1` CLI
(same family as `@xyo-network/dapp-kit-local`).

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

Peers include `@xyo-network/xl1-sdk` (and related). `@xyo-network/xl1-cli` arrives
as a dependency of the preset and is spawned by setup — **do not import the CLI
from application source**.

## Config

### Offline suite only

```ts
import { defineDappKitVitestConfig } from '@xyo-network/dapp-kit-vitest-config'

export default defineDappKitVitestConfig()
```

Defaults match `@ariestools/vitest-config` (node project named `node`).

### Opt-in local XL1

```ts
import { defineDappKitVitestConfig } from '@xyo-network/dapp-kit-vitest-config'

export default defineDappKitVitestConfig({
  installers: { localXl1: { optInOnly: true } },
})
```

```json
{
  "scripts": {
    "test": "vitest run",
    "test:local-xl1": "vitest run --project local-xl1"
  }
}
```

`pnpm test` stays offline. `pnpm test:local-xl1` boots one chain per spec file.

`installers: true` enables every catalog id (`localXl1`, `localDatalake`,
`localSystem`, `localBrowser`). Today only **`localXl1` auto-boots a chain**;
the others isolate heavier suites — specs still own their own infrastructure
until those installers grow setup files.

## Where specs must live

The `local-xl1` include globs come from the catalog, **not** from your `include`:

| Glob | Use |
|---|---|
| `src/**/spec/local-xl1/**/*.spec.ts` | single-package repo |
| `src/e2e/spec/local-xl1/**/*.spec.ts` | root-level e2e package |
| `packages/**/src/**/spec/local-xl1/**/*.spec.ts` | monorepo package specs |

A live spec outside these paths is not picked up by `--project local-xl1` and
may still run in the offline project — where no chain exists.

## Globals and gateway

Ambient types: `@xyo-network/dapp-kit-vitest-config/globals`.

| Global | Contents |
|---|---|
| `rpcUrl` | `http://127.0.0.1:<port>/rpc` — **use this** |
| `apiPort` | chosen port |
| `chainId` | fresh per boot |

**Read `globalThis.rpcUrl` or `localXl1RpcUrl()` — never hardcode
`http://localhost:8080/rpc`.** Parallel workers use other ports.

```ts
import { assertEx } from '@ariestools/sdk'
import type { XyoViewer } from '@xyo-network/xl1-sdk'
import { GatewayBuilder } from '@xyo-network/xl1-sdk'
import { localXl1RpcUrl } from '@xyo-network/dapp-kit-vitest-config'
import {
  beforeAll, describe, expect, it,
} from 'vitest'

let viewer: XyoViewer

beforeAll(async () => {
  const gateway = await new GatewayBuilder()
    .name('local')
    .rpcUrl(localXl1RpcUrl())
    .build()
  viewer = assertEx(gateway.connection.viewer, () => 'local chain gateway exposed no viewer')
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
`'0'` is genesis-funded. Storage is in-memory; chain id is ephemeral.

## What the local chain is (and isn't)

Same caveats as [local-chain.md](local-chain.md#what-the-local-chain-is-and-isnt):
simplified dev consensus, no EVM staking layer, proves interactions not full
network behavior. Confirm against [Sequence](headless-testnet-verification.md)
before shipping.

## Cross-references

- [XL1 dApp Kit](../xl1-dapp-kit/SKILL.md) / [Conformance](../xl1-dapp-kit/conformance.md)
- [Local chain via apiLocal](local-chain-vitest.md) — XYO-internal only
- [Local `xl1 start`](local-chain.md) — manual public escape hatch
- Package README: `@xyo-network/dapp-kit-vitest-config`
