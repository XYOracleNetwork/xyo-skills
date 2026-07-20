---
name: xl1-testing
description: >
  How to test and verify XL1 work — choosing and running the right verification
  approach. Groups the headless verification methods: headless testnet verification
  (an in-process seed-phrase signer against the live Sequence testnet) and local
  dev-chain verification (the same signer against a free, deterministic local chain
  launched with the public xl1 CLI), plus unattended Sequence testing via the
  @xyo-network/wallet-xl1-cli (`xl1-wallet`) CLI with an OS-keychain-stored password
  and headless browser-mode testing (vitest + Playwright, headless Chromium) for
  browser-environment code, plus a pointer to full-app browser e2e. Includes shared
  testnet-only safety rules. Activates when an agent needs to test, verify, or
  smoke-test an XL1 dApp or protocol change, run on-chain tests against a local chain
  or the Sequence testnet, run headless browser tests, or set up unattended / CI testing.
metadata:
  version: 1.1.26 # x-release-please-version
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
| Prove a dApp's chain interactions work against a **live testnet**, in-process (agentic build, CI smoke test, regression) | **[Headless testnet verification](headless-testnet-verification.md)** | In-process seed-phrase signer via `GatewayBuilder.build(signer)` |
| Prove them against a **free, deterministic local chain** — offline, no funding step, fast (CI, TDD loops, multi-account flows) | **[Local dev-chain verification](local-chain.md)** | Local `xl1 start` chain + in-process signer (genesis-funded dev account) |
| Drive an external, funded actor on Sequence **unattended** (fund an address, send test transactions, broadcast signed tx files) across many runs | **[Unattended Sequence via CLI wallet](sequence-cli-wallet.md)** | Standalone `xl1-wallet` CLI, password in the OS keychain |
| Test **browser-environment code** (in-page gateway, IndexedDB datalake, PostMessage transport, browser SDK build) in headless Chromium | **[Headless browser-mode testing](browser-mode.md)** | vitest browser mode + Playwright provider, MSW-mocked |
| Drive the **fully rendered app UI** across Chromium / Firefox / WebKit | the `xylabs-e2e-setup` skill (separate skill, if installed) | Playwright e2e against the real UI |

Local vs testnet: iterate on **[local dev-chain](local-chain.md)** (free, instant, resets clean each run), then confirm against **[Sequence](headless-testnet-verification.md)** before shipping — local uses simplified dev consensus and no EVM staking layer, so it proves your interactions, not full-network behavior.

They compose: use the CLI-wallet actor to fund/operate a Sequence account, headless
testnet verification to assert a dApp's chain interactions programmatically, and
browser e2e to validate the user-facing UI. A passing headless run proves "the
chain side works"; it does not prove "the UI works."

## Headless verification methods

"Headless verification" means proving on-chain behavior without a browser or the
wallet extension. This barrel groups the variants:

- **[Headless testnet verification](headless-testnet-verification.md)** — in-process
  seed-phrase signer against the live Sequence testnet. The default for validating
  before shipping.
- **[Local dev-chain verification](local-chain.md)** — the same in-process signer
  against a free, deterministic local chain launched with the public `xl1` CLI
  (`xl1 start`). Offline, instant, genesis-funded — the fast inner loop for CI/TDD.

Additional headless verification methods will be documented alongside these here
as they are added.

## Cross-References

- [Node Gateway](../xl1-knowledge/gateway-node.md) — `GatewayBuilder`, REST/S3 gateway, and network endpoints used by the in-process approach.
- [Gateway](../xl1-knowledge/gateway.md) — viewer API, transaction methods, networks, and AttoXL1 units.
- [dApp Definition of Done](../xl1-patterns/dapp-checklist.md) — the completion gate that requires verification.
