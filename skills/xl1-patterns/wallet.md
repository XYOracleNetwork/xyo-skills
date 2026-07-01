# Wallet

The XL1 browser wallet (the Chrome extension) is the dApp's bridge to a user-controlled signer. This file documents what the wallet exposes to a dApp page and — equally important — what it does not.

**Scope:** the dApp-facing surface of the XL1 browser wallet. For the providers and hooks that bring the wallet into React, see [Browser Gateway](../xl1-knowledge/gateway-browser.md). For the connection UI lifecycle, see [Browser UX — Wallet Connection](browser-ux.md#wallet-connection). For backend (non-browser) wallets, see [XL1 Identity & Wallets](../xl1-knowledge/identity.md).

---

## Permissions

The wallet exposes its permission surface through a single RPC method, `xyoPermissions_requestPermissions`, that takes a batch of method-scoped permission requests. Four permission methods are registered. **Only two of them are publicly supported.**

| Method | Category | Status | Caveat |
|---|---|---|---|
| `xyoWallet_getAccounts` | Accounts | **Publicly supported** | `restrictReturnedAccounts` |
| `xyoSigner_address` | Accounts | **Publicly supported** | — |
| `xyoDataLakes_get` | Datalakes | **DO NOT USE — internal only** | `dataLakeAccess` |
| `xyoDataLakes_insert` | Datalakes | **DO NOT USE — internal only** | `dataLakeAccess` |

### The rule

> **Never construct a permission request that includes `xyoDataLakes_get` or `xyoDataLakes_insert`.** These methods are gated behind the wallet's internal `enableDataLakes` debug flag, are not seeded for normal users, and can change shape or disappear without notice. Requesting them in a dApp produces unpredictable behavior across wallet versions and surprises users who are not running the debug build.

If you find yourself wanting to request `xyoDataLakes_*`, stop. You don't need a wallet permission — you need the public datalake HTTP endpoint. The dApp talks to the datalake directly via `createRestDataLakeViewer` / `createRestDataLakeRunner` from `@xyo-network/xl1-sdk`, with no wallet involved. See [Datalakes — Two Independent Datalake Clients](../xl1-knowledge/datalakes.md#two-independent-datalake-clients) for the full picture and the canonical endpoints.

The dApp and the wallet are independent datalake clients. The wallet's datalake configuration is the wallet's own concern; a dApp that wants to read or write the datalake does it over HTTP.

### Publicly supported methods

**`xyoWallet_getAccounts`** — returns the addresses the user has authorized the dApp to see. Accepts an optional `restrictReturnedAccounts` caveat that scopes the grant to a specific subset of the wallet's accounts. This is the standard "which addresses am I connected as?" permission.

**`xyoSigner_address`** — returns the address of the wallet's currently selected signer. Use this when the dApp needs to know *which* of the authorized accounts is active right now (for signing UI, for displaying the current player, etc.).

For most dApps these two move together: requesting `xyoWallet_getAccounts` during the connect flow is enough, and the connected `XyoClient` exposes the active signer through its own API.

### Default path: use the SDK component

For the standard connect-accounts flow, do not call the permission RPC directly. The `@xyo-network/xl1-react-client-sdk` package ships a component that orchestrates the entire flow correctly:

```tsx
import { WalletGatewayProvider, ConnectAccountsStack } from '@xyo-network/xl1-react-client-sdk'
import { MainNetwork } from '@xyo-network/xl1-sdk'

function App() {
  return (
    <WalletGatewayProvider gatewayName={MainNetwork.id}>
      <ConnectAccountsStack onAccountConnected={(addr) => setAddress(addr)} />
      {/* rest of app */}
    </WalletGatewayProvider>
  )
}
```

`ConnectAccountsStack` handles wallet detection, the permission request, the "install wallet" prompt, error display, and the post-connection account display. See [Browser UX — Wallet Connection](browser-ux.md#wallet-connection) for the full lifecycle and the `useConnectAccount` singleton pitfall.

### When you need lower-level access

When the connect-on-mount flow isn't enough — re-prompting for permissions later, inspecting the current grants, gating a feature on a specific authorized address — reach for the hooks the SDK exposes:

| Hook / Component | Use when |
|---|---|
| `RequestPermissionsButton` | Prompting for permissions outside the initial connect flow (e.g., a "Reconnect" or "Add account" action) |
| `usePermissions()` | Reading the current permission grants (returns `{ permissions, isLoading, error, timedout }`) |
| `useAccountPermissions()` | Reading the list of authorized addresses (parses `restrictReturnedAccounts` for you) |
| `findCaveat(permissions, capability, caveatType)` | Reading a single caveat value off the current grants — e.g. the address from `restrictReturnedAccounts` after a `xyoWallet_getAccounts` request |
| `usePermissions()` → `permissions.requestPermissions([...])` | Direct access when the components don't fit — pass only the publicly supported methods |

All of these come from `@xyo-network/xl1-react-client-sdk`.

### The low-level request shape

`requestPermissions` takes an **array of method-scoped request objects** — `Record<method, Record<caveat, value>>` — not a single method string. To request account access and read the granted address back out:

```ts
import { usePermissions, findCaveat } from '@xyo-network/xl1-react-client-sdk'

const { permissions } = usePermissions()

// Request account access — an array of method-scoped request objects.
// The wallet decides which accounts to expose via the restrictReturnedAccounts caveat.
await permissions.requestPermissions([{ xyoWallet_getAccounts: {} }])

// Read the granted address out of the restrictReturnedAccounts caveat.
const grantedAccounts = await findCaveat(permissions, 'xyoWallet_getAccounts', 'restrictReturnedAccounts')
```

This is exactly what `useConnectAccount` / `ConnectAccountsStack` do internally — you rarely write it by hand. When the goal is to **connect to an account**, requesting the permission is what obtains the address; do **not** reach into the gateway signer (`gateway.signer.address()`) to drive the connect flow, as that bypasses the wallet's permission grant. Reading the signer address *after* permissions are established (e.g. to display the active signer, or via the `xyoSigner_address` permission) is fine — that's what it's for.

### Anti-patterns

| Anti-pattern | Why it fails | Do this instead |
|---|---|---|
| Including `xyoDataLakes_get` / `xyoDataLakes_insert` in a permission request | Internal-only methods; not granted on standard wallet builds; surprises users and breaks across versions | Talk to the datalake HTTP endpoint directly via `createRestDataLakeViewer` / `createRestDataLakeRunner` — no wallet permission needed |
| Passing arbitrary method strings to `permissions.requestPermissions(...)` | The wallet only honors the four registered methods; unknown methods fail or are silently ignored depending on version | Use one of the two publicly supported methods, or use the SDK components that wrap them |
| Using the signer address to **establish a connection** (`gateway.signer.address()` as the connect flow) | Bypasses the wallet's permission grant — you get an address the user never authorized the dApp to see, and it drifts from what `useAccountPermissions()` reports | To connect, request `xyoWallet_getAccounts` and read the address from the `restrictReturnedAccounts` caveat (via `findCaveat`), or just render `ConnectAccountsStack`. Reading the signer *after* permissions exist is fine. |
| Reimplementing the connect-accounts flow by calling the permission RPC directly | Duplicates `ConnectAccountsStack`'s lifecycle handling (detection, timeout, error, post-connection display) and tends to drift | Render `<ConnectAccountsStack />` and lift the address via `onAccountConnected` |
| Treating "I need datalake data in the dApp" as "I need a wallet permission" | Conflates two independent things — the wallet's permission system is for account access; datalake access is plain HTTP | Use the dApp's own `RestDataLakeRunner` / `RestDataLakeViewer` against the public datalake endpoint |

---

## Cross-References

- [Browser UX — Wallet Connection](browser-ux.md#wallet-connection) — the connection UI lifecycle built on these permissions
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — the providers and hooks that bring the wallet into React
- [Datalakes](../xl1-knowledge/datalakes.md) — the public HTTP path that replaces the (intentionally absent) public datalake permission
- [XL1 Identity & Wallets](../xl1-knowledge/identity.md) — backend (non-browser) wallet creation; the address derivation that matches what the browser wallet shows on the same seed
