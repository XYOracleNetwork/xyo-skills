# Hosting and Targets

Read when placing a dApp on Node, browser, Vercel, Cloudflare, or mixed targets.

## Hosts

| Host | Package | Notes |
|------|---------|-------|
| Node | `@xyo-network/dapp-kit-node` | Catalog, FS journals, WebSocket ports, UC-01..03 references |
| Browser | `@xyo-network/dapp-kit-browser` | Read-oriented; **fail closed** on effectful profiles until browser journal exists |
| Local ownership | `@xyo-network/dapp-kit-local` | Foreground local reconciler for XL1 / lakes / secrets / static sites |

## Deployable things → targets

Declare **things** (website, api, datalake, event-ingress, event-stream, subscription-runner, indexer, …) and bind each to exactly one **target**. Adapters (`dapp-kit-vercel`, `dapp-kit-cloudflare`, object-store packs) map bindings to provider primitives.

Examples of fail-closed policy (see Yellow Paper / hosting docs for the full matrix): do not pretend a **resident** process runs on a platform that only offers invocation bursts; do not let the website thing own the signer.

## Maturity

- **Local** Node / workerd paths: implemented for several adapters.
- **Credentialed hosted / preview / mixed-target e2e:** often still open — check current `dapp-kit` README status snapshot before claiming deploy success.

## Anti-patterns

- “Deploy the Vite app to Vercel” as a substitute for target composition + locks + artifact admission.
- Putting protocol identity into provider project names.
- Browser host silently accepting write profiles.
