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

## Common commands (run from this root)

```shell
pnpm install                  # install + link all workspace packages
pnpm dev                      # run app + service concurrently
pnpm -r run typecheck         # tsc --noEmit across all packages
pnpm -r run lint              # eslint across all packages
pnpm -r run build             # build all packages
pnpm -r run test              # vitest across all packages
pnpm --filter app run dev     # run only one package's dev server
```

## Browser ↔ service wiring

In dev:

- **App (Vite):** `http://localhost:3000`
- **Service (Express):** `http://localhost:3001`

The app calls the service via same-origin `/api/*` requests; Vite's dev server proxies them to `:3001`. Same-origin means no CORS middleware — don't add any. In prod, deploy both behind a single reverse proxy (e.g. Caddy/nginx) that serves the React build at `/` and forwards `/api/*` to the service. The escape hatch (genuinely cross-origin service on a separate subdomain) is documented in the skill stack's `browser-service-wiring.md` pattern doc.

If you need to change the service port, update `PORT` in `packages/service/.env` **and** the proxy target in `packages/app/vite.config.ts` so they stay in sync.
