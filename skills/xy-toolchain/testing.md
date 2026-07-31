# Testing with Vitest

## Contents

- [Use the repository test surface](#use-the-repository-test-surface)
- [Shared preset (`@ariestools/vitest-config`)](#shared-preset-ariestoolsvitest-config)
- [Hand-rolled configuration](#hand-rolled-configuration)
- [Spec location](#spec-location)
- [Running tests](#running-tests)
- [Test structure](#test-structure)
- [Troubleshooting](#troubleshooting)

## Use the repository test surface

Vitest is the standard runner, but the repository script is the first source of truth:

1. If `package.json` defines `test`, run the applicable package-manager script.
2. Use `xy test` when the repository exposes the toolchain directly or when targeting a workspace/path through it.
3. Use the local Vitest binary directly only for targeted flags the wrapper does not expose.

`xy build` does not run tests. A green build is not a green test suite.

## Shared preset (`@ariestools/vitest-config`)

For monorepos that follow the org-standard layout, prefer [`@ariestools/vitest-config`](https://github.com/ariestools/toolchain/tree/main/packages/vitest-config) over copy-pasted Vitest projects. It is the Vitest-shaped sibling of the flat ESLint configs: one root config encodes node + optional real-Chromium browser projects, with environment routed by spec directory.

Install as a dev dependency (peer: `vitest`). Add `@vitest/browser-playwright` and `playwright` only when browser projects are enabled:

```sh
pnpm add -D @ariestools/vitest-config vitest
# optional browser realm:
pnpm add -D @vitest/browser-playwright playwright
```

Root `vitest.config.ts` without browser specs:

```ts
import { defineXyVitestConfig } from '@ariestools/vitest-config'

export default defineXyVitestConfig()
```

With headless Chromium (provider is always injected by the consumer so Playwright stays optional):

```ts
import { defineXyVitestConfig } from '@ariestools/vitest-config'
import { playwright } from '@vitest/browser-playwright'

export default defineXyVitestConfig({ browser: { provider: playwright() } })
```

Serialized e2e suites (local chains, funded wallets, long timeouts) are extra projects:

```ts
import { defineXySerializedProject, defineXyVitestConfig } from '@ariestools/vitest-config'
import { playwright } from '@vitest/browser-playwright'

export default defineXyVitestConfig({
  browser: { provider: playwright() },
  exclude: ['**/spec/**/sequence/**'],
  projects: [
    defineXySerializedProject({
      include: ['packages/e2e/src/**/spec/sequence/**/*.spec.ts'],
      name: 'sequence',
      testTimeout: 900_000,
    }),
  ],
})
```

### Defaults and options

Default include: `packages/*/src/**/spec/**/*.spec.ts`.

| Option | Default | Description |
|---|---|---|
| `include` | monorepo `packages/*/src/**/spec/**/*.spec.ts` | Spec globs shared by the node and browser projects |
| `exclude` | `[]` | Extra excludes appended to both realm projects |
| `browser` | omitted | Browser project options (`provider` required); omit or `false` to skip |
| `node` | `{}` | Node project options; `false` to skip |
| `projects` | `[]` | Extra projects appended verbatim |
| `test` | `{ watch: false }` | Top-level test options merged over the defaults |

`defineXyVitestProjects` returns only the projects array for callers that compose their own top-level config. `defineXySerializedProject` builds a single-file-at-a-time Node project with org-standard long timeouts (`hookTimeout: 180_000`, `testTimeout: 240_000` unless overridden).

### Spec-directory environment routing

Under the shared preset, path segments select the realm:

| Path segment | Runs in |
|---|---|
| `…/spec/…` (not under `node` or `browser`) | Both node and browser projects |
| `…/spec/node/…` | Node only |
| `…/spec/browser/…` | Browser (headless Chromium) only |

Do not select a DOM or browser environment merely because React is installed. Prefer Node for logic that does not render or access browser APIs; put browser-only suites under `spec/browser/` (or exclude `**/spec/node/**` from the browser project if using a hand-rolled config).

Inspect the repository's existing `vitest.config.ts` before introducing the preset. Prefer the preset for new monorepos and when consolidating duplicated configs; keep a hand-rolled config when the package is a single-package repo or deliberately diverges.

For **XL1 browser-environment** verification (in-page gateway, IndexedDB datalake, PostMessage transports, MSW-mocked network), use this preset (or an equivalent browser project) and follow the XL1-specific procedure in [xl1-testing browser-mode](../xl1-testing/browser-mode.md). That skill owns when to use browser mode vs on-chain headless verification; this skill owns shared Vitest layout and the `@ariestools/vitest-config` surface.

## Hand-rolled configuration

For single-package repos or intentional one-offs, a minimal Node config is:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
})
```

For React tests that actually require DOM APIs without the browser project:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
```

A conventional script surface is:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

## Spec location

Use `.spec.ts` as the canonical XY test suffix. Place every `.spec.ts` file inside any directory named `spec/` at any depth within its package.

Valid layouts include:

```text
spec/foo.spec.ts
src/spec/foo.spec.ts
src/game/spec/foo.spec.ts
packages/example/src/spec/node/fs.spec.ts
packages/example/src/spec/browser/dom.spec.ts
```

This is invalid because no `spec/` directory is an ancestor of the file:

```text
src/game/foo.spec.ts
```

The rule does not require one package-root `spec/` directory. Nested `spec/` directories are explicitly allowed. Avoid standardizing on colocated `.test.ts` files: the current repository-layout rule and compiler exclusions are built around `.spec.ts` and `spec/` conventions.

## Running tests

Use the existing script for the normal suite:

```sh
pnpm test
```

Use the toolchain for all tests, one workspace, or one file/folder path:

```sh
pnpm xy test
pnpm xy test @scope/package
pnpm xy test packages/example/src/spec/example.spec.ts
```

Clear the Vitest cache before rerunning when stale transformed output is credible:

```sh
pnpm xy retest
pnpm xy retest @scope/package
```

For name filters or reporters not exposed by `xy test`, invoke the installed Vitest through the package manager in the correct package:

```sh
pnpm exec vitest run path/to/spec/example.spec.ts
pnpm exec vitest run -t "behavior name"
```

Do not use a globally installed Vitest or assume a package-local `test` script exists.

## Test structure

Follow the principles in [Layer 1](../xy-development/testing.md): arrange/act/assert, behavior-focused naming, public-interface testing, minimal boundary mocks, and no pursuit of coverage for its own sake.

```ts
import { describe, expect, it } from 'vitest'

import { validateMove } from '../validateMove.js'

describe('validateMove', () => {
  it('accepts supported moves', () => {
    expect(validateMove('rock')).toBe(true)
  })

  it('rejects unsupported moves', () => {
    expect(validateMove('lizard')).toBe(false)
  })
})
```

## Troubleshooting

If imports fail, compare Vitest resolution with tsconfig paths and workspace export maps. If a test file fails during `xy compile`, fix its TypeScript error even though the file is excluded from emitted package entries: full validation intentionally includes specs.

If the shared preset skips browser tests, verify `browser.provider` is set and Playwright is installed. If monorepo globs miss packages, override `include` rather than abandoning the preset wholesale.

If tests are slow, identify network, filesystem, environment, or setup costs before adding mocks. If watch mode misses changes, verify the include pattern and restart after configuration changes. Use a clean `xy retest` only when the cache is a plausible cause, not as a substitute for diagnosing deterministic failures.
