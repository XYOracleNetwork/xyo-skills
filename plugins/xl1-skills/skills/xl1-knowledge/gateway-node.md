# Node Gateway

How to construct an XL1 gateway in a non-browser environment — backend services, indexers, CLIs, scheduled jobs, tests.

**Scope:** environment-specific *construction*. Once you have a gateway, the chain reads, transaction methods, and datalake access work the same as in any other environment — see [Gateway](gateway.md) for the API surface and [Gateway Usage](../xl1-patterns/gateway-usage.md) for cross-environment recipes.

**Key npm packages:**
- `@xyo-network/xl1-providers` — `basicRemoteViewerLocator`, environment-specific provider bundles
- `@xyo-network/xl1-protocol-lib` — `XyoGatewayMoniker`, gateway types
- `@xyo-network/xl1-network-model` — `DefaultNetworks`, `NetworkDataLakeUrls`

---

## Read-Only Gateway

Use `basicRemoteViewerLocator` from `@xyo-network/xl1-providers` to wire an `HttpRpcTransport`-backed locator, then resolve the gateway by moniker:

```ts
import { DefaultNetworks, NetworkDataLakeUrls } from '@xyo-network/xl1-network-model'
import { XyoGatewayMoniker, type XyoGateway } from '@xyo-network/xl1-protocol-lib'
import { basicRemoteViewerLocator } from '@xyo-network/xl1-providers'

const id = 'sequence' // or 'mainnet' / 'local'
const network = DefaultNetworks.find((n) => n.id === id)
if (!network) throw new Error(`Unknown network "${id}"`)

const locator = await basicRemoteViewerLocator(
  id,
  { rpc: { protocol: 'http', url: `${network.url}/rpc` } },
  NetworkDataLakeUrls[id],
)
const gateway = await locator.getInstance<XyoGateway>(XyoGatewayMoniker)
```

The result is typed `XyoGateway` — read-only. No signer is wired in, so `addPayloadsToChain`, `send`, and `sendMany` are **not** available. All `connection.viewer.*` reads documented in [Gateway — Viewer API](gateway.md) work normally.

This is the right path for: chain walks, indexers, archival jobs, dashboards, ETL, server-rendered pages, monitoring scripts.

---

## Caching

`basicRemoteViewerLocator` does non-trivial async setup (resolves the locator graph, builds the transport, creates the viewer chain). Construct the gateway once per process and reuse it — do not rebuild per request.

A common pattern is a lazy module-level promise:

```ts
let gatewayPromise: Promise<XyoGateway> | undefined

export async function getGateway(): Promise<XyoGateway> {
  if (!gatewayPromise) {
    gatewayPromise = (async () => {
      // ...construction as above
      return gateway
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

## Write Path (not yet documented)

Constructing an `XyoGatewayRunner` in Node — wiring an in-memory signer (seed phrase via `HDWallet.fromPhrase`, raw key via `Account.create`) into a write-capable gateway — is a real and supported flow but is not yet captured here. The identity primitives are documented in [Identity & Signing](../xyo-knowledge/identity.md). The bridge from those primitives into a Node-side runner gateway needs a verified working sample before it lands in this file.

---

## Cross-References

- [Gateway](gateway.md) — generic concepts, viewer API, networks, transports, anti-patterns
- [Gateway Usage](../xl1-patterns/gateway-usage.md) — cross-environment recipes (read latest block, capability detection, datalake reads)
- [Datalakes](datalakes.md) — `createRestDataLakeRunner` / `createRestDataLakeViewer` are the same in Node as in the browser
- [Identity & Signing](../xyo-knowledge/identity.md) — `Account`, `HDWallet`, mnemonic / seed-phrase construction
