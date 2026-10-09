# Browser UX

How to build user-facing dApp UIs idiomatically — wallet connection, display conventions, capability-aware components, and the structural patterns that keep React + XL1 dApps consistent.

**Scope:** browser-side UX patterns only. For browser-side gateway *construction* (the wallet extension, providers, hooks), see [Browser Gateway](../xl1-knowledge/gateway-browser.md). For the env-agnostic gateway API surface, see [Gateway](../xl1-knowledge/gateway.md).

**Builds on:**
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — `WalletGatewayProvider` / `GatewayProvider` / `InPageGatewaysProvider`, `useProvidedGateway`, and the REST-over-RPC transport rule
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
  onAccountsChanged={onAccountsChanged} // see Lift the connected address
/>
```

### Render unconditionally

Always render `ConnectAccountsStack` unconditionally. It adapts its display based on the current connection state. Do not build a separate "Connected: 0x..." UI — `ConnectAccountsStack` already renders it. Conditionally swapping it for a custom connected UI defeats its lifecycle handling.

### Restyle through slot props

To change how the connection UI looks, pass `ConnectAccountsStack` its slot components — do not wrap, fork, or replace it. It renders exactly one state at a time, and each state has a slot:

| Slot prop | Renders | Receives |
|---|---|---|
| `AccountComponent` | Each granted account | `address` (also as `account`) |
| `ConnectComponent` | The "Connect" action when the site holds no grant | `onClick` |
| `LoadingComponent` | Wallet discovery or the first grant read | — |
| `NoWalletInstalledComponent` | No wallet appeared within `timeout` | — |

The default `AccountComponent` (`ConnectedAccount`) already clamps: it shows a blockie, the clamped address, and the full address in a tooltip. It has no copy action or Explorer link — replace it when the dApp wants the full [display conventions](#display-conventions) there:

```tsx
import type { XyoAddress } from '@xyo-network/sdk'
import { ConnectAccountsStack } from '@xyo-network/xl1-react-client-sdk'
import type { MouseEventHandler } from 'react'

function PlayerAccount({ address }: { address: XyoAddress }) {
  return <AddressDisplay value={address} /> // clamped + Explorer-linked — see Display Conventions
}

function ConnectButton({ onClick }: { onClick?: MouseEventHandler<HTMLElement> }) {
  return <button type="button" onClick={onClick}>Connect wallet</button>
}

<ConnectAccountsStack
  AccountComponent={PlayerAccount}
  ConnectComponent={ConnectButton}
  onAccountsChanged={onAccountsChanged}
/>
```

### Lift the connected address

Lift the granted accounts into app-level state with the `onAccountsChanged` callback, keep the account the dApp acts as in that state, and pass it to child components as a prop. `onAccountsChanged(accounts)` fires with every account the wallet lets the site use after each grant read that changes them — including `[]` when the user revokes access in the wallet. A grant is the set of accounts the site *may* use, not a choice of one: keep the dApp's chosen account while the grant still holds it, and clear it on `[]`:

```tsx
import type { XyoAddress } from '@xyo-network/sdk'
import { useCallback, useState } from 'react'

const [address, setAddress] = useState<XyoAddress>()

// Keep the chosen account while it is still granted; [] (revoked) clears it
const onAccountsChanged = useCallback((accounts: readonly XyoAddress[]) => {
  setAddress(current => (current !== undefined && accounts.includes(current) ? current : accounts[0]))
}, [])
```

Do not lift with `onAccountConnected`. It is a compatibility prop: it reports only the first granted account and is never called on revoke, so an address lifted through it goes stale after the user disconnects the site. Do not re-derive the account from `useConnectAccount()` elsewhere in the component tree either.

### Singleton pitfall: do not call `useConnectAccount()` in multiple components

Each call to `useConnectAccount()` runs its own wallet discovery and its own grant read, with its own loading and error state. A `requestAccounts()` through one instance updates only that instance; the others catch up only on their next re-read (when the window regains focus), so in between they disagree about whether the user is connected. This is the most common source of "connected but not working" bugs.

The hook's current API is `accounts` / `requestAccounts()` / `refreshAccounts()`. Its `address` and `connectSigner()` fields are compatibility-only — they report just the first granted account. To follow the grant somewhere `ConnectAccountsStack` does not reach, use `useGrantedAccounts` (see [Wallet — When you need lower-level access](wallet.md#when-you-need-lower-level-access)).

Treat the connected account as a singleton: one `ConnectAccountsStack` at the app root, the accounts lifted into state once, the chosen address passed down as props.

### No silent fallback to a random account

Do not use `Account.random()` for user-facing wallet connections — it is for tests and non-interactive scripts only. If the wallet extension is not installed, `ConnectAccountsStack` already prompts the user to install it from the Chrome Web Store. Do not silently fall back to a random account.

### Going beyond the default connect flow

`ConnectAccountsStack` covers the standard "request accounts on connect" path. When a dApp needs more — re-prompting for permissions later, following the grant outside the stack, inspecting current grants — see [Wallet](wallet.md) for the publicly supported permission surface and the SDK hooks (`useGrantedAccounts`, `RequestPermissionsButton`, `usePermissions`). There is no separate request for the signer address: the wallet resolves `xyoSigner_address` from the `xyoWallet_getAccounts` grant. That file also documents the hard rule against requesting `xyoDataLakes_*` permissions.

---

## dApp UI Structure

A typical XL1 dApp layout:

```tsx
import type { XyoAddress } from '@xyo-network/sdk'
import { WalletGatewayProvider, ConnectAccountsStack } from '@xyo-network/xl1-react-client-sdk'
import { SequenceNetwork } from '@xyo-network/xl1-sdk'
import { useCallback, useState } from 'react'

