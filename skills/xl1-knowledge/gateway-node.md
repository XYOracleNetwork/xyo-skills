# Node Gateway

How to construct an XL1 gateway in a non-browser environment — backend services, indexers, CLIs, scheduled jobs, tests, and headless verification of dApps.

**Scope:** environment-specific *construction*. Once you have a gateway, the chain reads, transaction methods, and datalake access work the same as in any other environment — see [Gateway](gateway.md) for the API surface and cross-environment recipes.

**Key npm package:** `@xyo-network/xl1-sdk` — import everything on this page
from its root barrel: `GatewayBuilder` and its `GatewaySession` type,
`generateXyoBaseWalletFromPhrase`, `DefaultNetworks`, `NetworkDataLakeUrls`, the
`XyoGateway` / `XyoGatewayRunner` types and `XyoGatewayMoniker` (re-exported
from `@xyo-network/xl1-protocol`), `getRestGateway` / `getRestGatewayRunner`, and
the `basicRemoteViewerLocator` escape hatch. Its subpaths
(`@xyo-network/xl1-sdk/protocol-sdk`, `/providers`, `/gateway`) carry the same
symbols; prefer the root barrel (see [Development on XL1](development.md)).

---

## GatewayBuilder — the canonical Node entry point

`GatewayBuilder` is a fluent builder that hides the locator, provider-factory, and transport plumbing. It is the recommended way to construct a gateway in any non-browser context. Two terminal calls:

- `.build()` — takes **no arguments** and returns an `XyoGateway` (read-only).
- `.buildRunner()` — returns an `XyoGatewayRunner` (write-capable). Requires a signing origin to have been set first.

