# Browser Gateway

How to construct an XL1 gateway in a browser — React dApps, plain websites, workers, service workers, and browser extensions. `@xyo-network/xl1-browser-system` is the preferred integration substrate for every one of those realms, and **REST is the preferred transport** when configuring it. The XL1 browser wallet remains the mechanism that publishes a write-capable gateway to the page; this file covers the browser system, the wallet, the React providers that wrap both, and the hook dApps use to reach the gateway.

**Scope:** environment-specific *construction* of a browser-side gateway. Once you have a gateway, the chain reads, transaction methods, and datalake access work the same as in any other environment — see [Gateway](gateway.md) for the API surface and [Gateway](gateway.md) for cross-environment recipes. For browser UX patterns built on top of the gateway (wallet connection UI, display conventions, capability-aware components), see [Browser UX](../xl1-patterns/browser-ux.md).

For the Node / server-side equivalent, see [Node Gateway](gateway-node.md). For backend identity creation (Node services, indexers, CLIs, headless verification scripts), use the canonical seed-phrase pattern in [XL1 Identity & Wallets](identity.md) — `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')` for the account, which goes straight to `GatewayBuilder.account(...)`. The lower-level XYO primitives (`Account.create({ mnemonic })`, `HDWallet.fromPhrase`) in [Identity & Signing](../xyo-knowledge/identity.md) skip BIP44 derivation and produce addresses that do not match the browser wallet on the same seed — use those only for non-XL1 XYO contexts.

**Key npm packages:**
- `@xyo-network/xl1-browser-system` — Config-driven XL1 provider systems for browser realms (page, worker, service worker, extension background). The integration substrate every browser gateway resolves through.
- `@xyo-network/xl1-react-client-sdk` — Gateway providers, wallet connection, and client hooks for React dApps. This is the package React apps build against; its in-page gateways are launched through `xl1-browser-system`.
- `@xyo-network/xl1-blockies` — Address icon generation

The older `@xyo-network/react-chain-*` family is the previous generation. Most of
it was folded into `xl1-react-client-sdk`: `react-chain-transaction`,
`react-chain-stake`, `react-chain-boundwitness`, and `react-chain-blockchain` are
**not published** at all, and the two that remain (`react-chain-network`,
`react-chain-blockies`) are stuck a major behind at `4.0.5` while the current
family is `5.5.3`. Do not add any of them to new work.

**Required peer dependencies for `@xyo-network/xl1-react-client-sdk`:**
The react-chain packages use MUI internally. These peer dependencies must be installed explicitly in your app — pnpm will not hoist them automatically, and the compiler/linter will not catch missing ones. They only surface as `Could not resolve "..."` errors at runtime in the browser.

After installing `@xyo-network/xl1-react-client-sdk`, immediately read its `package.json` from `node_modules` to find the `peerDependencies` it declares (e.g., `@mui/material`, `@emotion/react`, `@emotion/styled`). Install each one at the latest version that satisfies the range declared in that `peerDependencies` field. Do not blindly install the latest major — if the peer range is `">=6 <8"`, pin to the latest within that range (e.g., `pnpm add @mui/material@">=6 <8"`). Then recursively check the installed packages' own peer dependencies (e.g., `@mui/material` requires `@emotion/*`) and install any that are missing.

---

## Integrating XL1 Into a Website

`@xyo-network/xl1-browser-system` is the preferred way to put XL1 into a website. It resolves configuration once, provisions a single XL1 `ProviderFactoryLocator` in the owning realm, and hands every actor that same resolved provider system. Realm lifecycle and transport belong to browser-kit; the XL1 package owns only the provider catalog, the standard actor, and the config helpers.

Pick the entry point by app shape — not by preference:

| App shape | Entry point | Notes |
|-----------|-------------|-------|
| **React dApp** | `InPageGatewaysProvider` + `GatewayProvider` from `@xyo-network/xl1-react-client-sdk` | **Stay on the React providers.** `InPageGatewaysProvider` launches `launchXl1BrowserGatewaySystem` internally, one system per network, and binds page lifecycle for you. Do not hand-roll a browser system alongside them. |
| Plain website (no React) | `launchXl1BrowserGatewaySystem` from `@xyo-network/xl1-browser-system` | Page owns the session until navigation or discard; pair with `bindPageLifecycle` from `@ariestools/browser-kit-page`. |
| Web worker | `launchXl1BrowserGatewaySystem` | Pair with `bindWorkerShutdown` from `@ariestools/browser-kit-worker`. |
| Service worker | `launchXl1BrowserGatewaySystem` inside `ServiceWorkerSystemHost` | The system is reconstructed per worker incarnation; attach every operation to the triggering event lifetime. |
| Browser extension | `launchXl1BrowserGatewaySystem` in the background service worker | Popups, side panels, and content scripts attach through an authorized extension port — they do not resolve a second provider system. |

The realm adapters (`@ariestools/browser-kit-page`, `-worker`, `-service-worker`, `-plugin`) are installed separately; add only the ones the application actually uses.

### REST over RPC

