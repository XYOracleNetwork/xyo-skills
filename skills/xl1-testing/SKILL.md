---
name: xl1-testing
description: >
  How to test and verify XL1 work — choosing and running the right verification
  approach. Groups headless verification methods: Sequence testnet verification
  (in-process seed-phrase signer), local dev-chain verification (public xl1 CLI
  or vitest-owned chains via public @xyo-network/dapp-kit-vitest-config local-xl1,
  or XYO-internal @xyo-network/xl1-vitest-config apiLocal), composed local chain +
  Aries data-store verification, full local dApp backend verification
  (aries-dapp-core classic path or dapp-kit local path), unattended Sequence
  testing via @xyo-network/wallet-xl1-cli, and headless browser-mode testing
  (vitest + Playwright). Includes shared testnet-only safety rules. Activates
  when an agent needs to test, verify, or smoke-test an XL1 dApp or protocol
  change, run on-chain tests against a local chain or Sequence, run headless
  browser tests, or set up unattended / CI testing.
metadata:
  version: 1.1.31 # x-release-please-version
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
- **[xl1-dapp-kit](../xl1-dapp-kit/SKILL.md)** — when the project uses `@xyo-network/dapp-kit*` / `xl1.dapp.json`.
- **[xy-toolchain](../xy-toolchain/SKILL.md)** — Vitest layout, `@ariestools/vitest-config`, `xy test` / `xy retest` (canonical: ariestools-skills).
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
| Prove a dApp's chain interactions work against a **live testnet**, in-process (agentic build, CI smoke test, regression) | **[Headless testnet verification](headless-testnet-verification.md)** | In-process seed-phrase signer via `GatewayBuilder.buildRunner()` |
| Prove them against a **free, deterministic local chain** — offline, no funding step, fast | **[Local dev-chain verification](local-chain.md)** | Local `xl1 start` chain + in-process signer (genesis-funded dev account) |
| Same, but let **vitest own the chain** (public packages) — default for new dapp-kit / public consumers | **[Local chain via dApp Kit Vitest](local-chain-dapp-kit-vitest.md)** | `@xyo-network/dapp-kit-vitest-config` `local-xl1` + in-process signer |
| Same vitest-owned chain, but **XYO-internal** restricted harness | **[Local chain via apiLocal](local-chain-vitest.md)** | `@xyo-network/xl1-vitest-config` `apiLocal` |
| Test a local XL1 chain and an independently hosted **Aries data/object lake** together, without yet running a real reducer | **[Local chain + Aries data-lake fixture](local-chain-datalake.md)** | Direct `xl1` CLI + `aries dapp` CLI with the noop actor |
| Test a complete local XL1 dApp backend (classic **or** dapp-kit) | **[Full local XL1 dApp stack](local-dapp-stack.md)** | Classic: `aries-dapp-core`. dapp-kit: `xl1-dapp` / local hosts + [dapp-kit vitest](local-chain-dapp-kit-vitest.md) |
| Drive an external, funded actor on Sequence **unattended** | **[Unattended Sequence via CLI wallet](sequence-cli-wallet.md)** | `xl1-wallet` CLI, password in the OS keychain |
| Test **browser-environment code** in headless Chromium | **[Headless browser-mode testing](browser-mode.md)** | vitest browser mode + Playwright provider, MSW-mocked |
| Drive the **fully rendered app UI** | the `xylabs-e2e-setup` skill (separate skill, if installed) | Playwright e2e against the real UI |

### Local chain boot — pick one

| Route | When |
|---|---|
| [`xl1 start`](local-chain.md) | Manual/session debugging; no vitest preset yet |
| [`dapp-kit-vitest-config` `local-xl1`](local-chain-dapp-kit-vitest.md) | **Preferred public** CI/TDD when you can add the published preset |
| [`apiLocal`](local-chain-vitest.md) | XYO-internal only (restricted packages) |

Local vs testnet: iterate on a local chain, then confirm against
**[Sequence](headless-testnet-verification.md)** before shipping. Local uses
simplified dev consensus and no EVM staking layer.

### Application composition — pick one

| Shape | Stack doc |
|---|---|
| Classic React/service + Aries reducer publication | [Full local dApp stack — classic](local-dapp-stack.md#classic-aries-dapp-core) |
| `@xyo-network/dapp-kit*` / `xl1.dapp.json` | [Full local dApp stack — dapp-kit](local-dapp-stack.md#dapp-kit) + [xl1-dapp-kit](../xl1-dapp-kit/SKILL.md) |

They compose: use the CLI-wallet actor to fund/operate a Sequence account,
headless testnet verification to assert chain interactions, and browser e2e for
UI. A passing headless run proves "the chain side works"; it does not prove
"the UI works."

## Headless verification methods

"Headless verification" means proving on-chain behavior without a browser or the
wallet extension. This barrel groups the variants:

- **[Headless testnet verification](headless-testnet-verification.md)** — Sequence.
- **[Local dev-chain verification](local-chain.md)** — public `xl1 start`.
- **[Local chain via dApp Kit Vitest](local-chain-dapp-kit-vitest.md)** — public vitest-owned chain.
- **[Local chain via apiLocal](local-chain-vitest.md)** — XYO-internal vitest-owned chain.
- **[Local chain + Aries data-lake fixture](local-chain-datalake.md)** — chain + Aries stores.
- **[Full local XL1 dApp stack](local-dapp-stack.md)** — classic aries **or** dapp-kit composition.

## Cross-References

- [Node Gateway](../xl1-knowledge/gateway-node.md) — `GatewayBuilder`, REST/S3 gateway, and network endpoints used by the in-process approach.
- [Gateway](../xl1-knowledge/gateway.md) — viewer API, transaction methods, networks, and AttoXL1 units.
- [dApp Definition of Done](../xl1-patterns/dapp-checklist.md) — the completion gate that requires verification.
