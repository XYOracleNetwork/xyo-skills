# Node Gateway

How to construct an XL1 gateway in a non-browser environment — backend services, indexers, CLIs, scheduled jobs, tests, and headless verification of dApps.

**Scope:** environment-specific *construction*. Once you have a gateway, the chain reads, transaction methods, and datalake access work the same as in any other environment — see [Gateway](gateway.md) for the API surface and cross-environment recipes.

**Key npm packages** (all subpaths below are exports of the two monoliths, and
all are re-exported from the `@xyo-network/xl1-sdk` root barrel):
- `@xyo-network/xl1-sdk` — root barrel; re-exports `GatewayBuilder`, `buildSimpleXyoSignerV2`, `DefaultNetworks`, `NetworkDataLakeUrls`, and everything below
- `@xyo-network/xl1-sdk/protocol-sdk` — `ConfigZod`, `generateXyoBaseWalletFromPhrase` (the subpath is the most precise import; the root barrel also surfaces these)
- `@xyo-network/xl1-protocol/protocol-lib` — `XyoGatewayMoniker`, gateway types (only needed if you drop down to the locator)
- `@xyo-network/xl1-sdk/providers` — `basicRemoteViewerLocator` (escape hatch only)

---

## GatewayBuilder — the canonical Node entry point

`GatewayBuilder` is a fluent builder that hides the locator, provider-factory, and transport plumbing. It is the recommended way to construct a gateway in any non-browser context. Two terminal calls:

- `.build()` returns an `XyoGateway` (read-only).
- `.build(signer)` returns an `XyoGatewayRunner` (write-capable).

The same builder works for both — the only difference is whether you pass a signer.

### Read-only gateway

```ts
import {
  DefaultNetworks, GatewayBuilder, NetworkDataLakeUrls,
} from '@xyo-network/xl1-sdk'
import { type XyoGateway } from '@xyo-network/xl1-protocol/protocol-lib'

const id = 'sequence' // or 'mainnet' / 'local'
const network = DefaultNetworks.find((n) => n.id === id)
if (!network) throw new Error(`Unknown network "${id}"`)

const gateway: XyoGateway = await new GatewayBuilder()
  .name(id)
  .rpcUrl(`${network.url}/rpc`)
  .dataLakeEndpoint(NetworkDataLakeUrls[id])
  .build()
```

This is the right path for: chain walks, indexers, archival jobs, dashboards, ETL, server-rendered pages, monitoring scripts.

### Write-capable gateway (runner)

`GatewayBuilder.build(signer)` requires an `XyoSigner`. The seed-phrase derivation from [Identity & Wallets](identity.md) returns an `AccountInstance` — wrap it via `buildSimpleXyoSignerV2` to produce the signer the runner needs.

```ts
import {
  buildSimpleXyoSignerV2, DefaultNetworks, GatewayBuilder, NetworkDataLakeUrls,
} from '@xyo-network/xl1-sdk'
import { ConfigZod, generateXyoBaseWalletFromPhrase } from '@xyo-network/xl1-sdk/protocol-sdk'
import { type XyoGatewayRunner } from '@xyo-network/xl1-protocol/protocol-lib'

const id = 'sequence'
const network = DefaultNetworks.find((n) => n.id === id)
if (!network) throw new Error(`Unknown network "${id}"`)

const baseWallet = await generateXyoBaseWalletFromPhrase(process.env.SEED_PHRASE!)
const account = await baseWallet.derivePath('0')

const signer = await buildSimpleXyoSignerV2(
  { config: ConfigZod.parse({}), caches: {}, singletons: {} },
  account,
)

const runner: XyoGatewayRunner = await new GatewayBuilder()
  .name(id)
  .rpcUrl(`${network.url}/rpc`)
  .dataLakeEndpoint(NetworkDataLakeUrls[id])
  .build(signer)
```

