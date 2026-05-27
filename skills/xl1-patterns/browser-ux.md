# Browser UX

How to build user-facing dApp UIs idiomatically — wallet connection, display conventions, capability-aware components, and the structural patterns that keep React + XL1 dApps consistent.

**Scope:** browser-side UX patterns only. For browser-side gateway *construction* (the wallet extension, providers, hooks), see [Browser Gateway](../xl1-knowledge/gateway-browser.md). For the env-agnostic gateway API surface, see [Gateway](../xl1-knowledge/gateway.md).

**Builds on:**
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `WalletGatewayProvider` / `GatewayProvider` / `InPageGatewaysProvider`, `useProvidedGateway`
- [Gateway](../xl1-knowledge/gateway.md) — capability detection, transaction submission, viewer API
- [In-Page Data Lakes](in-page-datalakes.md) — read-only browsing patterns
- [Wallet](wallet.md) — the wallet's permission surface (what `ConnectAccountsStack` is requesting under the hood, and what is off-limits)

---

## Wallet Connection

Use `ConnectAccountsStack` from `@xyo-network/xl1-react-client-sdk` for the entire wallet connection UI. It handles the **full connection lifecycle** automatically: wallet detection, timeout, error display, the "install wallet" prompt, **and the post-connection state** (displaying the connected account).

```tsx
import { ConnectAccountsStack } from '@xyo-network/xl1-react-client-sdk'

<ConnectAccountsStack
  timeout={5000}
  onAccountConnected={(address) => setAddress(address)}
/>
```

### Render unconditionally

Always render `ConnectAccountsStack` unconditionally. It adapts its display based on the current connection state. Do not build a separate "Connected: 0x..." UI — `ConnectAccountsStack` already renders it. Conditionally swapping it for a custom connected UI defeats its lifecycle handling.

### Lift the connected address

Lift the connected address into app-level state via the `onAccountConnected` callback and pass it to child components as a prop. Do not re-derive it from `useConnectAccount()` elsewhere in the component tree.

### Singleton pitfall: do not call `useConnectAccount()` in multiple components

Each call to `useConnectAccount()` creates its own isolated local state — calling `connectSigner()` in one instance does not update the address in other instances. This is the most common source of "connected but not working" bugs.

Treat the connected account as a singleton: one `ConnectAccountsStack` at the app root, the address lifted into state once, passed down as props.

### No silent fallback to a random account

Do not use `Account.random()` for user-facing wallet connections — it is for tests and non-interactive scripts only. If the wallet extension is not installed, `ConnectAccountsStack` already prompts the user to install it from the Chrome Web Store. Do not silently fall back to a random account.

### Going beyond the default connect flow

`ConnectAccountsStack` covers the standard "request accounts on connect" path. When a dApp needs more — re-prompting for permissions later, inspecting current grants, requesting `xyoSigner_address` explicitly — see [Wallet](wallet.md) for the publicly supported permission surface and the SDK hooks (`RequestPermissionsButton`, `usePermissions`, `useAccountPermissions`). That file also documents the hard rule against requesting `xyoDataLakes_*` permissions.

---

## dApp UI Structure

A typical XL1 dApp layout:

