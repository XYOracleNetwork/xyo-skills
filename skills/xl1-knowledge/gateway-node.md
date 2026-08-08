# Node Gateway

How to construct an XL1 gateway in a non-browser environment — backend services, indexers, CLIs, scheduled jobs, tests, and headless verification of dApps.

**Scope:** environment-specific *construction*. Once you have a gateway, the chain reads, transaction methods, and datalake access work the same as in any other environment — see [Gateway](gateway.md) for the API surface and cross-environment recipes.

**Key npm packages** (all subpaths below are exports of the two monoliths, and
all are re-exported from the `@xyo-network/xl1-sdk` root barrel):
- `@xyo-network/xl1-sdk` — root barrel; re-exports `GatewayBuilder`, `buildSimpleXyoSigner`, `DefaultNetworks`, `NetworkDataLakeUrls`, and everything below
- `@xyo-network/xl1-sdk/protocol-sdk` — `generateXyoBaseWalletFromPhrase` (the subpath is the most precise import; the root barrel also surfaces it)
- `@xyo-network/xl1-protocol/protocol-lib` — `XyoGatewayMoniker`, gateway types (only needed if you drop down to the locator)
- `@xyo-network/xl1-sdk/providers` — `basicRemoteViewerLocator` (escape hatch only)

---

## GatewayBuilder — the canonical Node entry point

`GatewayBuilder` is a fluent builder that hides the locator, provider-factory, and transport plumbing. It is the recommended way to construct a gateway in any non-browser context. Two terminal calls:

- `.build()` — takes **no arguments** and returns an `XyoGateway` (read-only).
- `.buildRunner()` — returns an `XyoGatewayRunner` (write-capable). Requires a signing origin to have been set first.

The same builder works for both — the difference is which terminal call you make, and whether a signing origin was configured.

> **Changed in 5.0.** `build(signer)` no longer exists. A pre-built signer is never injected; instead you declare a *signing origin* with one of `.signerFactory()` › `.account()` › `.signerTransport()` (that is also the precedence order if more than one is set) and then call `.buildRunner()`. Passing an `AccountInstance` straight to `.account()` is now the canonical path — no `buildSimpleXyoSigner` wrap required.

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

`.buildRunner()` needs a signing origin. The seed-phrase derivation from [Identity & Wallets](identity.md) returns an `AccountInstance` — hand it straight to `.account()`.

```ts
import {
  DefaultNetworks, GatewayBuilder, NetworkDataLakeUrls,
} from '@xyo-network/xl1-sdk'
import { generateXyoBaseWalletFromPhrase } from '@xyo-network/xl1-sdk/protocol-sdk'
import { type XyoGatewayRunner } from '@xyo-network/xl1-protocol/protocol-lib'

const id = 'sequence'
const network = DefaultNetworks.find((n) => n.id === id)
if (!network) throw new Error(`Unknown network "${id}"`)

const baseWallet = await generateXyoBaseWalletFromPhrase(process.env.SEED_PHRASE!)
const account = await baseWallet.derivePath('0')

const runner: XyoGatewayRunner = await new GatewayBuilder()
  .name(id)
  .rpcUrl(`${network.url}/rpc`)
  .dataLakeEndpoint(NetworkDataLakeUrls[id])
  .account(account)
  .buildRunner()
```

The result is a full `XyoGatewayRunner` — `addPayloadsToChain`, `send`, `sendMany`, and `confirmSubmittedTransaction` are all available. See [Gateway — Submitting Transactions](gateway.md#submitting-transactions) for the call surface.

**Always derive through `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')`.** This is the same derivation path MetaMask and the XYO browser extension use, so a single seed phrase produces the same address across every environment. `runner.signer.address()` will match `account.address` and the address an end user sees in their wallet on the same seed. If you bypass these helpers, addresses will not line up across browser and headless contexts. See [Identity & Wallets](identity.md) for the full rationale.

**Choosing a signing origin.** `.account()` covers the ordinary case: the process owns the key. The other two exist for callers that do not own a plain `AccountInstance` — `.signerFactory(factory)` registers a custom signer provider (hardware, composed, or a test double), and `.signerTransport(transport)` points at a remote signer over RPC (for example an injected page whose gateway carries a signer transport). `buildSimpleXyoSigner(context, account)` still exists for code that genuinely needs a standalone `XyoSigner` instance, but it is no longer part of building a runner. `buildSimpleXyoSignerV2` is a deprecated alias of it.

`.buildRunner()` throws if none of `.signerFactory()`, `.account()`, or `.signerTransport()` was set.

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
| `.account(account)` | Signing origin — an owned `AccountInstance` (the usual choice) |
| `.signerFactory(factory)` | Signing origin — a custom signer provider factory |
| `.signerTransport(transport)` | Signing origin — an RPC transport to a remote signer |
| `.logger(logger)` | Logger passed through to the locator |
| `.build()` | Resolve a read-only `XyoGateway` (no arguments) |
| `.buildRunner()` | Resolve a write-capable `XyoGatewayRunner` |

`build()` and `buildRunner()` both throw if neither `.rpcUrl()` nor `.postMessage()` was set. `buildRunner()` additionally throws if no signing origin was configured.

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
// write surface as GatewayBuilder.buildRunner().
const runner = await getRestGatewayRunner({
  endpoint: 'https://cdn.xl1.example',
  rpcUrl: `${network.url}/rpc`,
  signerAccount: account,
})
```

Prefer this over `GatewayBuilder` when reads should come from published static
index/step-summary files (fewer, cacheable GETs) rather than per-request RPC
calls. Signing works the same way as on the builder — supply exactly one of
`signerAccount`, `signerFactory`, or `signerTransport`. There is no `signer`
key: a pre-built signer instance is never injected.

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
      return new GatewayBuilder()
        .name('sequence')
        .rpcUrl(`${network.url}/rpc`)
        .dataLakeEndpoint(NetworkDataLakeUrls.sequence)
        .account(account)
        .buildRunner()
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
  { protocol: 'http', url: `${network.url}/rpc` },
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
