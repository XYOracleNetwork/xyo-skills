# Browser Gateway

How to construct an XL1 gateway in a browser — React dApps, browser-extension-driven flows, in-page read-only access. The XL1 browser wallet is the mechanism that publishes a write-capable gateway to the page; this file covers the wallet, the React providers that wrap it, and the hook dApps use to reach the gateway.

**Scope:** environment-specific *construction* of a browser-side gateway. Once you have a gateway, the chain reads, transaction methods, and datalake access work the same as in any other environment — see [Gateway](gateway.md) for the API surface and [Gateway](gateway.md) for cross-environment recipes. For browser UX patterns built on top of the gateway (wallet connection UI, display conventions, capability-aware components), see [Browser UX](../xl1-patterns/browser-ux.md).

For the Node / server-side equivalent, see [Node Gateway](gateway-node.md). For backend identity creation (Node services, indexers, CLIs, headless verification scripts), use the canonical seed-phrase pattern in [XL1 Identity & Wallets](identity.md) — `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')` for the account, then `buildSimpleXyoSignerV2` to wrap it as an `XyoSigner`. The lower-level XYO primitives (`Account.create({ mnemonic })`, `HDWallet.fromPhrase`) in [Identity & Signing](../xyo-knowledge/identity.md) skip BIP44 derivation and produce addresses that do not match the browser wallet on the same seed — use those only for non-XL1 XYO contexts.

**Key npm packages:**
- `@xyo-network/xl1-react-client-sdk` — Gateway providers, wallet connection, and client hooks for React dApps
- `@xyo-network/react-chain-transaction` — Transaction-specific components
- `@xyo-network/react-chain-stake` — Staking components
- `@xyo-network/react-chain-boundwitness` — BoundWitness components

**Required peer dependencies for `@xyo-network/xl1-react-client-sdk`:**
The react-chain packages use MUI internally. These peer dependencies must be installed explicitly in your app — pnpm will not hoist them automatically, and the compiler/linter will not catch missing ones. They only surface as `Could not resolve "..."` errors at runtime in the browser.

After installing `@xyo-network/xl1-react-client-sdk`, immediately read its `package.json` from `node_modules` to find the `peerDependencies` it declares (e.g., `@mui/material`, `@emotion/react`, `@emotion/styled`). Install each one at the latest version that satisfies the range declared in that `peerDependencies` field. Do not blindly install the latest major — if the peer range is `">=6 <8"`, pin to the latest within that range (e.g., `pnpm add @mui/material@">=6 <8"`). Then recursively check the installed packages' own peer dependencies (e.g., `@mui/material` requires `@emotion/*`) and install any that are missing.

---

## The XL1 Browser Wallet

The XL1 wallet is a Chrome browser extension for interacting with the XYO Layer One blockchain. It manages XL1 tokens, signs transactions, and publishes a write-capable gateway to dApp pages.

- Available on the Chrome Web Store
- Similar UX to MetaMask — extension-based, popup-based signing
- Uses **PostMessage RPC transport** for communication between the dApp page and the wallet extension

For the dApp-facing permission surface — what the wallet will and will not grant, the two publicly supported permission methods, and the hard rule against requesting datalake permissions — see [Wallet — Permissions](../xl1-patterns/wallet.md#permissions).

---

## Choosing Your Provider

Two providers from `@xyo-network/xl1-react-client-sdk` publish a gateway to React context:

| Provider | Wallet required? | Read-only fallback | Use when |
|----------|-----------------|-------------------|----------|
| `WalletGatewayProvider` | Yes | No | App strictly requires a wallet for all functionality |
| `GatewayProvider` + `InPageGatewaysProvider` | No | Yes (in-page HTTP gateway) | App should work read-only without a wallet |

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
    <InPageGatewaysProvider>
      <GatewayProvider gatewayName={MainNetwork.id}>
        <YourDApp />
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
```

`GatewayProvider` requires `InPageGatewaysProvider` as an ancestor. It merges the in-page gateway and wallet gateway into a single `defaultGateway` — wallet wins when connected, in-page is the fallback.

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
| `@xyo-network/xl1-react-client-sdk` | Gateway providers (`WalletGatewayProvider`, `GatewayProvider`), wallet connection (`ConnectAccountsStack`), core client hooks (`useProvidedGateway`, etc.) |
| `@xyo-network/react-chain-blockchain` | Chain state context |
| `@xyo-network/react-chain-network` | Network context |
| `@xyo-network/react-chain-transaction` | Transaction components and hooks |
| `@xyo-network/react-chain-stake` | Staking components and hooks |
| `@xyo-network/react-chain-boundwitness` | BoundWitness components |
| `@xyo-network/react-chain-blockies` | Address icon generation |

---

## Cross-References

- [Gateway](gateway.md) — generic concepts, viewer API, networks, transports, anti-patterns
- [Gateway](gateway.md) — reading state, submitting transactions, capability detection, datalake access
- [Browser UX](../xl1-patterns/browser-ux.md) — UX patterns built on top of the gateway
- [Node Gateway](gateway-node.md) — server-side construction
- [Identity & Signing](../xyo-knowledge/identity.md) — `Account`, `HDWallet`, mnemonic / seed-phrase construction
