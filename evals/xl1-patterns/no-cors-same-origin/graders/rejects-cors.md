---
type: llm
weight: 2
---

The user has a React app on :3000 and an xl1-service on :3001 and wants to add
CORS middleware to fix a failing `fetch('/api/games')` in dev.

PASS if the answer says not to add CORS, and that the fix is the Vite dev proxy
forwarding `/api/*` to the service so the browser stays same-origin, with the
app fetching relative paths. Mentioning CORS in order to reject it is fine.

FAIL if it recommends adding the `cors` middleware as the fix, or suggests
hardcoding the service host (e.g. a `VITE_API_URL`) into the app.
