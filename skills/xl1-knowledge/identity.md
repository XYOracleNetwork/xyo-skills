# Identity & Wallets (XL1 Backend)

How to create wallets and signing accounts for XL1 backend code — Node services, indexers, CLIs, scheduled jobs, tests. The browser path is different: see [Browser Gateway](gateway-browser.md), where the Chrome extension owns the wallet.

**Root barrel package:** `@xyo-network/xl1-sdk` — import the helpers from here.

For the lower-level XYO identity primitives (`Account`, `HDWallet`) that these helpers compose, see [Identity & Signing](../xyo-knowledge/identity.md). For backend XL1 work, prefer the canonical pattern below — it ensures cross-environment wallet compatibility.

---

## Canonical Backend Wallet

```ts
import { generateXyoBaseWalletFromPhrase } from '@xyo-network/xl1-sdk'

const baseWallet = await generateXyoBaseWalletFromPhrase(mnemonic)
const account = await baseWallet.derivePath('0')
```

This is the default and standard way to create an account in any non-browser XL1 context. Use it for every backend identity: indexers, market operators, escrow services, oracle attesters, CLI tools, and tests that need a deterministic identity.

`generateXyoBaseWalletFromPhrase` produces a BIP44 base wallet from a BIP39 mnemonic, rooted at `DEFAULT_WALLET_PATH` (`m/44'/60'/0'/0`) — the standard Ethereum BIP44 prefix. `derivePath('0')` then appends the account index to reach `m/44'/60'/0'/0/0`, the first account on that seed. This matches the address MetaMask and the XYO Chrome extension show as account 1 on the same seed.

**Note:** `account` is an `AccountInstance`, not an `XyoSigner`. To use it for signing transactions through a gateway runner, wrap it via `buildSimpleXyoSignerV2` — see [Node Gateway — Write-capable gateway](gateway-node.md).

---

## Why This Matters: Cross-Environment Compatibility

A single seed phrase produces the **same default address** across every environment that follows the Ethereum BIP44 convention:

- **MetaMask** — first account on import
- **XYO Chrome extension wallet** — first account on import
- **Node backends** — using the snippet above

This is a hard guarantee, not a side effect. If a developer imports their seed phrase into MetaMask to inspect balances, the address they see there will match the signer their backend uses. If you bypass these helpers and call `Account.create({ mnemonic })` directly, the resulting address will **not** match — that path constructs a key without applying BIP44 derivation, so the same seed yields a different address from what MetaMask or the extension wallet show.

**Always route backend wallet creation through `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')`** unless you have a specific reason to deviate (see below).

---

## Deriving Other Accounts

When a single backend identity needs multiple addresses (sub-accounts, role separation, key rotation), derive additional indices from the same base wallet:

```ts
const baseWallet = await generateXyoBaseWalletFromPhrase(mnemonic)

const primary   = await baseWallet.derivePath('0')   // m/44'/60'/0'/0/0
const secondary = await baseWallet.derivePath('1')   // m/44'/60'/0'/0/1
const tertiary  = await baseWallet.derivePath('2')   // m/44'/60'/0'/0/2
```

These addresses match what MetaMask shows for accounts 1, 2, 3 on the same seed. The argument to `derivePath` is interpreted *relative to the base wallet's path* — pass the bare account index, not the full BIP44 path.

---

## Anti-Patterns

- **Don't** call `Account.create({ mnemonic })` for backend XL1 wallets. It produces an address that won't match MetaMask or the XYO browser extension for the same seed.
- **Don't** pass `DEFAULT_WALLET_PATH` (or `"m/44'/60'/0'/0/0"`) as the argument to `derivePath()`. `generateXyoBaseWalletFromPhrase` already roots the base wallet at `DEFAULT_WALLET_PATH`, so passing it again double-derives. Use a bare account index like `'0'`, `'1'`, etc.
- **Don't** treat the result of `derivePath('0')` as an `XyoSigner`. It is an `AccountInstance`. For transaction signing through a gateway runner, wrap it via `buildSimpleXyoSignerV2`.
- **Don't** generate a fresh random wallet at process start for production signers. Load the seed phrase from a secret store and derive deterministically — restarts must produce the same identity.

---

## Cross-References

- [Identity & Signing (XYO)](../xyo-knowledge/identity.md) — `Account`, `HDWallet`, lower-level primitives that the XL1 helpers compose
- [Node Gateway](gateway-node.md) — wiring a wallet into a write-capable backend gateway
- [Browser Gateway](gateway-browser.md) — browser wallet flow (extension-owned, not seed-phrase-loaded)
- [Wallet](../xl1-patterns/wallet.md) — the browser wallet's permission surface; what a dApp may and may not request
- [Chain Data Indexing Service](../xl1-patterns/chain-data-indexing-service.md) — signer-indexer pattern that loads a key at startup