function App() {
  const [address, setAddress] = useState<XyoAddress>()

  // Keep the chosen account while it is still granted; [] (revoked) clears it
  const onAccountsChanged = useCallback((accounts: readonly XyoAddress[]) => {
    setAddress(current => (current !== undefined && accounts.includes(current) ? current : accounts[0]))
  }, [])

  return (
    <WalletGatewayProvider gatewayName={SequenceNetwork.id}>
      <ConnectAccountsStack onAccountsChanged={onAccountsChanged} />
      <GameBoard address={address} />
      <GameHistory address={address} />
    </WalletGatewayProvider>
  )
}
```

- The gateway provider wraps the whole app, giving every child gateway access via context.
- `ConnectAccountsStack` sits at the root, owning the connection state.
- The granted accounts are lifted to app state through `onAccountsChanged`; the chosen `address` is passed as a prop to consumers and cleared when access is revoked.
- Child components call `useProvidedGateway()` for chain operations.

For apps that need to work *before* a wallet is connected (history pages, leaderboards, public browse views), wrap the app in `GatewayProvider` + `InPageGatewaysProvider transport="rest"` instead — see [In-Page Data Lakes](in-page-datalakes.md). The `transport` prop is not optional in practice: it still defaults to `'rpc'`, and REST is the best practice for in-page reads.

---

## Capability-Aware Components

A component that reads chain data only needs the read-capable gateway. A component that submits transactions needs the write-capable runner **and** an account the user has granted. Detect both before rendering action controls.

```tsx
import type { Payload, XyoAddress } from '@xyo-network/sdk'
import { useProvidedGateway } from '@xyo-network/xl1-react-client-sdk'

function SubmitMoveButton({ address, payloads }: { address?: XyoAddress; payloads: Payload[] }) {
  const { defaultGateway } = useProvidedGateway()
  // The runner proves a wallet is installed; the granted address proves the user connected this site
  const canSubmit = address !== undefined && defaultGateway && 'addPayloadsToChain' in defaultGateway

  if (!canSubmit) return null // or render a "Connect wallet to play" prompt

  return (
    <button type="button" onClick={() => void defaultGateway.addPayloadsToChain([], payloads)}>
      Submit move
    </button>
  )
}
```

`'addPayloadsToChain' in defaultGateway` alone is not a connection check. Under `GatewayProvider`, `defaultGateway` is the wallet's runner as soon as the extension is installed — before the user has granted this site any account — and `undefined` while wallet discovery is still running. Gate writes on the lifted `address` (from `onAccountsChanged`) plus the runner check. For public reads, use `gateways.inPageGateway` from `useProvidedGateway()` rather than `defaultGateway` — see [In-Page Data Lakes](in-page-datalakes.md#checking-gateway-capability).

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

The connected account is already clamped: `ConnectAccountsStack`'s default `AccountComponent` shows the clamped address with its blockie and puts the full value in a tooltip. To add a copy action or an Explorer link, pass your own component through the stack's slot props — see [Restyle through slot props](#restyle-through-slot-props).

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
import { ExplorerLinks, SequenceNetwork } from '@xyo-network/xl1-sdk'

const explorer = new ExplorerLinks(SequenceNetwork.explorerUrl!, SequenceNetwork.id) // the network the dApp targets

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
| Wrapping, forking, or replacing `ConnectAccountsStack` to restyle it | Re-implements the lifecycle it already handles, and drifts from it | Pass slot components: `AccountComponent`, `ConnectComponent`, `LoadingComponent`, `NoWalletInstalledComponent` |
| Lifting the address with `onAccountConnected` | Compatibility prop: reports only the first granted account and is never called on revoke, so the lifted address goes stale | `onAccountsChanged(accounts)` — keep the chosen account while it is granted, clear it on `[]` |
| Calling `useConnectAccount()` in multiple components | Each call runs its own discovery and grant read; a request through one doesn't update the others until they re-read | Single `ConnectAccountsStack` at the root, lift the accounts to app state, pass the chosen address as props |
| Treating `'addPayloadsToChain' in defaultGateway` as "connected" | Under `GatewayProvider` the wallet's runner is `defaultGateway` as soon as the extension is installed, before any account is granted | Gate writes on a granted account **and** a write-capable runner |
| Conditionally rendering `ConnectAccountsStack` only when disconnected | Defeats its lifecycle management — it handles the connected state too | Render unconditionally; let it adapt |
| `Account.random()` as a fallback when wallet is missing | Hides the missing-wallet error; user thinks they're connected when they aren't | Show the install-wallet prompt that `ConnectAccountsStack` already provides |
| Displaying full 64-char hashes inline | Visually overwhelming; users can't scan a list of them | Clamp to prefix...suffix, provide copy-to-clipboard |
| Clamping without a copy action | Users have no way to recover the full value | Always pair clamping with a copy mechanism |
| Surfacing an address, block, transaction, or payload with no link to the Explorer | Users have no path to inspect the primitive in context | Wrap the value in a link built via `ExplorerLinks` from `@xyo-network/xl1-sdk` |
| Hand-rolling Explorer URLs (`` `${explorerUrl}/xl1/${networkId}/transaction/${hash}` ``) | Drifts from the canonical path shape; breaks silently when the Explorer route changes | Build URLs through `ExplorerLinks` methods (`address`, `block`, `transaction`, `transactionPayload`, …) |
| Gating reads behind wallet connection | Visitors can't browse without committing to a wallet popup | Use `GatewayProvider` + `InPageGatewaysProvider` for read-only access; gate only writes on wallet |
| Mounting `InPageGatewaysProvider` without `transport` | Silently falls back to `'rpc'`, so every anonymous visitor's reads hit a live gateway node instead of cacheable static buckets | Pass `transport="rest"` explicitly |
