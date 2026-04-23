# Browser Wallet

**Key npm packages:**
- `@xyo-network/react-chain-client` — Gateway providers, wallet connection, and client hooks for React dApps
- `@xyo-network/react-chain-transaction` — Transaction-specific components
- `@xyo-network/react-chain-stake` — Staking components
- `@xyo-network/react-chain-boundwitness` — BoundWitness components

**Required peer dependencies for `@xyo-network/react-chain-client`:**
The react-chain packages use MUI internally. These peer dependencies must be installed explicitly in your app — pnpm will not hoist them automatically, and the compiler/linter will not catch missing ones. They only surface as `Could not resolve "..."` errors at runtime in the browser.

After installing `@xyo-network/react-chain-client`, immediately read its `package.json` from `node_modules` to find the `peerDependencies` it declares (e.g., `@mui/material`, `@emotion/react`, `@emotion/styled`). Install each one at the latest version that satisfies the range declared in that `peerDependencies` field. Do not blindly install the latest major — if the peer range is `">=6 <8"`, pin to the latest within that range (e.g., `pnpm add @mui/material@">=6 <8"`). Then recursively check the installed packages' own peer dependencies (e.g., `@mui/material` requires `@emotion/*`) and install any that are missing.

---

## XL1 Browser Wallet

The XL1 wallet is a Chrome browser extension for interacting with the XYO Layer One blockchain. It manages XL1 tokens, signs transactions, and connects dApps to the chain.

- Available on the Chrome Web Store
- Similar UX to MetaMask — extension-based, popup-based signing
- Uses **PostMessage RPC transport** for communication between the dApp page and the wallet extension

---

## Submitting Transactions

**The gateway is the single point of entry for all chain interactions in application code.** It abstracts transaction construction, wallet signing, and broadcasting into single method calls. Do not use low-level RPC constructs (`TransactionBoundWitness`, `xyoSigner_signTransaction`, `xyoRunner_broadcastTransaction`) directly — those are internal to the gateway implementation. Application code should always go through the gateway's high-level methods.

### Adding application data to the chain

For custom application payloads (game results, attestations, etc.), use `addPayloadsToChain` on the gateway from `useProvidedGateway()`:

```ts
const { defaultGateway } = useProvidedGateway()

// Application payloads go in offChain — onChain is for AllowedBlockPayload system types
const [txHash, signedTx] = await defaultGateway.addPayloadsToChain([], payloads)
```

This single call:
1. Builds a `TransactionBoundWitness` with fees, block range, and chain ID
2. Triggers the wallet extension popup for user approval
3. Signs with the user's account key
4. Broadcasts to the XL1 network
5. Returns `[Hash, SignedHydratedTransactionWithHashMeta]`

**On-chain vs off-chain payloads:**
- `onChain: AllowedBlockPayload[]` — predefined XL1 system payload types only (e.g., `StepComplete`). Custom application payloads will not typecheck here.
- `offChain: Payload[]` — application data of any schema. The transaction's BoundWitness references these payloads by hash, but **the wallet does not persist them to a datalake**. The dApp must store off-chain payloads in the datalake separately — see [Datalakes](datalakes.md) for the correct insert-then-submit flow.

### Token transfers

For sending XL1 tokens:

```ts
const txHash = await gateway.send(toAddress, amount)
const txHash = await gateway.sendMany({ [addr1]: amount1, [addr2]: amount2 })
```

### Pre-built transactions

For full control over transaction construction, build the transaction first and then submit:

```ts
const [txHash, signedTx] = await gateway.addTransactionToChain(unsignedTx, offChainPayloads)
```

### Transaction confirmation

After submission, confirm inclusion in a block:

```ts
const confirmedTx = await gateway.confirmSubmittedTransaction(txHash)
```

---

## React Integration

The React SDK provides a component library for building XL1 dApp UIs.

### When to use the browser wallet

Any React dApp that records data on XL1 **must** use a gateway provider (`WalletGatewayProvider` or `GatewayProvider`) for chain interactions. Do not construct transactions manually or call RPC methods directly.

Do not use `Account.random()` for user-facing wallet connections — that is for tests and non-interactive scripts only. If the wallet extension is not installed, show a prompt directing the user to install it from the Chrome Web Store. Do not silently fall back to a random account.

