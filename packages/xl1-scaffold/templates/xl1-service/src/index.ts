import 'dotenv/config'

import express from 'express'

const PORT = Number(process.env.PORT) || 3001
const SMOKE_TEST = process.argv.includes('--smoke-test')

const app = express()

// All routes mount under /api/* so the React app's Vite dev proxy
// (server.proxy['/api'] in vite.config.ts) forwards them here. Same-
// origin from the browser's perspective → no CORS middleware needed.
// See xl1-patterns/browser-service-wiring.md.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const server = app.listen(PORT, () => {
  console.log(`Express server listening on http://localhost:${PORT}`)

  // Smoke-test mode: shut down after 1s. Triggered by `pnpm smoke`.
  if (SMOKE_TEST) {
    setTimeout(() => {
      server.close(() => {
        console.log('Smoke test passed: server booted and shut down cleanly.')
      })
    }, 1000)
  }
})
