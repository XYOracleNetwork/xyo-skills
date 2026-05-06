# Browser ↔ Service Wiring

Read this pattern when scaffolding any XL1 dApp where a React app talks to a companion HTTP service (the default monorepo layout: `packages/app` + `packages/service`). It names the prescriptive defaults — port pair, API base path, dev proxy, prod topology — that the scaffold templates already wire up. The point is to give the agent and the user a single answer for "how does the browser reach the service?" rather than a per-project re-decision that drifts into CORS complexity.

**Builds on:**
- [Chain Data Indexing — Service](chain-data-indexing-service.md) — the long-running indexer that's the most common reason a dApp has a service in the first place
- [Browser UX](browser-ux.md) — how the React side renders results from service calls

---

## The Prescription

| Concern | Default |
|---|---|
| App port (Vite dev server) | `3000` |
| Service port (Express) | `3001` (env-overridable via `PORT`) |
| API base path | `/api/*` — every service route mounts under it |
| Dev cross-origin handling | None — Vite proxies `/api/*` to `:3001` |
| Prod cross-origin handling | None — single domain, reverse proxy serves React build at `/` and forwards `/api/*` |
| CORS middleware on the service | **Not added.** There is nothing to CORS for in the default story. |

The scaffold's `react`, `xl1-service`, and `xl1-monorepo` templates encode all of this. Don't re-derive it per project.

---

## Why Same-Origin by Default

CORS is a real protocol with real complexity — preflight requests, credentials handling, header allowlists, environment-specific configuration. Every line of CORS middleware on a service is a place where a bug can silently ship: dev passes, prod's stricter origin rejects, users see `fetch` failures with no clear server log. The cheapest way to never debug a CORS issue is to never have one.

Same-origin makes this trivial:

- **Dev:** the browser hits `http://localhost:3000/api/health`, Vite forwards to `http://localhost:3001/api/health`, the response comes back through Vite. The browser never sees `:3001` — it's same-origin all the way.
- **Prod:** a reverse proxy (Caddy, nginx, Cloudflare, your hosting platform) serves the static React build at `/` and forwards `/api/*` to the service. The browser hits `https://yourdomain.com/api/health` — same origin as the page.

In both modes, no CORS middleware on the service, no `VITE_API_URL` to wire up, no environment-specific origin allowlists. The service code looks the same in dev and prod.

---

## What the Templates Wire Up

### React app (`packages/app/vite.config.ts`)

```ts
server: {
  port: 3000,
  proxy: {
    '/api': { target: 'http://localhost:3001', changeOrigin: true },
  },
},
```

`changeOrigin: true` rewrites the `Host` header so the service sees `localhost:3001` instead of `localhost:3000` — matters if the service ever reads `req.hostname` for routing.

### xl1-service (`packages/service/src/index.ts`)

```ts
const PORT = Number(process.env.PORT) || 3001

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})
```

Every new route follows the `/api/*` convention. Don't mount routes at the root — that breaks the proxy rule and leaks the service's URL shape into the app.

### React fetch calls

```ts
// In a React component or hook
const res = await fetch('/api/health')
const data = await res.json()
```

No `import.meta.env.VITE_API_URL`. No `${window.location.origin}/api/...` (unnecessary — relative paths already do that). Just `/api/<route>`.

### Workspace dev script (`package.json` at the monorepo root)

```json
"scripts": {
  "dev": "pnpm -r --parallel run dev"
}
```

`pnpm dev` from the root runs the app's Vite server and the service's `tsx --watch` concurrently in one terminal. Packages without a `dev` script (e.g. `xl1-shared`) are skipped.

---

## Production Topology

The prod story is "one domain, reverse proxy in front." Concretely, with Caddy:

```
yourdomain.com {
  handle /api/* {
    reverse_proxy localhost:3001
  }
  handle {
    root * /var/www/app-dist
    try_files {path} /index.html
    file_server
  }
}
```