The result is a full `XyoGatewayRunner` — `addPayloadsToChain`, `send`, `sendMany`, and `confirmSubmittedTransaction` are all available. See [Gateway — Submitting Transactions](gateway.md#submitting-transactions) for the call surface.

**Always derive through `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')`** before wrapping with `buildSimpleXyoSignerV2`. This is the same derivation path MetaMask and the XYO browser extension use, so a single seed phrase produces the same address across every environment. `runner.signer.address()` will match `account.address` and the address an end user sees in their wallet on the same seed. If you bypass these helpers, addresses will not line up across browser and headless contexts. See [Identity & Wallets](identity.md) for the full rationale.

**Why `buildSimpleXyoSignerV2`?** `GatewayBuilder` accepts any `XyoSigner` implementation. `buildSimpleXyoSignerV2` is the canonical adapter from `AccountInstance` (what the seed-phrase helpers return) to `XyoSigner` — it builds a `SimpleXyoSigner` through a `ProviderFactoryLocator` so the signer participates in the same provider graph the runner uses. The `{ config, caches, singletons }` argument is the minimum `BaseConfigContext` the locator needs; `ConfigZod.parse({})` produces the empty defaults.

### Builder reference

| Method | Purpose |
|--------|---------|
| `.rpcUrl(url)` | HTTP transport — point at a gateway RPC endpoint |
| `.postMessage(networkId, sessionId)` | PostMessage transport — for browser wallet ↔ dApp wiring (rarely used in Node) |
| `.dataLakeEndpoint(url)` | Optional datalake URL for resolving off-chain payloads |
| `.name(name)` | Actor name used for diagnostics (default `'gateway-client'`) |
| `.validators(validators)` | Custom block validators |
| `.additionalProviders(factories)` | Extra `CreatableProviderFactory` entries (read path) |
| `.additionalRunnerProviders(factories)` | Extra `CreatableProviderFactory` entries (write path) |
| `.build()` | Resolve a read-only `XyoGateway` |
| `.build(signer)` | Resolve a write-capable `XyoGatewayRunner` |

`build()` throws if neither `.rpcUrl()` nor `.postMessage()` was set.

---

## REST/S3 gateway — reading from the static layout

When the chain data is published to a static REST/S3 layout (finalized blocks,
index, chain state — see [Datalakes](datalakes.md) and the `xl1-s3-providers`
package), you can build a gateway that reads directly from those buckets instead
of talking to a live RPC gateway. Use `getRestGateway` / `getRestGatewayRunner`
from `@xyo-network/xl1-sdk/gateway` (also on the root barrel):

```ts
import { getRestGateway, getRestGatewayRunner } from '@xyo-network/xl1-sdk'

// Read-only: pass an endpoint string (read buckets derived as
// blocks.<domain>, state.<domain>, indexes.<domain>), or an explicit
// RestGatewayConfig with per-bucket readUrls.
const gateway = await getRestGateway('https://cdn.xl1.example')

// Write-capable: reads over REST/S3, submits over RPC. Same consumer-facing
// write surface as GatewayBuilder.build(signer).
const runner = await getRestGatewayRunner({
  endpoint: 'https://cdn.xl1.example',
  rpcUrl: `${network.url}/rpc`,
  signer,
})
```

Prefer this over `GatewayBuilder` when reads should come from published static
index/step-summary files (fewer, cacheable GETs) rather than per-request RPC
calls. `getRestGatewayRunner` also accepts `signerFactory` or `signerTransport`
instead of an owned `signer` for injected/remote-signer setups.

---

## Caching

`GatewayBuilder.build()` does non-trivial async setup (resolves the locator graph, builds the transport, creates the viewer chain). Construct the gateway once per process and reuse it — do not rebuild per request.

A common pattern is a lazy module-level promise:

```ts
let gatewayPromise: Promise<XyoGatewayRunner> | undefined

export function getGateway(): Promise<XyoGatewayRunner> {
  if (!gatewayPromise) {
    gatewayPromise = (async () => {
      const baseWallet = await generateXyoBaseWalletFromPhrase(process.env.SEED_PHRASE!)
      const account = await baseWallet.derivePath('0')
      const signer = await buildSimpleXyoSignerV2(
        { config: ConfigZod.parse({}), caches: {}, singletons: {} },
        account,
      )
      return new GatewayBuilder()
        .name('sequence')
        .rpcUrl(`${network.url}/rpc`)
        .dataLakeEndpoint(NetworkDataLakeUrls.sequence)
        .build(signer)
    })()
  }
  return gatewayPromise
}
```

Cache the **promise**, not the resolved value, so concurrent first callers share one construction.

---

## Network Selection

Pass the network ID directly — there is no React prop equivalent. The IDs and their endpoints are documented in [Gateway — Networks](gateway.md). Drive selection from an environment variable in production:

```ts
const id = process.env.XL1_NETWORK ?? 'sequence'
```

---

## Headless dApp Verification

The runner path above is the foundation for verifying any XL1 dApp without a browser — even dApps whose primary UX runs through the Chrome wallet extension. Because the wallet is just a particular `XyoSigner` implementation, swapping it for a seed-phrase signer in a Node script reproduces the dApp's chain interactions end-to-end. See [Headless dApp Verification](../xl1-testing/headless-testnet-verification.md) for the full pattern (when to use it, how to structure the script, common pitfalls).

---

## Advanced — direct locator access

If you need control beyond what the builder exposes (custom locator graphs, manual provider wiring, instrumented transports), you can call `basicRemoteViewerLocator` directly:

```ts
import { XyoGatewayMoniker, type XyoGateway } from '@xyo-network/xl1-protocol/protocol-lib'
import { basicRemoteViewerLocator } from '@xyo-network/xl1-sdk/providers'

const locator = await basicRemoteViewerLocator(
  id,
  { rpc: { protocol: 'http', url: `${network.url}/rpc` } },
  NetworkDataLakeUrls[id],
)
const gateway = await locator.getInstance<XyoGateway>(XyoGatewayMoniker)
```

This is an escape hatch — prefer `GatewayBuilder` unless you have a concrete reason to drop down. Anything `GatewayBuilder` exposes (additional providers, validators) should be set through builder methods first.

---

## Cross-References

- [Gateway](gateway.md) — generic concepts, viewer API, networks, transports, anti-patterns
- [Datalakes](datalakes.md) — `createRestDataLakeRunner` / `createRestDataLakeViewer` are the same in Node as in the browser
- [XL1 Identity & Wallets](identity.md) — canonical backend wallet pattern (`generateXyoBaseWalletFromPhrase` + `derivePath('<index>')`) and cross-environment compatibility
- [Identity & Signing (XYO)](../xyo-knowledge/identity.md) — lower-level `Account` / `HDWallet` primitives
- [Headless dApp Verification](../xl1-testing/headless-testnet-verification.md) — verifying browser dApps end-to-end without a browser