**Configure the browser system for REST unless you have a specific reason not to.** REST reads come from the network's static bucket layout, which is cacheable, CDN-served, and does not put per-read load on a gateway node. RPC reads hit a live gateway endpoint for every call.

REST changes reads only. Mempool submission still goes over the RPC URL, which is why a signed REST system requires `rpcUrl` alongside `endpoint` — constructing one without it throws.

```ts
import { launchXl1BrowserGatewaySystem } from '@xyo-network/xl1-browser-system'

const session = await launchXl1BrowserGatewaySystem({
  endpoint: 'https://mainnet.xyo.space', // REST root — reads
  host: 'page',
  rpcUrl: 'https://api.chain.xyo.network/rpc', // mempool submission — writes
  transport: 'rest',
})

const blockNumber = await session.gateway.connection.viewer?.block.currentBlockNumber()
```

`endpoint` means different things per transport. For `'rest'` it is the bucket root, and `blocks.*`, `state.*`, and `indexes.*` subdomains are derived from it. For `'rpc'` it is the complete RPC URL. Local gateways that publish buckets under one path-based origin rather than those subdomains need `layout: 'path'`:

```ts
const session = await launchXl1BrowserGatewaySystem({
  endpoint: 'https://chain.aries.test:8791',
  host: 'page',
  layout: 'path',
  transport: 'rest',
})
```

Reach for `'rpc'` only when the deployment has no published static layout to read, or when a read must observe unfinalized state that the bucket layout does not carry. Note both trade-offs before choosing it.

### Compile once, launch per realm

`launchXl1BrowserGatewaySystem` is the one-step launcher and the right default. When an application supplies its own actors or provider catalog, split the two phases instead — `compileXl1BrowserSystem` parses config and resolves one provider plan without constructing anything, and `launchCompiledXl1BrowserSystem` turns that plan into a running session:

```ts
import {
  compileXl1BrowserSystem,
  launchCompiledXl1BrowserSystem,
} from '@xyo-network/xl1-browser-system'

const compiled = compileXl1BrowserSystem({ config })
const session = await launchCompiledXl1BrowserSystem({ compiled, host: 'page' })
```

The compiled value keeps the actor catalog and exact provider registrations, so it is an owner-realm artifact rather than structured-clone data. Attached realms receive only browser-kit's descriptor-free manifest and typed proxies.

Always retain the session and stop it when the owning realm goes away. Dropping it leaks the provider system.

### Anti-patterns

| Anti-pattern | Why it fails | Do this instead |
|---|---|---|
| Defaulting a browser system to `transport: 'rpc'` | Every read hits a live gateway node instead of cacheable static buckets, for no gain in a normal read path | `transport: 'rest'`, with `rpcUrl` supplied for writes |
| Launching a browser system next to `InPageGatewaysProvider` in a React app | Two provider systems for the same network, two lifecycles, and gateways that disagree | Use the React providers alone; they already own a browser system per network |
| Building a signed REST system without `rpcUrl` | Throws — REST carries reads, not mempool submission | Pass both `endpoint` and `rpcUrl` |
| Deriving a provider identifier from a class name via `providerCandidateFromClass(MyProvider)` | Production minifiers rewrite constructor names, so the config identifier changes between builds | Pass an explicit stable id: `providerCandidateFromClass(MyProvider, 'com.example.my-provider')` |
| Letting a page drop the session object | The provider system is never stopped | Retain the session; bind the realm's lifecycle helper |

---

## The XL1 Browser Wallet

The XL1 wallet is a Chrome browser extension for interacting with the XYO Layer One blockchain. It manages XL1 tokens, signs transactions, and publishes a write-capable gateway to dApp pages.

- Available on the Chrome Web Store
- Similar UX to MetaMask — extension-based, popup-based signing
- Uses **PostMessage RPC transport** for communication between the dApp page and the wallet extension

