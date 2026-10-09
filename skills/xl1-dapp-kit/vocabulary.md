# Vocabulary

Read this before inventing new names for dapp-kit concepts. Collapsing these terms is the most common agent failure mode.

## Document / identity stack

| Term | Meaning |
|------|---------|
| **Dapp Definition** | Pure protocol: actors, ports, durability, roles — no code paths or secrets |
| **Dapp Configuration** | How one host binds network, providers, placements |
| **Installed Descriptor** | Trusted code + integrity hashes in a host catalog |
| **Dapp Plan / `planId`** | Deterministic compile of definition + config + descriptors — **no I/O** (the neutral planner; the `xl1-dapp plan` command around it builds artifacts and writes a lock — see [Project manifest](project-manifest.md)) |
| **System Incarnation / Session / Launch** | One provisioned run; restart ⇒ new incarnation; recover from durable state |
| **Host / host partition** | Node process, page, worker, edge invocation |
| **Dapp Engine / system** | `launchDappEngine` owns one or more **systems** plus application-operation admission, aggregate status and stop (XYO-internal decision D-040). Each system owns one Actor/Provider graph bound to one network (chain id **and** genesis hash), its recovery admission and its own incarnation; `failurePolicy` is `required` (failure fails the engine) or `isolated` (degrades it). Changing a graph is a kit-owned replacement with a new incarnation, never a retarget |
| **External recovery owner** | `createDappExternalRecoveryOwner` — a passive owner over an application's *existing* recovery store/inspector. Construction does no I/O; `refresh()` / `invalidate()` / `close()` / `drain()`; its snapshot feeds the engine port's recovery reader. A cached snapshot is not a lease — the original writer still checks authority under its own locks |
| **`xl1.dapp.json`** | Repo-facing **Project Manifest** (`network.xyo.dapp.project`, V1 — current; no Project Manifest V2 exists): embedded definition, build artifacts, named deployment requests. No target placement |
| **`xl1.deploy.json`** | **Deployment Manifest** (`network.xyo.dapp.deployment`, V1 and V2; V2 current) — a *different*, optional family: secret-free deployment intent, deployable **things**, and their target bindings. V2 adds a root infrastructure registry (`vercel` / `cloudflare` / `kubernetes` / `proxmox`) and placement maps. The local `xl1-dapp` loader reads it next to `xl1.dapp.json` (V1 shape) and fails closed when it disagrees with the embedded requests |
| **Environment catalog** | Closed, versioned catalog (`network.xyo.dapp.environment.catalog`) of resource adapters. Resolution selects exact adapter IDs and versions and records them in the lock. The built-in local catalog resolves only `managed-local` requests; `external` and service-relative `managed` requests need an explicit catalog (`--catalog`) and adapter |
| **Deployment Lock / Run Record** | Deterministic non-secret lock (carries `planId` and its own `lockId`) vs volatile run evidence (allocated ports, incarnation). **Lock V1** is what the local runner emits; **Lock V3** governs the multi-infrastructure path (Kubernetes / Proxmox target plans consume V3). Check which version a tool expects |
| **Host Artifact** | Admitted built code inventory before import |
| **Target composition** | Bind deployable **things** to independent **targets** (e.g. website→Vercel, events→Cloudflare). **Target Composition V3** (`network.xyo.dapp.target.composition`) is the current version, built over a Lock V3 and the per-provider target plans |

**Two manifests, two families.** `xl1.dapp.json` and `xl1.deploy.json` are read together, each against its own schema. Do not merge them, do not call Project Manifest V1 superseded, and read "Manifest V2" as **Deployment** Manifest V2.

Canonical hashing for dapp-kit documents is **dapp-kit’s own codec** (validate → RFC 8785 JCS → `xyo-dapp-kit:<kind>:vN\n` → SHA-256) — **not** XYO payload/BoundWitness hashing.

## Durability classes (do not collapse)

Chain commitments · datalake bodies · secrets · prepared-effect sidecars · effect journals · admitted event logs · subscription cursors · verified checkpoints · projections · ephemeral UI state.

Each class has different recovery and privilege rules. Treating “the database” or “Vercel Blob” as a single durability class is wrong. Operational **checkpoints** (`checkpoint-store`: verified application progress, distinct from queue delivery and unfinalized chain observations) are not **projections** (`projection-store`: rebuildable derived objects and published generations) — they have different reconstruction and trust rules even when both sit on object storage.

## Status dimensions

Separate **liveness, readiness, health, convergence, per-operation writability, and incarnation identity**. Never invent a second RPC surface that redefines status outside Dapp Status.

## Profile axes (use-case matrix)

Execution cadence (`on-demand` / `event-driven` / `scheduled` / `resident`) × effect authority × content mode (`chain-only` / `commitment-only` / `datalake-backed`) × lake access × projection × coordination × event delivery × external interaction.

Implemented local references include **UC-01** (chain transfer), **UC-02** (public claim), **UC-03** (confidential evidence). Higher UCs are coverage targets — check the consumer repo before assuming they ship.
