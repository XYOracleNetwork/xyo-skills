# Compilation and Package Output

## Contents

- [Configuration](#configuration)
- [Target selection](#target-selection)
- [Compile modes](#compile-modes)
- [Type validation](#type-validation)
- [Monolith mode](#monolith-mode)
- [Vendor mode](#vendor-mode)
- [Troubleshooting](#troubleshooting)

## Configuration

Create `xy.config.ts` and type it from the active toolchain:

```ts
import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  compile: {
    mode: 'library',
  },
}

export default config
```

Root configuration cascades to packages under that root. Package-level configuration overrides or deep-merges the applicable root settings. Put command-specific settings under `commands` rather than deprecated top-level `deplint` or `publint` fields.

## Target selection

Compile targets use opt-in semantics:

- If no target is enabled, build `neutral`.
- Enable a target with `true` or a non-empty options object.
- Omit a target or set it to `false` to disable it.
- Treat `{}` as disabled and deprecated.
- Once any target is enabled, every unlisted target is off.

Examples:

```ts
// neutral only (default)
const neutral: XyConfig = { compile: {} }

// node only
const node: XyConfig = { compile: { node: true } }

// node and neutral
const nodeAndNeutral: XyConfig = {
  compile: { node: true, neutral: true },
}
```

Expect platform output under `dist/neutral`, `dist/node`, or `dist/browser`. Do not describe the current compiler as a dual `dist/esm` and `dist/cjs` pipeline.

Use `entryMode` deliberately:

- `single` targets the normal package entry.
- `all` emits one entry for each source file, excluding specs and stories.
- `platform` uses platform entry files.
- `custom` accepts explicit `{ in, out }` entries.
- `auto` lets the compiler derive the applicable shape.

## Compile modes

| Mode | Use when |
|---|---|
| `library` | Publishing normal package entries while keeping npm dependencies external; this is the default |
| `bundle` | Intentionally inlining selected npm or workspace packages into the output |
| `transpile` | Emitting one output per source file without rolling up the import graph |
| `monolith` | Publishing many logical modules from one physical package with generated internal aliases and subpaths |
| `vendor` | Publishing one umbrella package that physically incorporates precompiled private workspace packages |

Configure bundle selection through `compile.bundlePackages`, including `all`, `workspace`, `scopes`, and `external` controls. Avoid bundling dependencies accidentally merely to silence resolution errors.

`mode: 'tsc'` is reserved in the public type but is not wired into `packageCompile`. Do not recommend it as an operational mode.

## Type validation

By default, `xy compile` performs a no-emit TypeScript validation pass over the full package, including specs, stories, configs, and Storybook files, then emits package output through the selected compiler mode. A successful raw `tsc` validation is therefore not proof that package emission or publish checks pass.

Use these controls narrowly:

- `compile.validate: false` skips full validation; treat it as a temporary migration escape hatch.
- `package-compile --validate-only` validates without emitting.
- `package-compile --emit-only` emits without the package validation pass.
- `compile.validator: 'per-package'` uses one TypeScript process per package and is the default.
- `compile.validator: 'shared'` uses the experimental shared-host validator for an all-workspace compile.
- `xy compile --validator shared` overrides the root setting for that run.

Single-package compilation always validates in the package rather than using the shared-host path.

## Monolith mode

Use monolith mode when one published package hosts logical modules under `src/modules/<name>` and must expose stable subpaths without maintaining many publishable packages.

Configure `compile.monolith.modules` and select `platforms`. Use `moduleLinkage: 'external'` when subpaths must preserve shared runtime identity across `instanceof`, contexts, registries, or singletons; the default bundled linkage duplicates shared code across entries.

Use module options such as `export`, `model`, `subpaths`, `internal`, or `reexport` to describe the layout. Use `copyEntries` for opaque, already-built runtime files that must land at exact public output paths.

Run:

```sh
package-sync-layout
package-sync-layout --check
```

Do not edit generated monolith barrels, aliases, or shims by hand unless the config marks the index as custom.

## Vendor mode

Use vendor mode when a public umbrella package should expose private workspace implementations without requiring consumers to install those private packages.

Configure:

```ts
const config: XyConfig = {
  compile: {
    mode: 'vendor',
    vendorPackages: {
      scopes: ['@internal'],
      selfScope: '@scope/public-sdk',
    },
  },
}
```

Vendor mode copies already-compiled package `dist` trees, rewrites internal imports, emits public subpath shims, and normally synchronizes the umbrella export map. It does not compile private source directly. Compile workspace dependencies first and inspect the packed consumer surface, not only the source barrels.

## Troubleshooting

When output is missing, inspect target opt-in semantics before changing entry paths. When declarations fail but JavaScript emits, remember that full validation and emit are separate phases. When a monolith or vendor package works inside the workspace but fails for consumers, inspect packed files, export maps, and remaining bare internal imports.
