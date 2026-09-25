---
type: llm
weight: 2
---

The user's script uses `Account.create({ mnemonic })`, builds with `.build()`,
and calls `addPayloadsToChain`; the address does not match MetaMask.

PASS only if the answer corrects all three: derive with
`generateXyoBaseWalletFromPhrase(phrase)` then `derivePath('0')` (a bare account
index, not a full BIP44 path) so the address matches MetaMask / the XYO
extension; pass the account to `.account(account)`; and call `.buildRunner()`
because `.build()` returns a read-only gateway with no `addPayloadsToChain`.

FAIL if any of the three corrections is missing, or if it keeps
`Account.create` or `.build()` for submitting.