```tsx
import { WalletGatewayProvider, ConnectAccountsStack } from '@xyo-network/xl1-react-client-sdk'
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

- The gateway provider wraps the whole app, giving every child gateway access via context.
- `ConnectAccountsStack` sits at the root, owning the connection state.
- The connected `address` is lifted to app state and passed as a prop to consumers.
- Child components call `useProvidedGateway()` for chain operations.

For apps that need to work *before* a wallet is connected (history pages, leaderboards, public browse views), wrap the app in `GatewayProvider` + `InPageGatewaysProvider` instead — see [In-Page Data Lakes](in-page-datalakes.md).

---

## Capability-Aware Components

A component that reads chain data only needs the read-capable gateway. A component that submits transactions needs the write-capable runner. Detect capability before rendering action controls.

```tsx
function SubmitMoveButton({ payloads }: { payloads: Payload[] }) {
  const { defaultGateway } = useProvidedGateway()
  const canSubmit = defaultGateway && 'addPayloadsToChain' in defaultGateway

  if (!canSubmit) return null // or render a "Connect wallet to play" prompt

  return (
    <button onClick={() => defaultGateway.addPayloadsToChain([], payloads)}>
      Submit move
    </button>
  )
}
```

This makes read-only browsing the default and gates write actions on wallet connection — the right shape for any dApp that wants public-readable, wallet-gated-writable behavior.

---

## Display Conventions

### Clamp hashes and addresses

Hashes (64 chars) and addresses (40 chars) are too long to display in full in most UI contexts. Always:

1. **Clamp the display value** to a readable prefix + suffix, e.g., `a1b2c3d4...ef567890`. Users don't read full hex strings.
2. **Provide a copy-to-clipboard action.** Every clamped value must have a way to copy the full, untruncated value. A click-to-copy icon or a tooltip with a copy button both work.

```tsx
function HashDisplay({ value }: { value: string }) {
  const display = `${value.slice(0, 8)}...${value.slice(-8)}`

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
  }

  return (
    <span style={{ fontFamily: 'monospace', cursor: 'pointer' }} onClick={handleCopy} title="Click to copy">
      {display}
    </span>
  )
}
```

Hashes and addresses appear throughout dApp UIs: game IDs, player addresses, transaction hashes, block hashes, etc. Prefer clamped display over raw hex strings — full 40- or 64-character values are rarely useful inline.

### Link primitives to the Explorer

Whenever a UI surfaces an XL1 chain primitive, render it as a link to the corresponding Explorer page. Use `ExplorerLinks` from `@xyo-network/xl1-sdk` to build the URL — never hand-concatenate paths. The class covers every primitive worth linking:

| Primitive in your UI | `ExplorerLinks` method |
|---|---|
| Account / signer / wallet address | `address(addr)` |
| List of known addresses | `addresses()` |
| Block (by hash) | `block(blockHash)` |
| Block (by number) | `blockByNumber(n)` |
| Block list / chain head view | `blocks()` |
| Payload anchored in a block | `blockPayload(blockHash, payloadHash, render?)` |
| Transaction (`TransactionBoundWitness` hash) | `transaction(txHash)` |
| Payload carried by a transaction | `transactionPayload(txHash, payloadHash, render?)` |
| Transaction list | `transactions()` |
| Network landing page | `network()` |

Construct one `ExplorerLinks` per network from the same `NetworkBootstrap` that drives the gateway provider — this keeps the explorer the user lands on aligned with the network the dApp is talking to:

```tsx
import { ExplorerLinks, MainNetwork } from '@xyo-network/xl1-sdk'

const explorer = new ExplorerLinks(MainNetwork.explorerUrl!, MainNetwork.id)

function AddressDisplay({ value }: { value: string }) {
  const display = `${value.slice(0, 8)}...${value.slice(-8)}`
  return (
    <a href={explorer.address(value)} target="_blank" rel="noreferrer" style={{ fontFamily: 'monospace' }}>
      {display}
    </a>
  )
}
```

Linking, clamping, and copy-to-clipboard compose — a single component should clamp the visible value, expose a copy action, *and* be a link to the Explorer. Open the Explorer in a new tab so the user does not lose dApp state.

---

## Anti-Patterns

| Anti-pattern | Why it fails | Do this instead |
|---|---|---|
| Custom "Connected: 0x..." UI rendered next to `ConnectAccountsStack` | Duplicates state and display logic; goes stale when the connection changes | Use `ConnectAccountsStack` alone — it renders the connected state itself |
| Calling `useConnectAccount()` in multiple components | Each call creates isolated state; connecting in one doesn't update the others | Single `ConnectAccountsStack` at the root, lift address to app state, pass as props |
| Conditionally rendering `ConnectAccountsStack` only when disconnected | Defeats its lifecycle management — it handles the connected state too | Render unconditionally; let it adapt |
| `Account.random()` as a fallback when wallet is missing | Hides the missing-wallet error; user thinks they're connected when they aren't | Show the install-wallet prompt that `ConnectAccountsStack` already provides |
| Displaying full 64-char hashes inline | Visually overwhelming; users can't scan a list of them | Clamp to prefix...suffix, provide copy-to-clipboard |
| Clamping without a copy action | Users have no way to recover the full value | Always pair clamping with a copy mechanism |
| Surfacing an address, block, transaction, or payload with no link to the Explorer | Users have no path to inspect the primitive in context | Wrap the value in a link built via `ExplorerLinks` from `@xyo-network/xl1-sdk` |
| Hand-rolling Explorer URLs (`` `${explorerUrl}/xl1/${networkId}/transaction/${hash}` ``) | Drifts from the canonical path shape; breaks silently when the Explorer route changes | Build URLs through `ExplorerLinks` methods (`address`, `block`, `transaction`, `transactionPayload`, …) |
| Gating reads behind wallet connection | Visitors can't browse without committing to a wallet popup | Use `GatewayProvider` + `InPageGatewaysProvider` for read-only access; gate only writes on wallet |