### Singleton Architecture

From the dApp's perspective, the **gateway**, **wallet**, and **connected account** are all singletons:

- **Gateway** — Exposed via `GatewayContext`. All components read it from context via `useProvidedGateway()`. Two providers publish to this context (both from `@xyo-network/react-chain-client`):
  1. `GatewayProvider` — **hybrid**: merges wallet gateway + in-page gateway into a single `defaultGateway`. Wallet wins when present; in-page is fallback. Requires `InPageGatewaysProvider` ancestor. Use this when your app should work read-only without a wallet.
  2. `WalletGatewayProvider` — **wallet-only**: exposes only the wallet gateway. No in-page fallback (`inPageGateway` is always `null`). Use this for apps that strictly require a wallet.
- **Account** — The connected wallet address is a single value. Lift it into app-level state via `ConnectAccountsStack`'s `onAccountConnected` callback and pass it down as props.

**Do not call `useConnectAccount()` in multiple components.** Each call creates its own isolated local state — calling `connectSigner()` in one instance does not update the address in other instances. This is the most common source of "connected but not working" bugs.

### Gateway Context

A `GatewayContext` establishes the connection between your React app and the XL1 chain. Two requirements:

1. **A gateway provider must be an ancestor** — either `WalletGatewayProvider` (wallet-only) or `GatewayProvider` (hybrid, requires `InPageGatewaysProvider` ancestor). Without one, the app has no gateway and `useProvidedGateway()` will throw.
2. **`gatewayName` is required** — without it, `defaultGateway` is always `undefined`. Use `MainNetwork.id` from `@xyo-network/xl1-sdk` (value: `"mainnet"`). Both providers use this name to look up the wallet gateway via `useGatewayFromWallet(gatewayName)`. `GatewayProvider` additionally resolves the in-page fallback gateway from `InPageGatewaysProvider`. When `gatewayName` is omitted, lookups return `undefined`.

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

### Wallet Connection

Use `ConnectAccountsStack` for wallet connection UI. It handles the **full connection lifecycle** automatically: wallet detection, timeout, error display, the "install wallet" prompt, **and the post-connection state** (displaying the connected account). Do not build a separate "Connected: 0x..." UI — `ConnectAccountsStack` already renders it. Always render `ConnectAccountsStack` unconditionally; it adapts its display based on the current connection state:

```tsx
import { ConnectAccountsStack } from '@xyo-network/react-chain-client'

<ConnectAccountsStack
  timeout={5000}
  onAccountConnected={(address) => setAddress(address)}
/>
```

Lift the connected address into app-level state and pass it to child components as a prop — do not re-derive it from `useConnectAccount()` elsewhere.

### Accessing the Gateway

Use `useProvidedGateway()` to read the singleton gateway from context. It works with both `WalletGatewayProvider` and `GatewayProvider`. When using `GatewayProvider`, the in-page gateway is the fallback when the wallet is not connected:

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

Check for write capability before submitting transactions:

```ts
if (defaultGateway && 'addPayloadsToChain' in defaultGateway) {
  const [txHash] = await defaultGateway.addPayloadsToChain([], payloads)
}
```

### Feature-Specific Packages

| Package | Purpose |
|---------|---------|
| `@xyo-network/react-chain-client` | Gateway providers (`WalletGatewayProvider`, `GatewayProvider`), wallet connection (`ConnectAccountsStack`), core client hooks (`useProvidedGateway`, etc.) |
| `@xyo-network/react-chain-blockchain` | Chain state context |
| `@xyo-network/react-chain-network` | Network context |
| `@xyo-network/react-chain-transaction` | Transaction components and hooks |
| `@xyo-network/react-chain-stake` | Staking components and hooks |
| `@xyo-network/react-chain-boundwitness` | BoundWitness components |
| `@xyo-network/react-chain-blockies` | Address icon generation |

### Building a dApp UI

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

Note that `ConnectAccountsStack` is rendered unconditionally — it manages its own display for both the unconnected and connected states. Child components use `useProvidedGateway()` for chain operations and receive the connected address as a prop. The gateway provider gives all children access to the chain via React context.