For the dApp-facing permission surface — what the wallet will and will not grant, the two publicly supported permission methods, and the hard rule against requesting datalake permissions — see [Wallet — Permissions](../xl1-patterns/wallet.md#permissions).

---

## Choosing Your Provider

React dApps integrate through these providers rather than calling `@xyo-network/xl1-browser-system` directly — `InPageGatewaysProvider` already launches one browser system per network and binds page lifecycle. Two providers from `@xyo-network/xl1-react-client-sdk` publish a gateway to React context:

| Provider | Wallet required? | Read-only fallback | Use when |
|----------|-----------------|-------------------|----------|
| `WalletGatewayProvider` | Yes | No | App strictly requires a wallet for all functionality |
| `GatewayProvider` + `InPageGatewaysProvider` | No | Yes (in-page REST gateway) | App should work read-only without a wallet |

### Wallet-only setup

```tsx
import { WalletGatewayProvider } from '@xyo-network/xl1-react-client-sdk'
import { MainNetwork } from '@xyo-network/xl1-sdk'

function App() {
  return (
    <WalletGatewayProvider gatewayName={MainNetwork.id}>
      <YourDApp />
    </WalletGatewayProvider>
  )
}
```

### Hybrid setup (read-only fallback)

```tsx
import { InPageGatewaysProvider, GatewayProvider } from '@xyo-network/xl1-react-client-sdk'
import { MainNetwork } from '@xyo-network/xl1-sdk'

function App() {
  return (
    <InPageGatewaysProvider transport="rest">
      <GatewayProvider gatewayName={MainNetwork.id}>
        <YourDApp />
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
```

`GatewayProvider` requires `InPageGatewaysProvider` as an ancestor. It merges the in-page gateway and wallet gateway into a single `defaultGateway` — wallet wins when connected, in-page is the fallback.

**Always set `transport="rest"`.** `InPageGatewaysProvider` accepts a
`transport?: 'rpc' | 'rest'` prop selecting how each in-page gateway reads chain
data. It still defaults to `'rpc'` for backward compatibility, so REST is opt-in
and must be passed explicitly:

- `'rest'` — **the best practice.** Reads come from the static REST/S3 layout
  (path-based for the local network via the `localEndpoint` prop; the
  `<gatewayName>.xyo.space` subdomain layout otherwise), served from cacheable
  index and step-summary files. Mempool submission still uses the RPC URL, so
  wallet-gated writes are unaffected.
- `'rpc'` — reads and mempool submission both go over the network's RPC
  endpoint. Every read costs a live gateway call. Use only when the deployment
  publishes no static layout, or a read must observe unfinalized state.

Omitting the prop silently gives you `'rpc'` — this is the single most common
way a dApp ends up on the wrong transport. Related props: `localEndpoint`
(REST root for the local network), `signerFactory`, `signerAccount`, and
`signerTransport` (for in-page or remote signing).

The provider launches every network in `DefaultNetworks` in parallel and keys
successes into `gateways[id]` and failures into `errors[id]`, so one unreachable
network does not block the others.

### gatewayName is required

Without it, `defaultGateway` is always `undefined`. Use `MainNetwork.id` from `@xyo-network/xl1-sdk` (value: `'mainnet'`). Both providers use this name to look up the wallet gateway via `useGatewayFromWallet(gatewayName)`. `GatewayProvider` additionally resolves the in-page fallback gateway from `InPageGatewaysProvider`. When `gatewayName` is omitted, lookups return `undefined`.

---

## Accessing the Gateway

Use `useProvidedGateway()` in any component under a gateway provider:

```tsx
import { useProvidedGateway } from '@xyo-network/xl1-react-client-sdk'

function MyComponent() {
  const { defaultGateway } = useProvidedGateway()
  // defaultGateway: XyoGateway | XyoGatewayRunner | undefined | null
  // - XyoGatewayRunner (has addPayloadsToChain, send, etc.) when wallet is connected
  // - XyoGateway (read-only) when only in-page gateway is available
  // - undefined/null while loading or if no gateway is available
}
```

For the methods to call on `defaultGateway` once you have it, see [Gateway](gateway.md). For UX patterns built on top of the gateway — wallet connection UI, lifting the connected address, capability-aware components, display conventions — see [Browser UX](../xl1-patterns/browser-ux.md).

---

## Feature-Specific Packages

| Package | Purpose |
|---------|---------|
| `@xyo-network/xl1-browser-system` | Config-driven XL1 provider systems for any browser realm (`launchXl1BrowserGatewaySystem`, `compileXl1BrowserSystem`, `Xl1BrowserSystemActor`) |
| `@xyo-network/xl1-react-client-sdk` | Gateway providers (`WalletGatewayProvider`, `GatewayProvider`, `InPageGatewaysProvider`), wallet connection (`ConnectAccountsStack`), core client hooks (`useProvidedGateway`, etc.) |
| `@xyo-network/xl1-blockies` | Address icon generation |
| `@ariestools/browser-kit-page` / `-worker` / `-service-worker` / `-plugin` | Realm lifecycle adapters browser-system binds against — install only the realms the app uses |

Previous generation — do not use in new work:

| Package | Status |
|---------|--------|
| `@xyo-network/react-chain-transaction` | not published |
| `@xyo-network/react-chain-stake` | not published |
| `@xyo-network/react-chain-boundwitness` | not published |
| `@xyo-network/react-chain-blockchain` | not published |
| `@xyo-network/react-chain-network` | 4.0.5 — one major behind |
| `@xyo-network/react-chain-blockies` | 4.0.5 — superseded by `@xyo-network/xl1-blockies` |

---

## Cross-References

- [Gateway](gateway.md) — generic concepts, viewer API, networks, transports, anti-patterns
- [Gateway](gateway.md) — reading state, submitting transactions, capability detection, datalake access
- [In-Page Data Lakes](../xl1-patterns/in-page-datalakes.md) — the read-without-a-wallet pattern built on the in-page REST gateway
- [Browser UX](../xl1-patterns/browser-ux.md) — UX patterns built on top of the gateway
- [Node Gateway](gateway-node.md) — server-side construction
- [Identity & Signing](../xyo-knowledge/identity.md) — `Account`, `HDWallet`, mnemonic / seed-phrase construction
