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

## Transaction Signing Flow

When a dApp needs to submit a transaction to the XL1 chain:

### 1. Construct the Transaction
The dApp builds a `TransactionBoundWitness` with the desired payloads (see [Chain](chain.md) for the data model):

```ts
// Transaction includes: chain, from, nbf, exp, fees, and payloads
const tx: [TransactionBoundWitness, Payload[]] = [transactionBw, payloads]
```

### 2. Request Wallet Signature
The dApp sends a signing request to the wallet via PostMessage RPC:

```ts
// The wallet handles xyoSigner_signTransaction
const signedTx = await provider.signTransaction(tx)
```

### 3. Wallet Signs
The wallet extension:
- Displays the transaction details to the user for approval
- Signs with the user's account key
- Returns a `SignedHydratedTransactionWithHashMeta`

### 4. Broadcast
The signed transaction is broadcast to the network:

```ts
// Via xyoRunner_broadcastTransaction
const txHash = await provider.broadcastTransaction(signedTx)
```

### 5. Inclusion
The transaction enters the mempool and is included in the next block by a block producer.

---

## React Integration

The React SDK provides a component library for building XL1 dApp UIs.

### When to use the browser wallet

Any React dApp that records data on XL1 **must** use `GatewayProvider` and `useGatewayFromWallet()` for wallet connection and transaction signing. Do not use `Account.random()` for user-facing wallet connections — that is for tests and non-interactive scripts only.

If the wallet extension is not installed, show a prompt directing the user to install it from the Chrome Web Store. Do not silently fall back to a random account — the user should know they need the wallet to interact with the chain.

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
