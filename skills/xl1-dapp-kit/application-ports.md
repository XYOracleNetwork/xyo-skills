# Application Ports

Read when defining how clients talk to a headless dApp runtime.

## Thesis

Application ports are typed **commands / queries / status / admin / port-subscriptions** over validated **port frames**. They are **not** Express REST as the protocol, and **not** reflective actor RPC exposed to the UI.

Transports:

- **WebSocket** — complete port surface (Node)
- **MessagePort** — browser attachment
- **HTTP** — health / static / unary convenience only — do not reinvent the whole protocol as ad-hoc `/api/*` JSON

UI never receives signing keys, provider locators, or actor handles merely because it shares a repo or origin.

## Relation to `xl1-patterns` browser ↔ service wiring

[Browser ↔ Service Wiring](../xl1-patterns/browser-service-wiring.md) remains the default for **classic** React+HTTP monorepos (`:3000` / `:3001`, `/api/*` proxy). dapp-kit ports are the **protocol** boundary for headless runtimes; HTTP may still front them, but the contract is port frames + status projection — not a second bespoke REST schema per feature.

## Anti-patterns

- Exposing ambient “call any actor method” from the page.
- Duplicating Dapp Status as a hand-rolled health JSON that disagrees with the runtime.
- CORS-by-default when same-origin reverse proxy would suffice for classic layouts.
