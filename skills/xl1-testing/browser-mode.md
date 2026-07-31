# Headless Browser-Mode Testing (vitest + Playwright)

> Sub-doc of [xl1-testing](SKILL.md). Runs **browser-environment code** in a real
> headless Chromium via vitest's browser mode. "Headless" here means *no visible
> browser window* — distinct from the on-chain "headless verification" methods
> (which run **without** a browser at all).

Some XL1 code only exists — or only behaves correctly — in a real browser:

- the in-page gateway (`InPageGatewaysProvider` / `buildGateway`, `transport: 'rpc' | 'rest'`),
- the `IndexedDbArchivist` in-page datalake,
- `PostMessageRpcTransport` wallet ↔ dApp wiring,
- the browser conditional builds of `@xyo-network/xl1-sdk/gateway` and `/providers`,
- React hooks/components that touch `window`, `IndexedDB`, or `postMessage`.

jsdom/node fakes these badly. Vitest **browser mode** runs the specs inside an
actual headless Chromium (driven by Playwright), so they exercise the real
browser APIs. This is a fast unit/integration surface — for driving the fully
rendered application UI end-to-end, use full-app Playwright e2e instead (the
`xylabs-e2e-setup` skill).

## Accessibility

Fully accessible — everything is public third-party tooling
(`@vitest/browser-playwright`, `playwright`, `vitest`, `msw`, and optionally
`@ariestools/vitest-config`) exercising your own code plus the public
`@xyo-network/xl1-sdk`. No restricted packages.

## Setup

Install the browser-mode toolchain and the Chromium binary Playwright drives:

```sh
pnpm add -D vitest @vitest/browser-playwright playwright msw
# monorepos: prefer the shared preset
pnpm add -D @ariestools/vitest-config
npx playwright install chromium
```

### Preferred: `@ariestools/vitest-config`

For monorepos that follow org-standard `spec/` layout, use the shared preset from
[xy-toolchain testing](../xy-toolchain/testing.md). The consumer injects the
Playwright provider so Playwright stays optional for node-only repos:

```ts
import { defineXyVitestConfig } from '@ariestools/vitest-config'
import { playwright } from '@vitest/browser-playwright'

export default defineXyVitestConfig({
  browser: { provider: playwright() },
  // Optional: monorepo-wide setup for MSW, etc.
  // projects can also be extended for serialized e2e suites
})
```

Spec-directory routing under the preset:

| Path | Runs in |
|---|---|
| `…/spec/…` (not under `node` or `browser`) | Node **and** browser projects |
| `…/spec/node/…` | Node only |
| `…/spec/browser/…` | Browser (headless Chromium) only |

Put browser-only suites under `spec/browser/`. Keep shared logic under plain
`spec/` when both realms should run it.

If the preset's default browser options need a force-headless override for a
particular repo, pass the matching options through `browser` (or compose with
`defineXyVitestProjects` + a custom top-level config). Prefer inspecting the
installed `@ariestools/vitest-config` defaults over re-copying a full projects
array.

### Hand-rolled browser project

Use this only when the repo is not on the shared preset, or when you must keep
an existing multi-project layout that the preset does not yet express:

```ts
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      // ...node/offline projects...
      {
        test: {
          name: 'browser',
          include: ['src/spec/**/*.spec.ts', 'packages/**/src/**/spec/**/*.spec.ts'],
          exclude: ['**/spec/node/**'], // node-only specs stay out of the browser run
          setupFiles: ['test/setup/browser.ts'],
          browser: {
            enabled: true,
            headless: true,            // <-- no visible window; required for CI/agents
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
```

Keep cross-environment specs in `spec/` (they run in both node and browser
projects when both exist), browser-only specs under `spec/browser/` (or where
the browser project includes them), and node-only specs under `spec/node/`
(excluded above).

### Network mocking (MSW)

Browser specs must not hit the real network. The setup file starts an MSW browser
worker that **errors on any unhandled request**, so a stray fetch fails loudly
instead of silently reaching out:

```ts
// test/setup/browser.ts
import { setupWorker } from 'msw/browser'
import { afterAll, beforeAll } from 'vitest'

const worker = setupWorker(/* ...handlers... */)

beforeAll(async () => {
  await worker.start({ onUnhandledRequest: 'error', quiet: true })
})

afterAll(() => {
  worker.stop()
})
```

Wire `setupFiles` through the preset (`test.setupFiles` / project options) or the
hand-rolled `setupFiles` field above.

For flows that need a live chain instead of mocks, don't use browser mode — point
a [local dev-chain](local-chain.md) or [Sequence](headless-testnet-verification.md)
run at the code under test.

## Running

```sh
pnpm vitest run --project browser          # just the browser project, headless
pnpm xy test                               # all projects, browser included
```

With headless Chromium this needs no display, so it runs in CI and unattended
agent sessions without a virtual framebuffer. For hand-rolled configs, keep
`headless: true` (or set it `false` locally when you want to watch the browser to
debug).

## When to use this vs. full-app e2e

| | Headless browser mode (this doc) | Full-app Playwright e2e (`xylabs-e2e-setup`) |
|---|---|---|
| Scope | browser-environment **units/integration** (hooks, in-page gateway, IndexedDB, transports) | the **rendered app** and real user journeys |
| Speed | fast, per-module | slower, full app boot |
| Network | mocked (MSW) | usually the real dev server / backend |
| Browsers | headless Chromium (add instances as needed) | Chromium, Firefox, WebKit |

Use browser mode for the fast inner loop on browser-only code; use Playwright e2e
to validate the assembled UI.

## Cross-References

- [xl1-testing](SKILL.md) — the testing barrel this approach belongs to.
- [xy-toolchain testing](../xy-toolchain/testing.md) — `@ariestools/vitest-config`, `spec/` layout, `xy test` / `xy retest`.
- `xylabs-e2e-setup` skill — scaffolds a full-app Playwright e2e package (Chromium/Firefox/WebKit).
- [Browser Gateway](../xl1-knowledge/gateway-browser.md) — the in-page gateway / `InPageGatewaysProvider` code this mode is well-suited to test.
