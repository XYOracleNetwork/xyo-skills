# Testing with Vitest

## Overview

**Vitest** is the standard test runner for XY Labs projects. It's fast, TypeScript-native, and integrates cleanly with the XY toolchain.

- **Install:** `pnpm add -D vitest`
- **Run:** `pnpm test` (wired to `vitest run` in package.json scripts)

## Setup

### Configuration

Create `vitest.config.ts` in your project root:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

For React projects that need a DOM environment:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
  },
})
```

### package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- `vitest run` — single run (for CI and build pipeline)
- `vitest` — watch mode (for development)

## Test File Conventions

### Naming and Location
- Test files live alongside the source they test
- Name pattern: `<source-file>.spec.ts` or `<source-file>.test.ts`
- Example: `src/game/validateMove.ts` → `src/game/validateMove.spec.ts`

### Structure
Follow the testing principles from [Layer 1](../xy-development/testing.md): Arrange/Act/Assert, behavior-focused naming, test the public interface.

```ts
import { describe, expect, it } from 'vitest'

import { validateMove } from './validateMove.js'

describe('validateMove', () => {
  it('should accept rock, paper, and scissors as valid moves', () => {
    expect(validateMove('rock')).toBe(true)
    expect(validateMove('paper')).toBe(true)
    expect(validateMove('scissors')).toBe(true)
  })

  it('should reject invalid move strings', () => {
    expect(validateMove('lizard')).toBe(false)
  })
})
```

## Relationship to Layer 1

- **Layer 1** (Development Skill) covers testing *principles*: AAA pattern, naming, mocking policy, coverage anti-goals
- **This file** covers the *framework*: Vitest setup, configuration, conventions, and integration

In particular, remember from Layer 1:
- **100% coverage is an anti-goal** — don't chase the number
- **Mocks are minimal and intentional** — only mock external services and system boundaries, not internal modules
- **Test behavior, not implementation** — tests should survive refactoring

## Troubleshooting

### Tests can't resolve imports
- Ensure `vitest.config.ts` has the same path resolution as your `tsconfig.json`
- For monorepos, check that Vitest can resolve workspace packages
- Use `vitest --reporter=verbose` for detailed error output

### Tests are slow
- Check for unnecessary mocking overhead — real implementations are often faster than complex mock setups
- Look for tests that hit the network or file system when they shouldn't
- Use `vitest --run --reporter=verbose` to see timing per test

### Watch mode isn't picking up changes
- Check that the file is included in Vitest's `include` pattern
- Restart Vitest if you've changed the config file
