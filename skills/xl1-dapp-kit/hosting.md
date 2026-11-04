# Hosting and Targets

Read when placing a dApp on Node, browser, Vercel, Cloudflare, or mixed targets.

## Delivery convention

Follow the shared [deployment conventions](https://github.com/ariestools/ariestools-skills/blob/main/skills/xy-development/deployment.md): `<environment>[-<component>]-<target>[-<build-mode>]`. `beta-vercel` / `prod-vercel` select Vercel source builds; `beta-vercel-prebuilt` / `prod-vercel-prebuilt` select CI-built Vercel Build Output uploads. Reserve `-vercel-image` for an implemented CI-built OCI-image route. A Dockerfile built by Vercel still uses `-vercel`. Use `-fly` / `-render` for those targets; preserve existing `-homelab` fleet behavior during a Vercel simplification.

The routine prerelease path is push → one builder → automatic deployment → URL/status. Development and protocol conformance verification remain meaningful, but are not a reason to add full qualification, manual promotion, reviewer or receipt gates to every deployment. Preserve the admitted runtime's protocol/effect/custody policies; an optional deployment CLI or conformance workflow is not an obligatory frontend release orchestrator. Adopt the naming convention when migrating an existing route; retaining a nonconforming name because migration is disruptive requires explicit user approval.

Prefer stable, additive contracts and clients that tolerate temporarily unavailable capabilities so target updates need not be simultaneous. See [dApp architecture principles](../xl1-patterns/architecture-principles.md#deployment-compatibility). Keep a convenient combined deployment together; do not split it merely to demonstrate independence.

## Hosts

| Host | Package | Notes |
|------|---------|-------|
| Node | `@xyo-network/dapp-kit-node` | Catalog, FS journals, WebSocket ports, UC-01..03 references |
| Browser | `@xyo-network/dapp-kit-browser` | Read-oriented; **fail closed** on effectful profiles until browser journal exists (engine MessagePort hosts add one explicit, page-only external-recovery path) |
| Local ownership | `@xyo-network/dapp-kit-local` | Foreground local reconciler for XL1 / lakes / secrets / static sites |

## Deployable things → targets

Declare **things** (`website`, `api`, `datalake`, `event-ingress`, `event-stream`, `subscription-runner`, `indexer`, `controller`, `publisher`) in the Deployment Manifest `xl1.deploy.json` — not in `xl1.dapp.json` — and bind each to exactly one **target**. `indexer`, `controller` (journaled effects) and `publisher` (verified generations) are specialized event sinks on the `subscription-runner` contract. Adapters (`dapp-kit-vercel`, `dapp-kit-cloudflare`, object-store packs) map bindings to provider primitives.

Targets: V1 thing bindings name the target families `vercel` and `cloudflare`. The V2 infrastructure registry also admits `kubernetes` and `proxmox`, but `@xyo-network/dapp-kit-kubernetes` and `@xyo-network/dapp-kit-proxmox` are **schema-only target-plan contracts**: pure analysis of a Lock V3 slice, **no provider I/O** and no provider runtime yet. A valid Kubernetes or Proxmox target plan is not a deployment.

Examples of fail-closed policy (the full matrix is in the Yellow Paper, which is XYO-internal; publicly, each target package's npm README lists what it rejects): do not pretend a **resident** process runs on a platform that only offers invocation bursts; do not let the website thing own the signer.

## Vercel CLI (`xl1-dapp-vercel`)

`@xyo-network/dapp-kit-vercel` ships the `xl1-dapp-vercel` binary: `audit`, `check`, `deploy`, `generate`, `inventory-audit`, `lint`, `plan-promote`, `provision`.

- Every command except `deploy`, `inventory-audit` and `plan-promote` **requires `--lock`** (a verified Deployment Lock) **and `--policy`** (the reviewed Vercel target policy). `--target` defaults to `vercel.target.json`.
- `check`, `generate` and `lint` are offline; `audit` is read-only; `provision` only validates unless given `--apply`; `deploy` is a dry run unless given `--apply --yes`; `plan-promote --apply` is refused (planner only).
- Generate `vercel.json` from the lock with `generate` and check it with `lint`. Do not hand-write it.

## Maturity

- **Local** Node / workerd paths: implemented for several adapters.
- **Credentialed hosted / preview / mixed-target e2e:** often still open. The upstream README no longer carries a status snapshot; current status lives in the private repo's `docs/STATE.md` (XYO-internal). Outside XYO, read the published package READMEs on npm, which state each adapter's qualification limits. Do not claim deploy success without credentialed or preview evidence (L6/L7 — see [Conformance](conformance.md)).

## Anti-patterns

- Deploying a bare frontend as a substitute for the application's admitted protocol runtime, effect policy or custody boundary. Ordinary website delivery does not itself require a new target-composition or artifact-admission ceremony.
- Putting protocol identity into provider project names.
- Browser host silently accepting write profiles.
