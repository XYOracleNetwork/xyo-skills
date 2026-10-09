# Hosting and Targets

Read when placing a dApp on Node, browser, Vercel, Cloudflare, or mixed targets.

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

- “Deploy the Vite app to Vercel” as a substitute for target composition + locks + artifact admission.
- Putting protocol identity into provider project names.
- Browser host silently accepting write profiles.
