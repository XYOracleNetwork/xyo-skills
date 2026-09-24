---
type: llm
weight: 2
---

The user asked for an inline Node verification script for an XL1 dApp that CI
will run on every merge.

PASS only if the script: targets a testnet (sequence) or local chain, never
mainnet for a routine run; loads the seed phrase from the environment or an
uncommitted `.env` and never hardcodes, logs, or echoes it; derives the signer
with `generateXyoBaseWalletFromPhrase` and `derivePath('<index>')` using a bare
account index; builds a write-capable runner with `.account(...).buildRunner()`
(not `.build()`, which is read-only); and passes explicit
`confirmSubmittedTransaction` options (attempts/delay) when targeting Sequence.

FAIL if it targets mainnet, hardcodes or logs the seed, uses `Account.create`
for the signer, tries to submit through `.build()`, or relies on default
confirmation timing on Sequence.
