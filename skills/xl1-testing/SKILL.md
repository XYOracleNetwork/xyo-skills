---
name: xl1-testing
description: >
  How to test and verify XL1 work — choosing and running the right verification
  approach. Groups the headless verification methods (starting with headless
  testnet verification: an in-process seed-phrase signer against a live testnet)
  and unattended Sequence testing via the @xyo-network/wallet-xl1-cli (`xl1-wallet`)
  CLI with an OS-keychain-stored password, plus a pointer to browser e2e. Includes
  shared testnet-only safety rules. Activates when an agent needs to test, verify,
  or smoke-test an XL1 dApp or protocol change, run on-chain tests against the
  Sequence testnet, or set up unattended / CI testing.
metadata:
  version: 1.1.25 # x-release-please-version
---

# XL1 Testing

The hub for testing and verifying XL1 work. It routes to the right verification
approach and documents each one. Read this SKILL to choose an approach, then open
the linked sub-doc for the full procedure.

**Skill identity.** This skill's version is exposed in this file's frontmatter under `metadata.version`. When reporting which skills informed your work, format as `<skill-name> v<version>` (e.g. `xl1-testing v1.1.25`). When multiple skills from this plugin are active, each may be listed.

## Lower-layer skills

Testing builds on the rest of the stack. Also consult:

- **[xl1-knowledge](../xl1-knowledge/SKILL.md)** — chain, gateway, SDK, and the network endpoints under test.
- **[xl1-patterns](../xl1-patterns/SKILL.md)** — dApp patterns and the [dApp Definition of Done](../xl1-patterns/dapp-checklist.md) that verification plugs into.
- **[xyo-knowledge](../xyo-knowledge/SKILL.md)** / **[xy-development](../xy-development/SKILL.md)** — protocol primitives and testing/workflow conventions.

## ⛔ Testnet-only by default

All flows here target **testnets** (`sequence`, or a `local` chain) unless a human
explicitly and deliberately opts into mainnet for a specific run.

- Default every verification/test to `sequence` or `local`. Never make routine or
  automated runs hit `xl1-mainnet` / real XL1.
- Seeds and wallet passwords are secrets — never commit, log, or echo them.
- The unattended CLI-wallet flow stores a password in the OS keychain and
  auto-unlocks; that is a **hot wallet** and is acceptable only for valueless test
  tokens. See its doc for the full guardrails.

## Choose an approach

| You want to… | Use | Signer / actor |
|---|---|---|
| Prove a dApp's own chain interactions work end-to-end, in-process (agentic build, CI smoke test, regression) | **[Headless testnet verification](headless-testnet-verification.md)** | In-process seed-phrase signer via `GatewayBuilder.build(signer)` |
| Drive an external, funded actor on Sequence **unattended** (fund an address, send test transactions, broadcast signed tx files) across many runs | **[Unattended Sequence via CLI wallet](sequence-cli-wallet.md)** | Standalone `xl1-wallet` CLI, password in the OS keychain |
| Test the **browser UI** across Chromium / Firefox / WebKit | the `xylabs-e2e-setup` skill (separate skill, if installed) | Playwright driving the real UI |

They compose: use the CLI-wallet actor to fund/operate a Sequence account, headless
testnet verification to assert a dApp's chain interactions programmatically, and
browser e2e to validate the user-facing UI. A passing headless run proves "the
chain side works"; it does not prove "the UI works."

## Headless verification methods

"Headless verification" means proving on-chain behavior without a browser or the
wallet extension. This barrel groups the variants:

- **[Headless testnet verification](headless-testnet-verification.md)** — in-process
  seed-phrase signer against a live testnet (`sequence` / `local`). The default for
  agentic development and CI.

Additional headless verification methods will be documented alongside it here as
they are added.

## Cross-References

- [Node Gateway](../xl1-knowledge/gateway-node.md) — `GatewayBuilder`, REST/S3 gateway, and network endpoints used by the in-process approach.
- [Gateway](../xl1-knowledge/gateway.md) — viewer API, transaction methods, networks, and AttoXL1 units.
- [dApp Definition of Done](../xl1-patterns/dapp-checklist.md) — the completion gate that requires verification.
