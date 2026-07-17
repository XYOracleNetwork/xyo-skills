# Testing with Vitest

## Contents

- [Use the repository test surface](#use-the-repository-test-surface)
- [Configuration](#configuration)
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

## Configuration

For Node tests:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
})
```

For React tests that actually require DOM APIs:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
```

Do not select a DOM environment merely because React is installed. Prefer Node for logic that does not render or access browser APIs.

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

If tests are slow, identify network, filesystem, environment, or setup costs before adding mocks. If watch mode misses changes, verify the include pattern and restart after configuration changes. Use a clean `xy retest` only when the cache is a plausible cause, not as a substitute for diagnosing deterministic failures.
