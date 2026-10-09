# XL1 monorepo

A pnpm workspace for an XL1 dApp split into sub-packages under `packages/`. Common layout:

- `packages/app` — React + Vite frontend (scaffolded with `--template=react`)
- `packages/service` — Express HTTP backend (scaffolded with `--template=xl1-service`)
- `packages/shared` — TypeScript library for code shared between app and service (`--template=xl1-shared`)

## Workspace dependencies

To consume `shared` from `app` or `service`, add to that package's `package.json`:

```json
{
  "dependencies": {
    "@<your-scope>/shared": "workspace:*"
  }
}
```

Then `pnpm install` at the workspace root links it.

Consumers import shared's **compiled** output — its `package.json` `exports` map points at `dist/index.js` + `dist/index.d.ts` — so `shared` must be built before `app` or `service` can typecheck, lint, test or run against it. The root scripts below do that for you; if you run `pnpm -r run …` or `pnpm --filter …` directly, run `pnpm build:shared` first, and again whenever you change shared's exports.

## Common commands (run from this root)

```shell
pnpm install                  # install + link all workspace packages
pnpm build:shared             # build packages/shared (dist/) — consumers resolve it from there
pnpm dev                      # build shared, then run app + service concurrently
pnpm typecheck                # build shared, then tsc --noEmit across all packages
pnpm lint                     # build shared, then eslint across all packages
pnpm build                    # build all packages (topological: shared first)
pnpm test                     # build shared, then vitest across all packages
pnpm --filter app run dev     # run only one package's dev server (build shared first)
```

## Browser ↔ service wiring

In dev:

- **App (Vite):** `http://localhost:3000`
- **Service (Express):** `http://localhost:3001`

The app calls the service via same-origin `/api/*` requests; Vite's dev server proxies them to `:3001`. Same-origin means no CORS middleware — don't add any. In prod, deploy both behind a single reverse proxy (e.g. Caddy/nginx) that serves the React build at `/` and forwards `/api/*` to the service. The escape hatch (genuinely cross-origin service on a separate subdomain) is documented in the skill stack's `browser-service-wiring.md` pattern doc.

If you need to change the service port, update `PORT` in `packages/service/.env` **and** the proxy target in `packages/app/vite.config.ts` so they stay in sync.
