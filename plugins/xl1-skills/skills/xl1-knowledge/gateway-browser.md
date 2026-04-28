# Browser Gateway

How to construct an XL1 gateway in a browser — React dApps, browser-extension-driven flows, in-page read-only access. The XL1 browser wallet is the mechanism that publishes a write-capable gateway to the page; this file covers the wallet, the React providers that wrap it, and the hooks dApps use to reach the gateway.

**Scope:** environment-specific *construction*. Once you have a gateway, the chain reads, transaction methods, and datalake access work the same as in any other environment — see [Gateway](gateway.md) for the API surface and [Gateway Usage](../xl1-patterns/gateway-usage.md) for cross-environment recipes.

For the Node / server-side equivalent, see [Node Gateway](gateway-node.md). Identity primitives that work in any environment (`Account.create({ mnemonic })`, `HDWallet.fromPhrase`) live in [Identity & Signing](../xyo-knowledge/identity.md).

**Key npm packages:**
- `@xyo-network/react-chain-client` — Gateway providers, wallet connection, and client hooks for React dApps
- `@xyo-network/react-chain-transaction` — Transaction-specific components
- `@xyo-network/react-chain-stake` — Staking components
- `@xyo-network/react-chain-boundwitness` — BoundWitness components

**Required peer dependencies for `@xyo-network/react-chain-client`:**
The react-chain packages use MUI internally. These peer dependencies must be installed explicitly in your app — pnpm will not hoist them automatically, and the compiler/linter will not catch missing ones. They only surface as `Could not resolve "..."` errors at runtime in the browser.

After installing `@xyo-network/react-chain-client`, immediately read its `package.json` from `node_modules` to find the `peerDependencies` it declares (e.g., `@mui/material`, `@emotion/react`, `@emotion/styled`). Install each one at the latest version that satisfies the range declared in that `peerDependencies` field. Do not blindly install the latest major — if the peer range is `">=6 <8"`, pin to the latest within that range (e.g., `pnpm add @mui/material@">=6 <8"`). Then recursively check the installed packages' own peer dependencies (e.g., `@mui/material` requires `@emotion/*`) and install any that are missing.

---

## The XL1 Browser Wallet

The XL1 wallet is a Chrome browser extension for interacting with the XYO Layer One blockchain. It manages XL1 tokens, signs transactions, and publishes a write-capable gateway to dApp pages.

- Available on the Chrome Web Store
- Similar UX to MetaMask — extension-based, popup-based signing
- Uses **PostMessage RPC transport** for communication between the dApp page and the wallet extension

Do not use `Account.random()` for user-facing wallet connections — that is for tests and non-interactive scripts only. If the wallet extension is not installed, show a prompt directing the user to install it from the Chrome Web Store. Do not silently fall back to a random account.

---

## Choosing Your Provider

Two providers from `@xyo-network/react-chain-client` publish a gateway to React context:

| Provider | Wallet required? | Read-only fallback | Use when |
|----------|-----------------|-------------------|----------|
| `WalletGatewayProvider` | Yes | No | App strictly requires a wallet for all functionality |
| `GatewayProvider` + `InPageGatewaysProvider` | No | Yes (in-page HTTP gateway) | App should work read-only without a wallet |

### Wallet-only setup

```tsx
import { WalletGatewayProvider } from '@xyo-network/react-chain-client'
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
import { InPageGatewaysProvider, GatewayProvider } from '@xyo-network/react-chain-client'
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

## Singleton Architecture

From the dApp's perspective, the **gateway**, **wallet**, and **connected account** are all singletons:

- **Gateway** — Exposed via `GatewayContext`. All components read it from context via `useProvidedGateway()`. Two providers publish to this context (covered above).
- **Account** — The connected wallet address is a single value. Lift it into app-level state via `ConnectAccountsStack`'s `onAccountConnected` callback and pass it down as props.

**Do not call `useConnectAccount()` in multiple components.** Each call creates its own isolated local state — calling `connectSigner()` in one instance does not update the address in other instances. This is the most common source of "connected but not working" bugs.

---

## Wallet Connection

Use `ConnectAccountsStack` for wallet connection UI. It handles the **full connection lifecycle** automatically: wallet detection, timeout, error display, the "install wallet" prompt, **and the post-connection state** (displaying the connected account). Do not build a separate "Connected: 0x..." UI — `ConnectAccountsStack` already renders it. Always render `ConnectAccountsStack` unconditionally; it adapts its display based on the current connection state:

```tsx
import { ConnectAccountsStack } from '@xyo-network/react-chain-client'

<ConnectAccountsStack
  timeout={5000}
  onAccountConnected={(address) => setAddress(address)}
/>
```

Lift the connected address into app-level state and pass it to child components as a prop — do not re-derive it from `useConnectAccount()` elsewhere.

---

## Accessing the Gateway

Use `useProvidedGateway()` in any component under a gateway provider:

```tsx
import { useProvidedGateway } from '@xyo-network/react-chain-client'

function MyComponent() {
  const { defaultGateway } = useProvidedGateway()
  // defaultGateway: XyoGateway | XyoGatewayRunner | undefined | null
  // - XyoGatewayRunner (has addPayloadsToChain, send, etc.) when wallet is connected
  // - XyoGateway (read-only) when only in-page gateway is available
  // - undefined/null while loading or if no gateway is available
}
```

For the methods to call on `defaultGateway` once you have it — reading state, submitting transactions, capability detection — see [Gateway Usage](../xl1-patterns/gateway-usage.md).

---

## Building a dApp UI

A typical XL1 dApp structure:

```tsx
import { WalletGatewayProvider, ConnectAccountsStack } from '@xyo-network/react-chain-client'
import { MainNetwork } from '@xyo-network/xl1-sdk'
import { useState } from 'react'

function App() {
  const [address, setAddress] = useState<string>()

  return (
      <WalletGatewayProvider gatewayName={MainNetwork.id}>
        <ConnectAccountsStack onAccountConnected={setAddress} />
        <GameBoard address={address} />
        <GameHistory address={address} />
      </WalletGatewayProvider>
  )
}
```

`ConnectAccountsStack` is rendered unconditionally — it manages its own display for both the unconnected and connected states. Child components use `useProvidedGateway()` for chain operations and receive the connected address as a prop. The gateway provider gives all children access to the chain via React context.

---

## Feature-Specific Packages

| Package | Purpose |
|---------|---------|
| `@xyo-network/react-chain-client` | Gateway providers (`WalletGatewayProvider`, `GatewayProvider`), wallet connection (`ConnectAccountsStack`), core client hooks (`useProvidedGateway`, etc.) |
| `@xyo-network/react-chain-blockchain` | Chain state context |
| `@xyo-network/react-chain-network` | Network context |
| `@xyo-network/react-chain-transaction` | Transaction components and hooks |
| `@xyo-network/react-chain-stake` | Staking components and hooks |
| `@xyo-network/react-chain-boundwitness` | BoundWitness components |
| `@xyo-network/react-chain-blockies` | Address icon generation |

---

## Cross-References

- [Gateway](gateway.md) — generic concepts, viewer API, networks, transports, anti-patterns
- [Gateway Usage](../xl1-patterns/gateway-usage.md) — reading state, submitting transactions, capability detection, datalake access
- [Node Gateway](gateway-node.md) — server-side construction
- [Identity & Signing](../xyo-knowledge/identity.md) — `Account`, `HDWallet`, mnemonic / seed-phrase construction