Each has a session variant — `.buildSession()` / `.buildRunnerSession()` — that also returns an owner able to stop the gateway (see [Gateway sessions](#gateway-sessions--buildsession--buildrunnersession)).

The same builder works for all of them — the difference is which terminal call you make, and whether a signing origin was configured.

> **Changed in 5.0.** `build(signer)` no longer exists. A pre-built signer is never injected; instead you declare a *signing origin* with one of `.signerFactory()` › `.account()` › `.signerTransport()` (that is also the precedence order if more than one is set) and then call `.buildRunner()`. Passing an `AccountInstance` straight to `.account()` is now the canonical path — no `buildSimpleXyoSigner` wrap required.

### Read-only gateway

```ts
import {
  createRestDataLakeViewer, DefaultNetworks, GatewayBuilder, NetworkDataLakeUrls, type XyoGateway,
} from '@xyo-network/xl1-sdk'

const id = 'sequence' // or 'mainnet' / 'local'
const network = DefaultNetworks.find((n) => n.id === id)
if (!network) throw new Error(`Unknown network "${id}"`)

const lakeUrl = NetworkDataLakeUrls[id]
const dataLake = await createRestDataLakeViewer(lakeUrl)

// The gateway binding is the same single endpoint. It feeds `connection.storage`
// only — `payloadsByHash` and `transaction.byHash` stay on the gateway store.
const gateway: XyoGateway = await new GatewayBuilder()
  .name(id)
  .rpcUrl(`${network.url}/rpc`)
  .additionalConnections({
    'rest-data-lake': { type: 'rest', baseUrl: lakeUrl },
  })
  .additionalProviderBindings({
    DataLakeRunner: { connection: 'rest-data-lake' },
    DataLakeViewer: { connection: 'rest-data-lake' },
  })
  .build()
// dataLake.get(hashes) reads off-chain bodies. The gateway binding does not.
```

This is the right path for: chain walks, indexers, archival jobs, dashboards, ETL, server-rendered pages, monitoring scripts.

### Write-capable gateway (runner)

`.buildRunner()` needs a signing origin. The seed-phrase derivation from [Identity & Wallets](identity.md) returns an `AccountInstance` — hand it straight to `.account()`.

```ts
import {
  createRestDataLakeRunner, DefaultNetworks, GatewayBuilder, generateXyoBaseWalletFromPhrase, NetworkDataLakeUrls,
  type XyoGatewayRunner,
} from '@xyo-network/xl1-sdk'

const id = 'sequence'
const network = DefaultNetworks.find((n) => n.id === id)
if (!network) throw new Error(`Unknown network "${id}"`)

const baseWallet = await generateXyoBaseWalletFromPhrase(process.env.SEED_PHRASE!)
const account = await baseWallet.derivePath('0')
const lakeUrl = NetworkDataLakeUrls[id]
const dataLake = await createRestDataLakeRunner(lakeUrl)

const runner: XyoGatewayRunner = await new GatewayBuilder()
  .name(id)
  .rpcUrl(`${network.url}/rpc`)
  .additionalConnections({
    'rest-data-lake': { type: 'rest', baseUrl: lakeUrl },
  })
  .additionalProviderBindings({
    DataLakeRunner: { connection: 'rest-data-lake' },
    DataLakeViewer: { connection: 'rest-data-lake' },
  })
  .account(account)
  .buildRunner()
// dataLake.insert(payloads) writes this lake directly. A bound DataLakeRunner
// also receives the runner's pre-broadcast content write.
```

The result is a full `XyoGatewayRunner` — `addPayloadsToChain`, `send`, `sendMany`, and `confirmSubmittedTransaction` are all available. See [Gateway — Submitting Transactions](gateway.md#submitting-transactions) for the call surface.

**Always derive through `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')`.** This is the same derivation path MetaMask and the XYO browser extension use, so a single seed phrase produces the same address across every environment. `runner.signer.address()` will match `account.address` and the address an end user sees in their wallet on the same seed. If you bypass these helpers, addresses will not line up across browser and headless contexts. See [Identity & Wallets](identity.md) for the full rationale.

**Choosing a signing origin.** `.account()` covers the ordinary case: the process owns the key. The other two exist for callers that do not own a plain `AccountInstance` — `.signerFactory(factory)` registers a custom signer provider (hardware, composed, or a test double), and `.signerTransport(transport)` points at a remote signer over RPC (for example an injected page whose gateway carries a signer transport). `buildSimpleXyoSigner(context, account)` still exists for code that genuinely needs a standalone `XyoSigner` instance, but it is no longer part of building a runner. `buildSimpleXyoSignerV2` is a deprecated alias of it.

`.buildRunner()` throws if none of `.signerFactory()`, `.account()`, or `.signerTransport()` was set.

### Gateway sessions — `buildSession()` / `buildRunnerSession()`

`.build()` and `.buildRunner()` hand back the gateway *without retaining an owner for its provider graph*: nothing you hold can release the transports and providers behind it. When the process has to end cleanly — CLIs, scheduled jobs, test suites, servers that handle `SIGTERM` — build a session instead:

- `.buildSession()` → `GatewaySession<XyoGateway>`
- `.buildRunnerSession()` → `GatewaySession<XyoGatewayRunner>` (same signing-origin requirement as `.buildRunner()`)

A `GatewaySession` is a frozen `{ gateway, stop() }`. `stop()` cancels in-flight requests, releases every provider in reverse creation order, and is idempotent — concurrent and repeated calls share one release. After it resolves, calls through `session.gateway` reject. If resolving the gateway fails, the session variants release the providers already created before rethrowing.

```ts
import { GatewayBuilder } from '@xyo-network/xl1-sdk'

const session = await new GatewayBuilder()
  .rpcUrl(`${network.url}/rpc`)
  .account(account)
  .buildRunnerSession()
try {
  const [txHash] = await session.gateway.addPayloadsToChain([], appPayloads)
  await session.gateway.confirmSubmittedTransaction(txHash, { attempts: 30, delay: 10_000 })
} finally {
  await session.stop()
}
```

In a long-running service, build one session at startup, use `session.gateway` everywhere, and call `session.stop()` from the shutdown handler (see [Caching](#caching)).

### Builder reference

| Method | Purpose |
|--------|---------|
| `.rpcUrl(url)` | HTTP transport — point at a gateway RPC endpoint |
| `.postMessage(networkId, sessionId)` | PostMessage transport — for browser wallet ↔ dApp wiring (rarely used in Node) |
| `.additionalConnections(connections)` | Named connection profiles merged into the locator. A data lake is a `rest` connection, not a gateway URL field |
| `.additionalProviderBindings(bindings)` | Locator bindings. Bind `DataLakeViewer` and `DataLakeRunner` to that `rest` connection |
| `.dataLakeEndpoint(url)` | **Deprecated, removed in 6.0.** 5.x adapter that binds `DataLakeViewer` and `DataLakeRunner` to one `rest` connection named `rest-data-lake`. Same effect as the two methods above. Backs `connection.storage` and the runner's pre-broadcast write. Viewer reads never consult it — fetch off-chain bodies with `createRestDataLakeViewer(url).get(hashes)` |
| `.name(name)` | Diagnostic name for the gateway and its provider locator (default `'gateway-client'`). It does **not** select the network — `.rpcUrl()` does |
| `.validators(validators)` | Custom block validators |
| `.additionalProviders(factories)` | Extra `CreatableProviderFactory` entries (read path) |
| `.additionalRunnerProviders(factories)` | Extra `CreatableProviderFactory` entries (write path) |
| `.account(account)` | Signing origin — an owned `AccountInstance` (the usual choice) |
| `.signerFactory(factory)` | Signing origin — a custom signer provider factory |
| `.signerTransport(transport)` | Signing origin — an RPC transport to a remote signer |
| `.logger(logger)` | Logger passed through to the locator |
| `.build()` | Resolve a read-only `XyoGateway` (no arguments) |
| `.buildRunner()` | Resolve a write-capable `XyoGatewayRunner` |
| `.buildSession()` | Resolve a read-only gateway with its owner — `GatewaySession<XyoGateway>` |
| `.buildRunnerSession()` | Resolve a write-capable gateway with its owner — `GatewaySession<XyoGatewayRunner>` |

All four terminal calls throw if neither `.rpcUrl()` nor `.postMessage()` was set. `buildRunner()` and `buildRunnerSession()` additionally throw if no signing origin was configured.

---

## REST/S3 gateway — reading from the static layout

When the chain data is published to a static REST/S3 layout (finalized blocks,
index, chain state — see [Datalakes](datalakes.md) and the `xl1-s3-providers`
package), you can build a gateway that reads directly from those buckets instead
of talking to a live RPC gateway. Use `getRestGateway` / `getRestGatewayRunner`
from `@xyo-network/xl1-sdk`. The public networks' REST roots are listed in
[Gateway — Networks](gateway.md#networks) (`https://<gateway name>.xyo.space`):

```ts
import { getRestGateway, getRestGatewayRunner } from '@xyo-network/xl1-sdk'

// Read-only: pass an endpoint string (read buckets derived as
// blocks.<domain>, state.<domain>, indexes.<domain>), or an explicit
// RestGatewayConfig with per-bucket readUrls.
const gateway = await getRestGateway('https://sequence.xyo.space')

// Write-capable: reads over REST/S3, submits over RPC. Same consumer-facing
// write surface as GatewayBuilder.buildRunner().
const runner = await getRestGatewayRunner({
  endpoint: 'https://sequence.xyo.space',
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

A common pattern is a lazy module-level promise. Caching a session rather than a bare gateway also gives the shutdown path something to stop:

```ts
import {
  GatewayBuilder, type GatewaySession, generateXyoBaseWalletFromPhrase, NetworkDataLakeUrls,
  type XyoGatewayRunner,
} from '@xyo-network/xl1-sdk'

let sessionPromise: Promise<GatewaySession<XyoGatewayRunner>> | undefined

function getSession(): Promise<GatewaySession<XyoGatewayRunner>> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const baseWallet = await generateXyoBaseWalletFromPhrase(process.env.SEED_PHRASE!)
      const account = await baseWallet.derivePath('0')
      return await new GatewayBuilder()
        .name('sequence')
        .rpcUrl(`${network.url}/rpc`)
        .additionalConnections({
          'rest-data-lake': { type: 'rest', baseUrl: NetworkDataLakeUrls.sequence },
        })
        .additionalProviderBindings({
          DataLakeRunner: { connection: 'rest-data-lake' },
          DataLakeViewer: { connection: 'rest-data-lake' },
        })
        .account(account)
        .buildRunnerSession()
    })()
  }
  return sessionPromise
}

export async function getGateway(): Promise<XyoGatewayRunner> {
  return (await getSession()).gateway
}

export async function stopGateway(): Promise<void> {
  await (await sessionPromise)?.stop()
}
```

Cache the **promise**, not the resolved value, so concurrent first callers share one construction. Call `stopGateway()` from the process's shutdown handler (`SIGTERM`, test `afterAll`).

---

## Network Selection

There is no React prop equivalent: resolve the network ID to its URLs yourself and pass those to the builder. The network is whatever `.rpcUrl()` points at; a data lake, when you want one on the gateway, is a locator binding (or, through 5.x, the deprecated `.dataLakeEndpoint()`, removed in 6.0). `.name()` is only a diagnostic label. The IDs and their endpoints are documented in [Gateway — Networks](gateway.md#networks). Drive selection from an environment variable in production:

```ts
const id = process.env.XL1_NETWORK ?? 'sequence'
const network = DefaultNetworks.find((n) => n.id === id)
if (!network) throw new Error(`Unknown network "${id}"`)
// .rpcUrl(`${network.url}/rpc`)
// .additionalConnections({ 'rest-data-lake': { type: 'rest', baseUrl: NetworkDataLakeUrls[id] } })
// .additionalProviderBindings({ DataLakeViewer: { connection: 'rest-data-lake' }, DataLakeRunner: { connection: 'rest-data-lake' } })
```

---

## Headless dApp Verification

The runner path above is the foundation for verifying any XL1 dApp without a browser — even dApps whose primary UX runs through the Chrome wallet extension. Because the wallet is just a particular `XyoSigner` implementation, swapping it for a seed-phrase signer in a Node script reproduces the dApp's chain interactions end-to-end. See [Headless dApp Verification](../xl1-testing/headless-testnet-verification.md) for the full pattern (when to use it, how to structure the script, common pitfalls).

---

## Advanced — direct locator access

If you need control beyond what the builder exposes (custom locator graphs, manual provider wiring, instrumented transports), you can call `basicRemoteViewerLocator` directly:

```ts
import {
  basicRemoteViewerLocator, NetworkDataLakeUrls, type XyoGateway, XyoGatewayMoniker,
} from '@xyo-network/xl1-sdk'

const locator = await basicRemoteViewerLocator(
  id,
  { protocol: 'http', url: `${network.url}/rpc` },
  undefined,
  {
    additionalConnections: {
      'rest-data-lake': { type: 'rest', baseUrl: NetworkDataLakeUrls[id] },
    },
    additionalProviderBindings: {
      DataLakeRunner: { connection: 'rest-data-lake' },
      DataLakeViewer: { connection: 'rest-data-lake' },
    },
  },
)
const gateway = await locator.getInstance<XyoGateway>(XyoGatewayMoniker)
```

The third argument, `dataLakeEndpoint`, is the same 5.x adapter as `GatewayBuilder.dataLakeEndpoint` and is removed in 6.0. Pass `undefined` and set the locator bindings instead. `createRestDataLakeViewer(url)` / `createRestDataLakeRunner(url)` build that single-endpoint lake when you want the client directly.

This is an escape hatch — prefer `GatewayBuilder` unless you have a concrete reason to drop down. Anything `GatewayBuilder` exposes (additional providers, validators) should be set through builder methods first. The first argument is the same diagnostic name `.name()` sets, not a network selector. A locator you build yourself is yours to release: `releaseProviderFactoryLocator(locator)` is what a session's `stop()` calls.

---

## Cross-References

- [Gateway](gateway.md) — generic concepts, viewer API, networks, transports, anti-patterns
- [Datalakes](datalakes.md) — `createRestDataLakeRunner` / `createRestDataLakeViewer` are the same in Node as in the browser
- [XL1 Identity & Wallets](identity.md) — canonical backend wallet pattern (`generateXyoBaseWalletFromPhrase` + `derivePath('<index>')`) and cross-environment compatibility
- [Identity & Signing (XYO)](../xyo-knowledge/identity.md) — lower-level `Account` / `HDWallet` primitives
- [Headless dApp Verification](../xl1-testing/headless-testnet-verification.md) — verifying browser dApps end-to-end without a browser
