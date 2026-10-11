---
name: xl1-testing
description: >
  How to test and verify XL1 work — choosing and running the right verification
  approach. Groups headless verification methods: Sequence testnet verification
  (in-process seed-phrase signer), local dev-chain verification (public xl1 CLI
  or vitest-owned chains via public @xyo-network/dapp-kit-vitest-config local-xl1
  / api-local, or the restricted XYO-internal @xyo-network/xl1-vitest-config
  apiLocal), composed local chain +
  Aries data-store verification, full local dApp backend verification
  (aries-dapp-core classic path or dapp-kit local path), unattended Sequence
  testing via @xyo-network/wallet-xl1-cli, and headless browser-mode testing
  (vitest + Playwright). Includes shared testnet-only safety rules. Activates
  when an agent needs to test, verify, or smoke-test an XL1 dApp or protocol
  change, run on-chain tests against a local chain or Sequence, run headless
  browser tests, or set up unattended / CI testing. Owns the dApp Definition
  of Done gate, required before reporting any XL1 dApp work complete.
metadata:
  version: 1.1.39 # x-release-please-version
  layer: 7
---

# XL1 Testing

The hub for testing and verifying XL1 work. It routes to the right verification
approach, documents each one, and owns the dApp Definition of Done that gates
"done". Read this SKILL to choose an approach, then open the linked sub-doc for
the full procedure.

**Skill identity.** This skill's version is exposed in this file's frontmatter under `metadata.version`. Whenever you present a plan, an acknowledgement, or a completion summary, state which skills informed it, formatted as `<skill-name> v<version>` — read the version from this file's frontmatter, never from an example. When multiple skills from this plugin are active, each may be listed.

## Skill layers

This is **Layer 7** of the XYO skill stack: `xy-development` (1) → `xy-toolchain` (2) → `xyo-knowledge` (3) → `xl1-knowledge` (4) → `xl1-patterns` (5) → `xl1-dapp-kit` (6) → `xl1-testing` (7) → `xl1-scaffold` (8) → `xl1-build` (9).

- **Builds on:** [xl1-dapp-kit](../xl1-dapp-kit/SKILL.md) (6) — when the project uses `@xyo-network/dapp-kit*` / `xl1.dapp.json`; [xl1-patterns](../xl1-patterns/SKILL.md) (5) — the dApp patterns and architecture principles the Definition of Done checks; [xl1-knowledge](../xl1-knowledge/SKILL.md) (4) — chain, gateway, SDK, and the network endpoints under test; [xyo-knowledge](../xyo-knowledge/SKILL.md) (3) — protocol primitives; `xy-toolchain` and `xy-development` from [ariestools-skills](https://github.com/ariestools/ariestools-skills) (1–2) — Vitest layout, `@ariestools/vitest-config`, `xy test` / `xy retest`; testing and workflow conventions, including the generic Definition of Done
- **Hands off to:** [xl1-scaffold](../xl1-scaffold/SKILL.md) (8) — when starting a new XL1 project, which wires these verification paths in from the start; [xl1-build](../xl1-build/SKILL.md) (9) — when the build request is still vague

## [dApp Definition of Done](dapp-checklist.md)

**REQUIRED before reporting any XL1 dApp work as complete.** This skill owns the dApp completion gate. Not optional, not "if you have time" — walk it explicitly and call out pass/fail per relevant section in your completion summary. The checklist enumerates the rules and anti-patterns documented across the skill stack (gateway usage, datalake setup, wallet integration, SDK-first compliance, payload design, indexer floor block, provider architecture, display conventions, commit-reveal correctness, settlement authorities, multi-party co-signing, architecture principles, dApp Kit, headless verification). Sections marked "(if applicable)" can be skipped only when truly out of scope — state which and why. It is Gate 2 of a three-gate completion gate; Gate 1 (the generic DoD from `xy-development`) always applies, and Gate 3 (`PRD.md` acceptance criteria) applies when a `PRD.md` exists.

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
| Same, but let **vitest own the chain** (public packages) — default for new dapp-kit / public consumers | **[Local chain via dApp Kit Vitest](local-chain-dapp-kit-vitest.md)** | `@xyo-network/dapp-kit-vitest-config` `local-xl1` (or its public `api-local` project for existing `spec/api-local` specs) + in-process signer |
| Same vitest-owned chain, but **XYO-internal** restricted harness | **[Local chain via apiLocal](local-chain-vitest.md)** | `@xyo-network/xl1-vitest-config` `apiLocal` (restricted) |
| Test a local XL1 chain and an independently hosted **Aries data/object lake** together, without yet running a real reducer | **[Local chain + Aries data-lake fixture](local-chain-datalake.md)** | Direct `xl1` CLI + `aries dapp` CLI with the noop actor |
| Test a complete local XL1 dApp backend (classic **or** dapp-kit) | **[Full local XL1 dApp stack](local-dapp-stack.md)** | Classic: `aries-dapp-core`. dapp-kit: `xl1-dapp` / local hosts + [dapp-kit vitest](local-chain-dapp-kit-vitest.md) |
| Drive an external, funded actor on Sequence **unattended** | **[Unattended Sequence via CLI wallet](sequence-cli-wallet.md)** | `xl1-wallet` CLI, password in the OS keychain |
| Test **browser-environment code** in headless Chromium | **[Headless browser-mode testing](browser-mode.md)** | vitest browser mode + Playwright provider, MSW-mocked |
| Drive the **fully rendered app UI** | The repo's own e2e package (often `packages/e2e`) if it has one; otherwise **[Full-app Playwright e2e](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-toolchain/testing.md#full-app-playwright-e2e)** (xy-toolchain) | Playwright Test against the real UI, run with `pnpm --filter <e2e-package> test` |
| Drive the **real XL1 Wallet extension** in that e2e — **XYO-internal** | `@xyo-network/wallet-xl1-harness-playwright` + `@xyo-network/wallet-xl1-harness-core` (restricted; `E404` to a logged-out `npm view`). The `walletLocalChainEndpoint` / `walletLocalOnly` options keep the wallet on a [local published chain](local-chain.md#rest-readers-need-a-published-chain) | Playwright Test `walletTest` fixtures (`wallet`, `dappPage`) over the real extension |

### Local chain boot — pick one

| Route | When |
|---|---|
| [`xl1 start`](local-chain.md) | Manual/session debugging; no vitest preset yet |
| [`dapp-kit-vitest-config` `local-xl1`](local-chain-dapp-kit-vitest.md) | **Preferred public** CI/TDD when you can add the published preset (its `api-local` project boots the same public chain for `spec/api-local` specs) |
| [`xl1-vitest-config` `apiLocal`](local-chain-vitest.md) | XYO-internal only (restricted packages) |

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
- **[Local chain via apiLocal](local-chain-vitest.md)** — XYO-internal vitest-owned chain (restricted `@xyo-network/xl1-vitest-config`).
- **[Local chain + Aries data-lake fixture](local-chain-datalake.md)** — chain + Aries stores.
- **[Full local XL1 dApp stack](local-dapp-stack.md)** — classic aries **or** dapp-kit composition.

## Cross-References

- [Node Gateway](../xl1-knowledge/gateway-node.md) — `GatewayBuilder`, REST/S3 gateway, and network endpoints used by the in-process approach.
- [Gateway](../xl1-knowledge/gateway.md) — viewer API, transaction methods, networks, and AttoXL1 units.
- [dApp Definition of Done](dapp-checklist.md) — the completion gate that requires verification.
