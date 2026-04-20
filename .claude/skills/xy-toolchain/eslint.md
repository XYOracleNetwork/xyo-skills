# ESLint Configuration

## @xylabs/eslint-config-flat

The standard ESLint configuration for XY Labs projects. Uses the modern [flat config format](https://eslint.org/docs/latest/use/configure/configuration-files) (ESLint 9.x).

- **Package:** `@xylabs/eslint-config-flat`
- **Install:** `pnpm add -D @xylabs/eslint-config-flat eslint`
- **Format:** Flat config (`eslint.config.mjs` or `eslint.config.js`)

Do **not** use `@xylabs/eslint-config` (legacy format) for new projects.

### What It Includes

The config bundles and configures these concerns:
- **TypeScript** — `@typescript-eslint` rules for type-safe linting
- **Import management** — import ordering, no unused imports, no circular dependencies
- **Unicorn** — modern JavaScript best practices
- **SonarJS** — code quality and bug detection
- **Deprecation** — flags usage of deprecated APIs
- **Security** — `eslint-plugin-no-secrets` to prevent accidental secret commits
- **Formatting** — consistent code style via Prettier integration
- **Monorepo support** — workspace-aware rules

## Setup

### New Project

Create `eslint.config.mjs` in your project root:

```js
import { defaultConfigs } from '@xylabs/eslint-config-flat'

export default [
  ...defaultConfigs,
]
```

### Extending or Overriding Rules

Add overrides after the default configs:

```js
import { defaultConfigs } from '@xylabs/eslint-config-flat'

export default [
  ...defaultConfigs,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Override specific rules with justification
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
]
```

### Ignoring Paths

```js
import { defaultConfigs } from '@xylabs/eslint-config-flat'

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  ...defaultConfigs,
]
```

## Running the Linter

Always use the toolchain commands rather than running ESLint directly:

- `package-lint` — standard lint run
- `package-lint-verbose` — lint with detailed output for debugging
- `package-fix` — auto-fix all fixable issues
- `package-relint` — clear lint cache and re-run (useful when config changes aren't being picked up)

## Troubleshooting

### Lint errors you don't understand
- Read the rule name in the error output and look it up in the relevant plugin's docs
- Don't suppress rules just to make the build pass — understand what the rule is protecting against first
- If the rule is genuinely wrong for your case, override it in eslint config with a comment explaining why

### Import ordering issues
- The config enforces a specific import order. Let `package-fix` auto-fix these rather than sorting manually
- If auto-fix doesn't resolve it, check for circular imports which can confuse the ordering plugin

### Type-aware lint rules are slow
- Type-aware rules (`@typescript-eslint` rules that need type information) require a full TypeScript compilation pass
- Make sure your tsconfig includes all the files being linted
- For monorepos, each package needs its own tsconfig referenced by the ESLint config

### Config not being picked up
- Ensure the file is named `eslint.config.mjs` (or `eslint.config.js` with `"type": "module"` in package.json)
- The flat config format is not backwards-compatible with `.eslintrc.*` — don't mix formats
- Run `package-relint` to clear any cached config
