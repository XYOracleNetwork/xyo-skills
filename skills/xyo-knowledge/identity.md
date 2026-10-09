# Identity & Signing

**Root barrel package:** `@xyo-network/sdk` — start here for protocol primitives and generic modules; tree shaking eliminates unused exports. Specific diviner / witness / archivist *implementations* ship as their own packages and are imported by name.

For full type details, read the `.d.ts` files under `dist/neutral/modules/<name>/` in `@xyo-network/sdk-protocol-core` (`account`, `account-model`, `wallet`, `quant-account`, `quant-wallet`, `previous-hash-store-*`), re-exported through `@xyo-network/sdk-protocol` and the barrel.

---

## When to Use Account vs Wallet

- **Account** — simple key pair, sufficient for signing and module identity. Use `Account.random()` or `{ account: 'random' }` in module config for testing.
- **Wallet** — when you need HD derivation, mnemonic backup, or deterministic key hierarchies. Use with a mnemonic for production recoverability.

---

> **Building on XL1?** For backend (Node) wallet creation, use the XL1 helpers in [XL1 Identity & Wallets](../xl1-knowledge/identity.md).

---

## Account

An **Account** is a key pair (secp256k1 elliptic curve) used for signing and identity in XYO.

**Post-quantum:** `QuantAccount` and `QuantHDWallet` (same barrel) are the
ML-DSA-65 equivalents of `Account` and `HDWallet`, with the same
`create` / `random` / `sign` / `verify` surface. Their addresses are bech32m
strings with the `qm65` prefix (`qm651…`) instead of 40 hex characters; both
forms are `XyoAddress`, and both can sign the same bound witness.
`QuantHDWallet` derives its ML-DSA seed with BIP-85, so the same mnemonic yields
a different address than `HDWallet`.

### Properties

- `address` — derived from the public key, used as the module/signer identifier
- `previousHash` — tracks the last bound witness hash for chain continuity
- `sign(hash, options?)` → `Promise<[signature, previousHash?]>` — by default
  asserts and advances the previous-hash chain. `{ chained: false }` produces a
  detached signature that neither reads nor advances it; `{ previousHash }`
  asserts the expected current value. The positional
  `sign(hash, previousHashBytes)` form is deprecated. (The options form is
  typed on `AccountInstanceV2`; `Account.create()` / `random()` are still typed
  `AccountInstance`, so narrow with `as Account` to use it from TypeScript.)
- `verify(msg, signature)` → `Promise<boolean>` — async; always `await` it
- `signJwt({ audience, ttl, claims? })` → `{ token, header, payload }` — an
  ES256K JWT signed detached (chain untouched); check one with
  `Account.verifyJwt(token, { audience })`, which resolves to
  `{ ok: true, payload }` or `{ ok: false, reasons }`. `QuantAccount.signJwt`
  throws — there is no JOSE algorithm for ML-DSA-65 yet

### Creation

```ts
import { Account } from '@xyo-network/sdk'

// Random account (testing)
const account = await Account.random()

// From a mnemonic (deterministic) — BIP44 m/44'/60'/0'/0/0, MetaMask's first account
const account = await Account.create({ mnemonic: 'twelve word mnemonic phrase ...' })

// `phrase` is an alias for the same path — it is ALSO parsed as a BIP-39
// mnemonic (`Mnemonic.fromPhrase`), so arbitrary secret text throws
// "invalid mnemonic length". Do not treat it as a passphrase-to-key helper.
const account = await Account.create({ phrase: 'twelve word mnemonic phrase ...' })

// From a raw private key
const account = await Account.create({ privateKey: keyBuffer })
const account = await Account.fromPrivateKey(privateKeyHex)
```

`create()` dedupes per address: creating the same key twice in one process
returns the **same instance**, so both handles share one `previousHash` chain
(`HDWallet` and `QuantAccount` cache the same way). There is no way to hold two
independent chains for one address in a process.

### Usage with BoundWitnessBuilder

```ts
const [bw, payloads, errors] = await new BoundWitnessBuilder()
  .signer(account)
  .payload(myPayload)
  .build()
```