Or with nginx:

```nginx
server {
  server_name yourdomain.com;
  location /api/ {
    proxy_pass http://localhost:3001;
  }
  location / {
    root /var/www/app-dist;
    try_files $uri /index.html;
  }
}
```

Or with a managed platform (Vercel, Fly, Railway, Render): configure rewrites so `/api/*` hits the service container and everything else serves the static build. The mechanism varies; the topology doesn't.

---

## When You Genuinely Need Cross-Origin (The Escape Hatch)

A small number of dApps have a real reason to deploy the service on a separate origin — e.g. the service is a public API consumed by third parties, or it's hosted on infrastructure (Cloudflare Workers, a separate subdomain) that can't sit behind the same reverse proxy as the app. In those cases:

1. Set `VITE_API_URL=https://api.yourdomain.com` in the app's `.env` and use it in `fetch` calls: `fetch(\`\${import.meta.env.VITE_API_URL}/some-route\`)`. Routes still mount under `/api/*` on the service for consistency.
2. Add a CORS middleware on the service with an explicit origin allowlist — never `*` if the service handles credentials or signed requests:
   ```ts
   import cors from 'cors'
   app.use(cors({ origin: ['https://yourdomain.com'], credentials: true }))
   ```
3. Test the preflight path explicitly. A `curl -X OPTIONS -H 'Origin: https://yourdomain.com' -H 'Access-Control-Request-Method: POST' https://api.yourdomain.com/api/whatever -i` should return `Access-Control-Allow-Origin` matching the request origin.

Treat this as the exception, not the default. If you find yourself reaching for it in a single-team dApp, ask whether a reverse proxy would be simpler.

---

## Anti-Patterns

| Anti-Pattern | Why it fails | Do this instead |
|---|---|---|
| Adding `cors()` middleware "just in case" | Trains agents to assume cross-origin layouts; obscures the same-origin default; a misconfigured allowlist silently breaks prod | Leave CORS off. Add it only when deliberately deploying cross-origin (and document the choice) |
| Mounting routes at the root (`app.get('/health', ...)`) | Breaks the `/api/*` proxy rule — the React app would have to fetch the service's absolute URL, defeating the whole point | Mount under `/api/*`, even for "internal" or "infrastructure" routes |
| Using `VITE_API_URL` in dev | Defeats the proxy and reintroduces cross-origin where none exists. Forces every contributor to set the env var locally | Use relative paths: `fetch('/api/foo')`. The proxy handles routing |
| Hardcoding `http://localhost:3001` in React fetch calls | Same problem as `VITE_API_URL`, but worse — it ships to prod and breaks immediately | Always relative |
| Service port collisions ("3001 is in use, I'll use 3002") | Now the proxy target in `vite.config.ts` and the README and any CI config drift from the actual port. The wiring is no longer documented anywhere | Either kill what's holding `:3001` (it's almost always a stale dev server), or change `PORT` in service `.env` *and* the proxy target in `vite.config.ts` *and* the README in one commit so they stay in sync |
| Running app and service in separate terminals when both could share `pnpm dev` | Easy to forget one; "the page loads but the API 404s" is the most common new-contributor confusion | `pnpm dev` from the workspace root runs both |
| Adding a separate "API gateway" package between app and service | Premature; the service IS the gateway. The pattern this doc describes already gives you single-origin and a clean URL space | Direct app → service via the proxy. Add a real gateway only if you have a real reason (multiple backend services, auth offload, rate limiting at the edge) |

---

## Cross-References

- [Chain Data Indexing — Service](chain-data-indexing-service.md) — the most common service shape in an XL1 dApp; mounts its routes under `/api/*` like everything else
- [Browser UX](browser-ux.md) — how the app side consumes service responses
- [dApp Definition of Done — Browser ↔ Service Wiring](dapp-checklist.md) — the completion-gate items derived from this pattern
