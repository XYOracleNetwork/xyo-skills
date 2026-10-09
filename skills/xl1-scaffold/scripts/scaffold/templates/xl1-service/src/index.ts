import 'dotenv/config'

import { __XL1_NETWORK__ } from '@xyo-network/xl1-sdk'
import express from 'express'

// The __XL1_NETWORK_LABEL__ — chosen with `--network=__XL1_NETWORK_ID__` when this
// project was scaffolded (also recorded as `xl1.network` in package.json —
// the workspace root's, in a monorepo). Build the service's gateway/runner for this network, and keep
// it in step with the app's GatewayProvider. INDEXER_FLOOR_BLOCK is per network.
const NETWORK = __XL1_NETWORK__

const PORT = Number(process.env.PORT) || 3001
const SMOKE_TEST = process.argv.includes('--smoke-test')

const app = express()

// All routes mount under /api/* so the React app's Vite dev proxy
// (server.proxy['/api'] in vite.config.ts) forwards them here. Same-
// origin from the browser's perspective → no CORS middleware needed.
// See xl1-patterns/browser-service-wiring.md.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', network: NETWORK.id })
})

const server = app.listen(PORT, () => {
  console.log(`Express server listening on http://localhost:${PORT} (XL1 network: ${NETWORK.id})`)

  // Smoke-test mode: shut down after 1s. Triggered by `pnpm smoke`.
  if (SMOKE_TEST) {
    setTimeout(() => {
      server.close(() => {
        console.log('Smoke test passed: server booted and shut down cleanly.')
      })
    }, 1000)
  }
})