The builder calls `account.sign()` for each signer and populates `$signatures` and `previous_hashes` automatically. A party whose key lives elsewhere joins with `.participant({ address, previousHash })` and fills its slot later with `cosignBoundWitness` — see [sequential cosigning](primitives.md#parties-in-separate-processes-sequential-cosigning).

---

## Wallet

A **Wallet** extends Account with hierarchical deterministic (HD) key derivation, following BIP39/BIP44 standards.

### Creation

```ts
import { HDWallet } from '@xyo-network/sdk'

// Random mnemonic wallet
const wallet = await HDWallet.random()

// From a BIP39 phrase — optional absolute path (default m/44'/60'/0'/0/0)
const wallet = await HDWallet.fromPhrase('abandon abandon abandon ... about')
const wallet = await HDWallet.fromPhrase(phrase, "m/44'/60'/0'/0")

// From a mnemonic instance
const wallet = await HDWallet.fromMnemonic(mnemonicInstance, path?)

// From a BIP-32 master seed (bytes or hex) — rooted at `m`, not the BIP44 leaf
const wallet = await HDWallet.fromSeed(seedHex)

// From an extended key
const wallet = await HDWallet.fromExtendedKey(xprv)

// New 24-word phrase
const phrase = HDWallet.generateMnemonic()
```

### HD Derivation

Derive child keys for different purposes:

```ts
// Derive relative to the wallet's current path — appends to it
const child = await wallet.derivePath('1')
```

`HDWallet.random()` and `HDWallet.fromPhrase(phrase)` return a wallet already rooted at
`m/44'/60'/0'/0/0` — the standard BIP44 Ethereum path, so the address matches
MetaMask's first account for the same seed. That path is a leaf, so `derivePath`
cannot reach sibling accounts from it: a relative path goes deeper
(`derivePath('1')` → `m/44'/60'/0'/0/0/1`), and an **absolute** path that is not
a descendant throws:

```ts
// Throws: Invalid absolute path m/44'/60'/0'/0/1 for wallet with path m/44'/60'/0'/0/0
await wallet.derivePath("m/44'/60'/0'/0/1")
```

To derive accounts 0..n, root the wallet at the BIP44 base path and derive the
bare account index:

```ts
const base = await HDWallet.fromPhrase(phrase, "m/44'/60'/0'/0")
const account0 = await base.derivePath('0') // m/44'/60'/0'/0/0 — same as fromPhrase(phrase)
const account1 = await base.derivePath('1') // m/44'/60'/0'/0/1
```

`HDWallet.create({ mnemonic, path })` also takes an absolute path from the seed.
`Account.create({ mnemonic, path })` does not: it applies `path` below the
`m/44'/60'/0'/0/0` leaf, so an `m/…` path throws and `'1'` lands on
`m/44'/60'/0'/0/0/1`.

### Additional Properties

Beyond Account's interface, Wallet provides:
- `chainCode` — HD chain code
- `depth` — derivation depth
- `index` — child index at current depth
- `fingerprint` / `parentFingerprint` — key fingerprints
- `extendedKey` — the full extended private key (`xprv…`)
- `path` — the derivation path (e.g., `"m/44'/60'/0'/0/0"`)
- `mnemonic` — the BIP39 mnemonic if available
- `neuter()` — **not supported**; always throws, because the private key cannot be removed. For a public-only key, derive the `xpub` from `extendedKey` with an xpub-capable consumer (e.g. ethers' `HDNodeWallet.neuter()`)
- `privateKey` / `publicKey` — raw key hex values

---

## Signing in Context

### How Signing Works in Bound Witnesses

1. `BoundWitnessBuilder` collects signers via `.signer(account)` (and address-only parties via `.participant()`)
2. On `.build()`, it computes the `dataHash` of the bound witness fields
3. Each local signer calls `account.sign(dataHash)` producing a signature; participant slots stay `null` until that party runs `cosignBoundWitness`
4. Signatures are placed in `$signatures` array (parallel to `addresses`)
5. Each signer's `previousHash` is recorded in `previous_hashes`

### Chain Continuity

The `previousHash` on each account links bound witnesses into a per-identity chain:
- First bound witness: `previousHash` is `null`
- Subsequent: `previousHash` points to the data hash of the last bound witness this account signed
- This creates a tamper-evident, ordered history for each identity

`previousHash` lives **in memory** unless a store is configured, so a reload or
restart starts the chain over. Set the shared store once at startup:

```ts
import { Account, IndexedDbPreviousHashStore, StoragePreviousHashStore } from '@xyo-network/sdk'

Account.previousHashStore = new IndexedDbPreviousHashStore()
// or: new StoragePreviousHashStore({ type: 'local' }) — 'local' | 'session' | 'page'
```

The store is keyed by address. Both implementations do compare-and-swap, so if
another tab or process sharing the store signs first, `sign()` throws
`Previous hash changed concurrently` (and reloads the stored value) instead of
forking the chain — retry the build. `Account.previousHashStore` also covers
`HDWallet`; `QuantAccount.previousHashStore` is set separately.
`Account.create({ …, previousHash })` seeds the chain explicitly.

### Cryptographic Details

- **Curve:** secp256k1 (same as Ethereum/Bitcoin) for `Account` / `HDWallet`; ML-DSA-65 for `QuantAccount` / `QuantHDWallet`
- **Hashing:** SHA-256 over canonical JSON by `ObjectHasher` in `@xyo-network/sdk-protocol-core` — WebCrypto `crypto.subtle` first, falling back to `hash-wasm`
- **Address:** secp256k1 — derived from the public key (20 bytes / 40 hex characters); ML-DSA-65 — bech32m `qm65…` encoding a 20-byte payload
- **Signatures:** hex-encoded; secp256k1 signatures for legacy addresses, ML-DSA-65 bundles for `qm65` addresses
- **Cloudflare Workers:** secp256k1 needs a statically imported Wasm module there. Before any `Account` signing or verification, `await initializeEllipticWorkerd()` from `@xyo-network/sdk-protocol/elliptic/workerd`

### Peer Dependencies

`@xyo-network/sdk` declares peers `@ariestools/sdk ^9.0`, `@opentelemetry/api ^1.9`,
`@xyo-network/sdk-protocol ^8.0`, and `zod ^4.6`. `@xyo-network/sdk-protocol-core`
(pulled in through `sdk-protocol`) adds `ethers ^6.17` — used for HD wallet
derivation via `ethers.HDNodeWallet` — and `ajv ^8.20`. Install all six.
