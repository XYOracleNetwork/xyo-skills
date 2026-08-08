# Identity & Signing

**Root barrel package:** `@xyo-network/sdk` — start here for protocol primitives and generic modules; tree shaking eliminates unused exports. Specific diviner / witness / archivist *implementations* ship as their own packages and are imported by name.

For full type details, read the `.d.ts` files at `dist/neutral/index.d.ts` in each package.

---

## When to Use Account vs Wallet

- **Account** — simple key pair, sufficient for signing and module identity. Use `Account.random()` or `{ account: 'random' }` in module config for testing.
- **Wallet** — when you need HD derivation, mnemonic backup, or deterministic key hierarchies. Use with a mnemonic for production recoverability.

---

> **Building on XL1?** For backend (Node) wallet creation, route through `generateXyoBaseWalletFromPhrase` + `derivePath('<index>')` from `@xyo-network/xl1-sdk` — see [XL1 Identity & Wallets](../xl1-knowledge/identity.md). The bare `Account.create({ mnemonic })` and `HDWallet.fromPhrase` calls below skip the standard BIP44 derivation, so the resulting address will **not** match MetaMask or the XYO browser extension wallet for the same seed. Use those primitives only for non-XL1 XYO contexts or when you explicitly need a non-standard derivation.

---

## Account

An **Account** is a key pair (secp256k1 elliptic curve) used for signing and identity in XYO.

### Properties

- `address` — derived from the public key, used as the module/signer identifier
- `previousHash` — tracks the last bound witness hash for chain continuity
- `sign(hash)` → returns `[signature, previousHash?]`
- `verify(msg, signature)` → boolean

### Creation

```ts
import { Account } from '@xyo-network/sdk'

// Random account (testing)
const account = await Account.random()

// From a mnemonic (deterministic)
const account = await Account.create({ mnemonic: 'twelve word mnemonic phrase ...' })

// `phrase` is an alias for the same path — it is ALSO parsed as a BIP-39
// mnemonic (`Mnemonic.fromPhrase`), so arbitrary secret text throws
// "invalid mnemonic length". Do not treat it as a passphrase-to-key helper.
const account = await Account.create({ phrase: 'twelve word mnemonic phrase ...' })

// From a raw private key
const account = await Account.create({ privateKey: keyBuffer })
```

### Usage with BoundWitnessBuilder

```ts
const [bw, payloads, errors] = await new BoundWitnessBuilder()
  .signer(account)
  .payload(myPayload)
  .build()
```

The builder calls `account.sign()` for each signer and populates `$signatures` and `previous_hashes` automatically.

---

## Wallet

A **Wallet** extends Account with hierarchical deterministic (HD) key derivation, following BIP39/BIP44 standards.

### Creation

```ts
import { HDWallet } from '@xyo-network/sdk'

// Random mnemonic wallet
const wallet = await HDWallet.random()

// From a BIP39 phrase
const wallet = await HDWallet.fromPhrase('abandon abandon abandon ... about')

// From a mnemonic instance
const wallet = await HDWallet.fromMnemonic(mnemonicInstance, path?)

// From an extended key
const wallet = await HDWallet.fromExtendedKey(xprv)
```

### HD Derivation

Derive child keys for different purposes:

```ts
// Derive relative to the wallet's current path — appends to it
const child = await wallet.derivePath('1')
```

`HDWallet.random()` and `HDWallet.fromPhrase()` return a wallet already rooted at
`m/44'/60'/0'/0/0`, so an **absolute** path that is not a descendant of it throws:

```ts
// Throws: Invalid absolute path m/44'/60'/0'/0/1 for wallet with path m/44'/60'/0'/0/0
await wallet.derivePath("m/44'/60'/0'/0/1")
```

For XL1 work, use `generateXyoBaseWalletFromPhrase` + a bare account index instead —
see [XL1 Identity & Wallets](../xl1-knowledge/identity.md).

### Additional Properties

Beyond Account's interface, Wallet provides:
- `chainCode` — HD chain code
- `depth` — derivation depth
- `index` — child index at current depth
- `fingerprint` / `parentFingerprint` — key fingerprints
- `extendedKey` — the full extended private key
- `path` — the derivation path (e.g., `"m/44'/60'/0'/0/0"`)
- `mnemonic` — the BIP39 mnemonic if available
- `neuter()` — returns a public-only wallet (strips private key)
- `privateKey` / `publicKey` — raw key hex values

---

## Signing in Context

### How Signing Works in Bound Witnesses

1. `BoundWitnessBuilder` collects signers via `.signer(account)`
2. On `.build()`, it computes the `dataHash` of the bound witness fields
3. Each signer calls `account.sign(dataHash)` producing a signature
4. Signatures are placed in `$signatures` array (parallel to `addresses`)
5. Each signer's `previousHash` is recorded in `previous_hashes`

### Chain Continuity

The `previousHash` on each account links bound witnesses into a per-identity chain:
- First bound witness: `previousHash` is `null`
- Subsequent: `previousHash` points to the hash of the last bound witness this account signed
- This creates a tamper-evident, ordered history for each identity

### Cryptographic Details

- **Curve:** secp256k1 (same as Ethereum/Bitcoin)
- **Hashing:** SHA-256 via the WebCrypto `crypto.subtle` implementation in `@ariestools/sdk` (with `hash-wasm` as a dependency of `sdk-protocol-core`)
- **Address:** derived from public key (20 bytes / 40 hex characters)
- **Signatures:** hex-encoded elliptic curve signatures

### Peer Dependency

Consumers must provide `ethers ^6` — used internally for HD wallet derivation via `ethers.HDNodeWallet`.
