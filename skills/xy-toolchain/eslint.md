# ESLint Configuration

## Contents

- [Use the active flat config](#use-the-active-flat-config)
- [Manual configuration](#manual-configuration)
- [Rule tiers](#rule-tiers)
- [Included concerns](#included-concerns)
- [Commands](#commands)
- [Overrides and troubleshooting](#overrides-and-troubleshooting)

## Use the active flat config

Use `@ariestools/eslint-config-flat` for non-React repositories and `@ariestools/eslint-config-react-flat` when React packages are present. The current packages target ESLint 10 and use flat config.

Prefer the generator:

```sh
pnpm xy lint init
```

It detects React, installs the applicable config package and ESLint, generates `eslint.config.ts`, includes repository `.gitignore` behavior when the file exists, and derives root-barrel import restrictions from installed SDK barrels. Review the generated diff before accepting an overwrite.

Do not install retired `@xylabs/*` config packages. Do not use the deprecated static `config` or named tier exports in new configurations; use `recommendedConfig`.

## Manual configuration

Use the generator's output as canonical. A minimal non-React configuration without a root `.gitignore` is:

```ts
import { recommendedConfig } from '@ariestools/eslint-config-flat'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  { ignores: ['build', '**/build/**', 'dist', '**/dist/**', 'node_modules/**'] },
  ...recommendedConfig({ tier: 3, isTypeChecked: true }),
]

export default config
```

When a root `.gitignore` exists, include it with editor/CLI-compatible semantics:

```ts
import { fileURLToPath } from 'node:url'

import { recommendedConfig } from '@ariestools/eslint-config-flat'
import type { Linter } from 'eslint'
import { includeIgnoreFile } from 'eslint/config'

const config: Linter.Config[] = [
  globalThis.process.env.XY_LINT_GITIGNORE === 'false'
    ? { ignores: [] }
    : includeIgnoreFile(fileURLToPath(new URL('.gitignore', import.meta.url)), {
        gitignoreResolution: true,
        name: 'XY repository .gitignore',
      }),
  ...recommendedConfig({ tier: 3, isTypeChecked: true }),
]

export default config
```

Do not hand-repair this pattern when the toolchain can normalize it:

```sh
pnpm xy lint lint --fix
```

For React, import `recommendedConfig` from `@ariestools/eslint-config-react-flat`. Add `configReactStorybook` explicitly only when Storybook files need that layer:

```ts
import {
  configReactStorybook,
  recommendedConfig,
} from '@ariestools/eslint-config-react-flat'

export default [
  ...recommendedConfig({ tier: 3, isTypeChecked: true }),
  ...configReactStorybook,
]
```

## Rule tiers

Each tier includes the tiers below it:

| Tier | Purpose |
|---|---|
| 0 | Correctness: type safety, bug prevention, import restrictions, Markdown |
| 1 | Consistency: formatting, ordering, complexity |
| 2 | Best practices: Unicorn, import validation, workspace rules; React begins here |
| 3 | Opinionated default: optional rules and stricter promotions |
| 4 | Experimental/canary rules for migration testing |

Tier 3 and 4 additions commonly begin as warnings. Use `pnpm xy lint --strict` or `XY_STRICT=1` when warnings must fail CI. Use tier 4 for evaluation, not as an automatic default for every repository.

Set `isTypeChecked: false` when the repository intentionally avoids parser type information. Change the persisted setting safely with:

```sh
pnpm xy lint config get type-checked
pnpm xy lint config set type-checked false
```

Use `pnpm xy lint --type-checked false` for a one-run override.

## Included concerns

The non-React config composes TypeScript ESLint, core JavaScript/JSON/Markdown rules, Import X, simple import sorting, Unicorn, workspace rules, and stylistic rules. It does not currently bundle SonarJS, Prettier, or `eslint-plugin-no-secrets`.

The React config adds React X, React DOM, React Hooks, naming-convention, React Refresh, Web API, and optional Storybook layers.

## Commands

| Command | Use |
|---|---|
| `xy lint [package]` | Run ESLint using the content cache |
| `xy lint --fix` | Apply ESLint fixes |
| `xy lint --fresh` | Clear lint caches and run from a fresh snapshot |
| `xy lint --analyze` | Project current findings across tiers using a tier-4 run |
| `xy lint --no-gitignore` | Temporarily disable repository `.gitignore` filtering |
| `xy lint lint` | Check the local config against toolchain conventions |
| `xy lint lint --fix` | Normalize supported config-package, rule, and `.gitignore` issues |
| `xy lint --rules` | List effective ESLint rules for the project |

The content cache lives under `.xy/cache/eslint` at the repository root. Use `--fresh` when config changes or stale snapshots make results suspect; do not routinely delete all dependencies.

## Overrides and troubleshooting

Place justified local overrides after the recommended config. Run `xy lint lint` to distinguish intentional additions from redundant shared rules and overrides requiring review.

If no files are linted, verify workspace discovery, source globs, meta-package handling, and `--skip-empty`. If type-aware lint is slow or fails on config files, verify the applicable tsconfig before disabling type checking. If ignored files differ between the editor and CLI, run `xy lint lint --fix` and verify both the default run and `--no-gitignore` behavior.
