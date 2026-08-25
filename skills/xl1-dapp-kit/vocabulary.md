# Vocabulary

Read this before inventing new names for dapp-kit concepts. Collapsing these terms is the most common agent failure mode.

## Document / identity stack

| Term | Meaning |
|------|---------|
| **Dapp Definition** | Pure protocol: actors, ports, durability, roles — no code paths or secrets |
| **Dapp Configuration** | How one host binds network, providers, placements |
| **Installed Descriptor** | Trusted code + integrity hashes in a host catalog |
| **Dapp Plan / `planId`** | Deterministic compile of definition + config + descriptors — **no I/O** |
| **System Incarnation / Session / Launch** | One provisioned run; restart ⇒ new incarnation; recover from durable state |
| **Host / host partition** | Node process, page, worker, edge invocation |
| **`xl1.dapp.json`** | Repo-facing project manifest (definition + named deployment requests) |
| **Deployment Lock / Run Record** | Deterministic non-secret lock vs volatile run evidence |
| **Host Artifact** | Admitted built code inventory before import |
| **Target composition** | Bind deployable **things** to independent **targets** (e.g. website→Vercel, events→Cloudflare) |

Canonical hashing for dapp-kit documents is **dapp-kit’s own codec** (validate → RFC 8785 JCS → `xyo-dapp-kit:<kind>:vN\n` → SHA-256) — **not** XYO payload/BoundWitness hashing.

## Durability classes (do not collapse)

Chain commitments · datalake bodies · secrets · prepared-effect sidecars · effect journals · admitted event logs · subscription cursors · projections · ephemeral UI state.

Each class has different recovery and privilege rules. Treating “the database” or “Vercel Blob” as a single durability class is wrong.

## Status dimensions

Separate **liveness, readiness, health, convergence, per-operation writability, and incarnation identity**. Never invent a second RPC surface that redefines status outside Dapp Status.

## Profile axes (use-case matrix)

Execution cadence (`on-demand` / `event-driven` / `scheduled` / `resident`) × effect authority × content mode (`chain-only` / `commitment-only` / `datalake-backed`) × lake access × projection × coordination × event delivery × external interaction.

Implemented local references include **UC-01** (chain transfer), **UC-02** (public claim), **UC-03** (confidential evidence). Higher UCs are coverage targets — check the consumer repo before assuming they ship.
