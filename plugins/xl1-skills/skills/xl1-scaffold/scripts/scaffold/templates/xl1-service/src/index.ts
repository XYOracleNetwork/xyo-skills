import express from 'express'

const PORT = Number(process.env.PORT) || 3000
const SMOKE_TEST = process.argv.includes('--smoke-test')

const app = express()

app.get('/', (_req, res) => {
  res.send('Hello world')
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
