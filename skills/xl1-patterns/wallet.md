# Wallet

The XL1 browser wallet (the Chrome extension) is the dApp's bridge to a user-controlled signer. This file documents what the wallet exposes to a dApp page and — equally important — what it does not.

**Scope:** the dApp-facing surface of the XL1 browser wallet. For the providers and hooks that bring the wallet into React, see [Browser Gateway](../xl1-knowledge/gateway-browser.md). For the connection UI lifecycle, see [Browser UX — Wallet Connection](browser-ux.md#wallet-connection). For backend (non-browser) wallets, see [XL1 Identity & Wallets](../xl1-knowledge/identity.md).

---

## Permissions

The wallet exposes its permission surface through a single RPC method, `xyoPermissions_requestPermissions`, that takes a batch of method-scoped permission requests. Five permission methods are registered. **Only the two account methods are publicly supported — and they share one grant**, so a dApp requests just `xyoWallet_getAccounts`.

| Method | Category | Status | Caveat |
|---|---|---|---|
| `xyoWallet_getAccounts` | Accounts | **Publicly supported** — the permission to request | `restrictReturnedAccounts` |
| `xyoSigner_address` | Accounts | **Publicly supported** — resolved from the `xyoWallet_getAccounts` grant; no separate request | `restrictReturnedAccounts` (the shared grant) |
| `xyoSigner_sign` (auto-sign) | Signing | **Experimental — no SDK contract yet**; see [Auto-sign](#auto-sign-xyosigner_sign) | Required: `chainId`, `signer`, `schemaAllowlist`, `expiration`, `gasCap`, `txCountLimit`. Optional: `recipientAllowlist`, `valueCap` |
| `xyoDataLakes_get` | Datalakes | **DO NOT USE — internal only** | `dataLakeAccess` |
| `xyoDataLakes_insert` | Datalakes | **DO NOT USE — internal only** | `dataLakeAccess` |

The wallet validates every entry in a batch before it writes anything. A request naming an unregistered method, or a caveat type the method does not accept, rejects the whole batch (`Unknown permission method: …` / `Method … does not accept caveat type …`) — nothing is silently ignored.

### The rule

> **Never construct a permission request that includes `xyoDataLakes_get` or `xyoDataLakes_insert`.** These methods back the wallet's own datalake feature, whose settings sit behind the wallet's internal `enableDataLakes` debug toggle, and they can change shape or disappear without notice. Requesting them in a dApp produces unpredictable behavior across wallet versions and surprises users who have never configured a wallet datalake.

If you find yourself wanting to request `xyoDataLakes_*`, stop. You don't need a wallet permission — you need the public datalake HTTP endpoint. The dApp talks to the datalake directly via `createRestDataLakeViewer` / `createRestDataLakeRunner` from `@xyo-network/xl1-sdk`, with no wallet involved. See [Datalakes — Two Independent Datalake Clients](../xl1-knowledge/datalakes.md#two-independent-datalake-clients) for the full picture and the canonical endpoints.

The dApp and the wallet are independent datalake clients. The wallet's datalake configuration is the wallet's own concern; a dApp that wants to read or write the datalake does it over HTTP.

The rule covers the SDK's datalake components too. `@xyo-network/xl1-react-client-sdk` exports `DataLake*` buttons and panels and `ApprovedLakeSelector`, and each one calls the wallet's internal `xyoDataLakes_*` methods for you — do not render them in a dApp (see [Anti-patterns](#anti-patterns)).

### Publicly supported methods

**`xyoWallet_getAccounts`** — returns the addresses the user has authorized the dApp to see. Accepts an optional `restrictReturnedAccounts` caveat that scopes the grant to a specific subset of the wallet's accounts. This is the standard "which addresses am I connected as?" permission.

**`xyoSigner_address`** — returns the address of the wallet's currently selected signer. Use this when the dApp needs to know *which* of the authorized accounts is active right now (for signing UI, for displaying the current player, etc.). The wallet resolves it against the `xyoWallet_getAccounts` grant: approving account access also authorizes reading the active signer, and a `xyoSigner_address` entry in a request only writes into that same grant. Requesting it separately — alone or next to `xyoWallet_getAccounts` — adds nothing.

So a dApp has one permission to request: `xyoWallet_getAccounts`, during the connect flow. That grant covers both the account list and the active signer.

### Auto-sign (`xyoSigner_sign`)

The fifth registered permission is auto-sign: an *action* permission on `xyoSigner_sign`, the wallet's signing entry point. A grant lets the wallet sign and broadcast this site's conforming transactions without a per-transaction popup. The wallet refuses an under-specified grant — every request must carry the `chainId`, `signer`, `schemaAllowlist`, `expiration`, `gasCap`, and `txCountLimit` caveats, and values above the wallet's maximums (expiry, gas cap, value cap, transaction count) are rejected, not clamped. A transaction that trips a guardrail falls back to the normal Sign popup.

**Status: experimental.** The permission is registered in shipping wallet builds, but it has no SDK contract yet: `CaveatTypesZod` in `@xyo-network/xl1-sdk` does not enumerate its caveat types, and the SDK's only consumer, `AutoSignChainPanel` in `@xyo-network/xl1-react-client-sdk`, is a manual Storybook harness that passes the caveat names as string literals and defaults to the Local network. Do not build a product flow on it without checking the caveat shapes against the wallet version you target. When you do, request it as its own explicit user action after the accounts grant exists — the `signer` caveat pins the grant to a granted account.

### Default path: use the SDK component

For the standard connect-accounts flow, do not call the permission RPC directly. The `@xyo-network/xl1-react-client-sdk` package ships a component that orchestrates the entire flow correctly:

```tsx
import type { XyoAddress } from '@xyo-network/sdk'
import { WalletGatewayProvider, ConnectAccountsStack } from '@xyo-network/xl1-react-client-sdk'
import { SequenceNetwork } from '@xyo-network/xl1-sdk'
import { useState } from 'react'

function App() {
  // Every account the wallet lets this site use; [] once access is revoked
  const [accounts, setAccounts] = useState<readonly XyoAddress[]>([])

  return (
    <WalletGatewayProvider gatewayName={SequenceNetwork.id}>
      <ConnectAccountsStack onAccountsChanged={setAccounts} />
      {/* rest of app — the dApp picks the account it acts as from `accounts` */}
    </WalletGatewayProvider>
  )
}
```

`ConnectAccountsStack` handles wallet detection, the permission request, the "install wallet" prompt, error display, and the post-connection account display. Lift accounts through `onAccountsChanged`, not the compatibility `onAccountConnected` (first account only, never called on revoke). See [Browser UX — Wallet Connection](browser-ux.md#wallet-connection) for the full lifecycle, keeping the chosen account, and the `useConnectAccount` singleton pitfall.

### When you need lower-level access

When the connect-on-mount flow isn't enough — re-prompting for permissions later, following the grant outside `ConnectAccountsStack`, gating a feature on a specific authorized address — reach for the hooks the SDK exposes:

| Hook / Component | Use when |
|---|---|
| `useGrantedAccounts(permissions)` | **Preferred.** Following this site's account grant live: returns `{ accounts, isLoading, error, request, refresh }`, re-reads after each `request()` and whenever the window regains focus, and reports `[]` on revoke. Pass `permissions` from `usePermissions()` |
| `RequestPermissionsButton` | Prompting for permissions outside the initial connect flow (e.g., a "Reconnect" or "Add account" action) |
| `usePermissions()` | Reading the wallet's permission provider (returns `{ permissions, isLoading, error, timedout }`) |
| `useAccountPermissions()` | A one-time read of the authorized addresses (parses `restrictReturnedAccounts`). It reads once per permissions provider and does not follow requests, revocation, or focus — prefer `useGrantedAccounts` |
| `useConnectAccount()` | What `ConnectAccountsStack` uses internally — call it at most once (see the [singleton pitfall](browser-ux.md#singleton-pitfall-do-not-call-useconnectaccount-in-multiple-components)). Current API: `accounts`, `requestAccounts()`, `refreshAccounts()`. `address` and `connectSigner()` are compatibility-only and report just the first granted account |
| `findCaveat(permissions, capability, caveatType)` | Reading a single caveat value off the current grants — e.g. the address from `restrictReturnedAccounts` after a `xyoWallet_getAccounts` request |
| `usePermissions()` → `permissions.requestPermissions([...])` | Direct access when the components don't fit — pass only `xyoWallet_getAccounts` |

All of these come from `@xyo-network/xl1-react-client-sdk`.

```tsx
import { useGrantedAccounts, usePermissions } from '@xyo-network/xl1-react-client-sdk'
import { useState } from 'react'

function AddAccountButton() {
  const { permissions } = usePermissions()
  const { accounts, request } = useGrantedAccounts(permissions)
  const [hasFailed, setHasFailed] = useState(false)

  // request() opens the wallet's consent prompt, then re-reads the grant.
  // It rejects when the user declines or no wallet is available.
  const onClick = async () => {
    setHasFailed(false)
    try {
      await request()
    } catch {
      setHasFailed(true)
    }
  }

  return (
    <>
      <button type="button" onClick={() => void onClick()}>
        {`Accounts shared: ${accounts?.length ?? 0}`}
      </button>
      {hasFailed ? <span>Account request was not granted</span> : null}
    </>
  )
}
```

### The low-level request shape

`requestPermissions` takes an **array of method-scoped request objects** — `Record<method, Record<caveat, value>>` — not a single method string. To request account access and read the granted address back out:

```ts
import { usePermissions, findCaveat } from '@xyo-network/xl1-react-client-sdk'

const { permissions } = usePermissions()

// Request account access — an array of method-scoped request objects.
// The wallet decides which accounts to expose via the restrictReturnedAccounts caveat.
await permissions?.requestPermissions([{ xyoWallet_getAccounts: {} }])

// The wallet answers with acknowledgements only — read the grant again for the accounts.
const grantedAccounts = permissions
  ? await findCaveat(permissions, 'xyoWallet_getAccounts', 'restrictReturnedAccounts')
  : undefined
```

This is exactly what `useGrantedAccounts` — and through it `useConnectAccount` / `ConnectAccountsStack` — does internally, so you rarely write it by hand. When the goal is to **connect to an account**, requesting the permission is what obtains the address; do **not** reach into the gateway signer (`gateway.signer.address()`) to drive the connect flow, as that bypasses the wallet's permission grant. Reading the signer address *after* the accounts grant exists (e.g. to display the active signer through `xyoSigner_address`, which that grant already covers) is fine — that's what it's for.

### Anti-patterns

| Anti-pattern | Why it fails | Do this instead |
|---|---|---|
| Including `xyoDataLakes_get` / `xyoDataLakes_insert` in a permission request | Internal-only methods that back the wallet's own datalake feature; surprises users and breaks across versions | Talk to the datalake HTTP endpoint directly via `createRestDataLakeViewer` / `createRestDataLakeRunner` — no wallet permission needed |
| Rendering the SDK's datalake components — `DataLakeRequestAccessButton` / `DataLakeRequestAccessPanel`, `DataLakeInsertButton` / `DataLakeInsertPanel`, `DataLakeGetButton` / `DataLakeGetPanel`, `DataLakeListButton`, `DataLakeOperationsPanel`, `DataLakeAddToChainPanel`, `ApprovedLakeSelector` | `@xyo-network/xl1-react-client-sdk` exports them, but every one drives the wallet's internal `xyoDataLakes_*` methods through `client.dataLakes` — the same internal-only surface as the permissions above | Do not use them in a dApp. Read and write the dApp's own datalake with `createRestDataLakeViewer` / `createRestDataLakeRunner` |
| Passing arbitrary method strings to `permissions.requestPermissions(...)` | The wallet validates the whole batch first and rejects it on an unregistered method or a caveat type the method does not accept — nothing is silently ignored | Request `xyoWallet_getAccounts`, or use the SDK components that wrap it |
| Requesting `xyoSigner_address` alongside (or instead of) `xyoWallet_getAccounts` | Adds nothing — the wallet resolves `xyoSigner_address` from the `xyoWallet_getAccounts` grant, and a `xyoSigner_address` entry only writes into that same grant | Request `xyoWallet_getAccounts` alone |
| Using the signer address to **establish a connection** (`gateway.signer.address()` as the connect flow) | Bypasses the wallet's permission grant — you get an address the user never authorized the dApp to see, and it drifts from what `useGrantedAccounts()` reports | To connect, request `xyoWallet_getAccounts` and read the addresses from the grant (`useGrantedAccounts`, or `findCaveat` on `restrictReturnedAccounts`), or just render `ConnectAccountsStack`. Reading the signer *after* the grant exists is fine. |
| Reimplementing the connect-accounts flow by calling the permission RPC directly | Duplicates `ConnectAccountsStack`'s lifecycle handling (detection, timeout, error, post-connection display) and tends to drift | Render `<ConnectAccountsStack />` and lift the accounts via `onAccountsChanged` |
| Lifting the address with `onAccountConnected` or reading `useConnectAccount().address` | Compatibility surfaces: they report only the first granted account, and `onAccountConnected` is never called on revoke, so the lifted address goes stale | `onAccountsChanged(accounts)` (or `useGrantedAccounts`) — keep the chosen account while it is granted, clear it on `[]` |
| Treating "I need datalake data in the dApp" as "I need a wallet permission" | Conflates two independent things — the wallet's permission system is for account access; datalake access is plain HTTP | Use the dApp's own `RestDataLakeRunner` / `RestDataLakeViewer` against the public datalake endpoint |

---

## Cross-References

- [Browser UX — Wallet Connection](browser-ux.md#wallet-connection) — the connection UI lifecycle built on these permissions
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — the providers and hooks that bring the wallet into React
- [Datalakes](../xl1-knowledge/datalakes.md) — the public HTTP path that replaces the (intentionally absent) public datalake permission
- [XL1 Identity & Wallets](../xl1-knowledge/identity.md) — backend (non-browser) wallet creation; the address derivation that matches what the browser wallet shows on the same seed
