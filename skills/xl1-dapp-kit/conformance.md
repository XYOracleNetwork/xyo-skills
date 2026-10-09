# Conformance

Read before reporting a dapp-kit-based project “done.”

## Evidence labels

Two vocabularies, one ladder.

**The canonical L1–L9 ladder** (dapp-kit Program Rules §4, XYO-internal):

| Level | Name | Proves |
|---|---|---|
| L1 | model/vector | Canonical bytes, hashes, schemas, transitions, error codes |
| L2 | deterministic runtime | Runtime and recovery behavior over test-owned fakes |
| L3 | host runtime | Real process, filesystem, signal and browser-realm behavior; packed clean-consumer install |
| L4 | local provider simulator | The provider's own runtime run locally (workerd, a disposable `kind` cluster) |
| L5 | local protocol plane | Real submission, inclusion, finality and read-back on an owned local XL1 + Aries datalake |
| L6 | credentialed provider | Real account-scoped provider API, storage and queue behavior |
| L7 | deployed preview and external user | Deployed access, redeploy, promotion, rollback; a flow run by someone outside the build |
| L8 | network protocol qualification | Sequence or Mainnet, explicitly configured and funded |
| L9 | production operations | Sustained operation under real load, alerting and incident response |

No level implies any higher level. Above L3 there are two independent axes: **infrastructure** (L4, L6, L7, L9) and **protocol** (L5, L8). A pass on one axis is no evidence on the other — a credentialed Vercel run is not local-XL1 evidence, and a local-XL1 run is not provider evidence. No local, packed, synthetic or native-simulator result implies credentialed hosting, Sequence, Mainnet, external-user or production qualification.

**The runner's `evidence` label.** Each `verification` entry in `xl1.dapp.json` declares exactly one of eight values: `model` (L1), `deterministic` (L2), `node` (L3), `browser` (L3), `local-xl1` (L5), `local-datalake` (L5), `sequence` (L8), `mainnet` (L8). `xl1-dapp test` reports the label verbatim and never promotes it because a script exited 0. A label may be narrowed when you report it, never widened.

## Minimum agent completion expectations

1. `xl1-dapp validate` (and `plan` for the deployment under test) succeeds.
2. `xl1-dapp test --deployment <name>` runs the deployment's declared verifications and passes. Every deployment request must declare at least one `verification` entry (`id`, `package`, `script`, `evidence`) — validation rejects a deployment without one.
3. Relevant durability classes and recovery path are exercised or explicitly out of scope with reason.
4. Clients talk through **application ports** / documented status — not a one-off shadow API.
5. If event-driven: wake ≠ durable event ≠ cursor discipline held ([Events and wakes](events-and-wakes.md)).
6. Chain access still passes [dApp Definition of Done — Gateway](../xl1-testing/dapp-checklist.md#gateway--chain-access).
7. Local chain automation (when needed) uses published **`@xyo-network/dapp-kit-vitest-config`** [`local-xl1`](../xl1-testing/local-chain-dapp-kit-vitest.md) — not the restricted, XYO-internal `@xyo-network/xl1-vitest-config` `apiLocal` harness, and not a hardcoded `localhost:8080` RPC in parallel CI. (The public preset's own `apiLocal` installer is fine: it boots the same published-CLI chain for specs under `spec/api-local`.)
8. State which evidence label you actually produced, and its L-level.

## Conformance culture

Upstream keeps language-neutral fixtures and independent verifiers under `conformance/` in the private dapp-kit repo, plus the private `@xyo-network/dapp-kit-conformance` package (shared Lock V3, provider target-plan and Target Composition V3 fixtures). Both are **XYO-internal**: not on npm. Inside XYO, prefer those vectors over reinventing hash/plan checks when extending the kit. Outside XYO, use the verifiers the public packages export (`verifyDappDeploymentLock`, `verifyDappDeploymentLockV3`, `verifyDappTargetCompositionV3`, and each target package's plan verifier) and the npm package READMEs.

## Relation to classic DoD

The [dApp Definition of Done](../xl1-testing/dapp-checklist.md) (Gate 2, owned by xl1-testing) remains required for wallet/React/gateway anti-patterns. dapp-kit adds headless-runtime / ports / recovery / evidence-label gates on top — it does not waive Gate 1, the generic DoD in [`xy-development` (ariestools-skills) — workflow § Definition of Done](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-development/workflow.md#definition-of-done).
