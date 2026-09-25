---
type: llm
weight: 2
---

The user wants a connect flow whose address is available app-wide and a write
button enabled only when the wallet can write.

PASS only if the answer: renders the SDK's `ConnectAccountsStack` (rather than
re-implementing the connect flow over raw permission RPC); lifts the connected
address into app state via its connection callback (e.g. `onAccountConnected`)
so pages read it from state; warns that `useConnectAccount` is a singleton /
not to be called from multiple components independently; and gates the write
button on gateway capability (`'addPayloadsToChain' in defaultGateway` or an
equivalent capability check), not merely on an address being present.

FAIL if it re-implements connection via `permissions.requestPermissions`
directly, gates writes only on "address exists", or omits the capability check.
