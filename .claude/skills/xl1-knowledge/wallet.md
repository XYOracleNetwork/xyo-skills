# Browser Wallet

**Key npm packages:**
- `@xyo-network/react-chain-provider` — GatewayProvider context for React dApps
- `@xyo-network/react-chain-client` — Client hooks and utilities
- `@xyo-network/react-chain-transaction` — Transaction-specific components
- `@xyo-network/react-chain-stake` — Staking components
- `@xyo-network/react-chain-boundwitness` — BoundWitness components

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

For custom application payloads (game results, attestations, etc.), use `addPayloadsToChain`:

```ts
const { gateway } = useConnectAccount()

// Application payloads go in offChain — onChain is for AllowedBlockPayload system types
const [txHash, signedTx] = await gateway.addPayloadsToChain([], payloads)
```

This single call:
1. Builds a `TransactionBoundWitness` with fees, block range, and chain ID
2. Triggers the wallet extension popup for user approval
3. Signs with the user's account key
4. Broadcasts to the XL1 network
5. Returns `[Hash, SignedHydratedTransactionWithHashMeta]`

**On-chain vs off-chain payloads:**
- `onChain: AllowedBlockPayload[]` — predefined XL1 system payload types only (e.g., `StepComplete`). Custom application payloads will not typecheck here.
- `offChain: Payload[]` — application data of any schema. These are attached to the transaction and recorded on chain, but are not system-level block payloads.

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

Any React dApp that records data on XL1 **must** use `GatewayProvider` and `useConnectAccount()` for wallet connection and chain interactions. The gateway returned by `useConnectAccount()` is the only interface application code should use for submitting transactions — do not construct transactions manually or call RPC methods directly.

Do not use `Account.random()` for user-facing wallet connections — that is for tests and non-interactive scripts only. If the wallet extension is not installed, show a prompt directing the user to install it from the Chrome Web Store. Do not silently fall back to a random account.

### Gateway Provider

The `GatewayProvider` establishes the connection between your React app and the XL1 chain. It **requires** `InPageGatewaysProvider` as a parent — without it the app will silently crash to a blank page.

```tsx
import { GatewayProvider, InPageGatewaysProvider } from '@xyo-network/react-chain-provider'

function App() {
  return (
    <InPageGatewaysProvider>
      <GatewayProvider>
        <YourDApp />
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
```

### Connecting to the Wallet

Use `useConnectAccount()` to connect your dApp to the user's browser wallet and obtain their address:

```tsx
import { useConnectAccount } from '@xyo-network/react-chain-provider'

function ConnectWallet() {
  const { address, connectSigner, gateway, timedout } = useConnectAccount()
  // address: connected wallet address (undefined until connected)
  // connectSigner: call to trigger wallet popup
  // gateway: XyoGatewayRunner for chain operations (undefined/null/instance)
  // timedout: true if wallet extension was not detected
}
```

### Feature-Specific Packages

| Package | Purpose |
|---------|---------|
| `@xyo-network/react-chain-client` | Core client hooks and utilities |
| `@xyo-network/react-chain-provider` | Gateway provider context, wallet connection |
| `@xyo-network/react-chain-blockchain` | Chain state context |
| `@xyo-network/react-chain-network` | Network context |
| `@xyo-network/react-chain-transaction` | Transaction components and hooks |
| `@xyo-network/react-chain-stake` | Staking components and hooks |
| `@xyo-network/react-chain-boundwitness` | BoundWitness components |
| `@xyo-network/react-chain-blockies` | Address icon generation |

### Building a dApp UI

A typical XL1 dApp structure with React:

```tsx
import { GatewayProvider, InPageGatewaysProvider } from '@xyo-network/react-chain-provider'

function App() {
  return (
    <InPageGatewaysProvider>
      <GatewayProvider>
        <GameBoard />      {/* Your game UI */}
        <WalletConnect />  {/* Wallet connection */}
        <GameHistory />    {/* Query past games from chain */}
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
```

The gateway provider gives all child components access to the chain via React context. Components can query blocks, submit transactions, and react to chain events through the provider's viewer/runner methods.
