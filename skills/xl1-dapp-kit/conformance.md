# Conformance

Read before reporting a dapp-kit-based project “done.”

## Evidence labels

Distinguish **local**, **packed**, **synthetic/simulator**, **credentialed hosted**, **Sequence**, **Mainnet**, and **external-user** evidence. Local or workerd green **does not** imply hosted or production qualification — the dapp-kit README states this boundary explicitly.

## Minimum agent completion expectations

1. `xl1-dapp validate` (and `plan` for the deployment under test) succeeds.
2. Relevant durability classes and recovery path are exercised or explicitly out of scope with reason.
3. Clients talk through **application ports** / documented status — not a one-off shadow API.
4. If event-driven: wake ≠ durable event ≠ cursor discipline held ([Events and wakes](events-and-wakes.md)).
5. Chain access still passes [dApp Definition of Done — Gateway](../xl1-patterns/dapp-checklist.md#gateway--chain-access).
6. Local chain automation (when needed) uses published **`@xyo-network/dapp-kit-vitest-config`** [`local-xl1`](../xl1-testing/local-chain-dapp-kit-vitest.md) — not the XYO-internal `apiLocal` harness, and not a hardcoded `localhost:8080` RPC in parallel CI.
7. State which evidence label you actually produced.

## Conformance culture

Upstream ships language-neutral fixtures and independent verifiers under `dapp-kit/conformance/`. Prefer those vectors over reinventing hash/plan checks when extending the kit.

## Relation to classic DoD

[dApp Definition of Done](../xl1-patterns/dapp-checklist.md) remains required for wallet/React/gateway anti-patterns. dapp-kit adds headless-runtime / ports / recovery / evidence-label gates on top — it does not waive Layer 1 generic DoD from [xy-development workflow](../xy-development/workflow.md).
