---
type: llm
weight: 2
---

The user has a React app on :3000 and an xl1-service on :3001 and wants to add
CORS middleware to fix a failing `fetch('/api/games')` in dev.

PASS only if the answer: says not to add CORS for this topology; gives the dev
fix as the Vite dev-server proxy forwarding `/api/*` to `:3001` so the browser
stays same-origin, with the app fetching relative `/api/...` paths; and describes
production as a single domain with a reverse proxy serving the React build at
`/` and forwarding `/api/*` to the service. Mentioning `VITE_API_URL` or `cors`
as the *documented exception for a genuinely cross-origin deployment* is fine
and does not fail the answer.

FAIL if it recommends `cors` middleware as the fix for this same-origin setup,
or makes a hardcoded service host (`VITE_API_URL`) the default wiring.
