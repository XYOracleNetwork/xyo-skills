# Toolchain and Project Setup

## Contents

- [Start from repository truth](#start-from-repository-truth)
- [Package manager](#package-manager)
- [Installation](#installation)
- [Root CLI versus package hooks](#root-cli-versus-package-hooks)
- [Root scripts](#root-scripts)
- [New project baseline](#new-project-baseline)
- [Migration and troubleshooting](#migration-and-troubleshooting)

## Start from repository truth

Before running or adding commands:

1. Read the root and target-package `package.json` scripts.
2. Read the root `packageManager` field and lockfile.
3. Read root and package `xy.config.ts` files.
4. Use the repository script when it already represents the requested gate.
5. Use `pnpm xy <command> --help` from the installed version when command behavior is uncertain.

Do not substitute a raw `tsc`, ESLint, esbuild, or Vitest invocation for a repository wrapper unless a targeted diagnostic requires functionality the wrapper does not expose.

## Package manager

Use pnpm for new repositories. It is the fully supported and recommended package manager; Bun, npm, and Yarn support is experimental.

The CLI detects the package manager in this order:

1. The root `packageManager` field.
2. pnpm workspace or lock files.
3. Bun lock files.
4. Yarn lock/config files.
5. npm lock files.

The implementation falls back to Yarn when no signal exists. Do not rely on that fallback: set `packageManager`, commit exactly one lockfile, and use that manager exclusively. For pnpm workspaces, keep `pnpm-workspace.yaml` at the repository root.

## Installation

The published toolchain requires Node.js 22 or newer and TypeScript 5.9 or 6:

```sh
pnpm add -D @ariestools/toolchain @ariestools/tsconfig typescript
```

Add the appropriate ESLint and TypeScript variants from [eslint.md](eslint.md) and [typescript.md](typescript.md). Pin versions according to the repository's dependency policy; do not copy the toolchain repository's current patch versions blindly.

## Root CLI versus package hooks

Use `xy` at repository/workspace scope. The CLI discovers workspaces, orders compilation, applies concurrency, supports incremental execution, and aggregates diagnostics.

| Command | Actual purpose |
|---|---|
| `xy compile [package]` | Validate TypeScript and emit package output |
| `xy recompile [package]` | Clean, then compile |
| `xy build [package]` | Compile, then run publint, deplint, and ESLint |
| `xy rebuild [package]` | Clean, then run a non-incremental build |
| `xy clean [package]` | Remove build artifacts |
| `xy test [target]` | Run Vitest for a workspace or path |
| `xy check` | Run repository/configuration policy checks; see [commands.md](commands.md) |
| `xy fix [package]` | Run the standard fixable policy and source checks |

`xy build` does not run tests, license checks, security metadata checks, or every check in `xy check`. Run the required gates explicitly.

Use `package-*` binaries as per-package hooks invoked by root orchestration or package scripts:

| Hook | Purpose |
|---|---|
| `package-compile` | Validate and emit one package |
| `package-recompile` | Clean and compile one package |
| `package-build` | Compile and publint one package |
| `package-lint` / `package-fix` | Lint or fix one package |
| `package-publint` | Validate one package's publish surface |
| `package-clean` | Clean one package |
| `package-sync-layout` | Generate or check a monolith layout |

The `-only` binaries are not reduced pipelines. `package-compile-only`, `package-build-only`, and `package-recompile-only` invoke the toolchain implementation while bypassing a same-named package script override. Use them when extending a package hook without recursion:

```json
{
  "scripts": {
    "package-compile": "package-compile-only && tsx scripts/generate-types.ts"
  }
}
```

Never call `pnpm run package-compile` from inside the `package-compile` script; that re-enters itself.

## Root scripts

Preserve existing repository script names. When adding a minimal wrapper, point it at `xy`:

```json
{
  "scripts": {
    "build": "xy build",
    "compile": "xy compile",
    "lint": "xy lint",
    "lint:fix": "xy lint --fix",
    "test": "vitest run"
  }
}
```

Compile and build are incremental by default for all-workspace runs. Use `--no-incremental` when validating a clean full run. Use `xy rebuild` when artifacts must be removed first.

## New project baseline

For a new TypeScript package:

1. Pin pnpm in `packageManager` and create the correct workspace file when needed.
2. Require Node.js 22 or newer unless the consuming product imposes a newer version.
3. Install `@ariestools/toolchain`, the correct config packages, ESLint, and TypeScript.
4. Set `"type": "module"`.
5. Put application or library source under `src/`.
6. Create `xy.config.ts`, `tsconfig.json`, and `eslint.config.ts` at the appropriate root.
7. Run `xy lint init` rather than copying an old ESLint configuration.
8. Run the actual compile, lint, test, and publish-policy gates before handing off.

Use `xy repo init cli` only after inspecting its generated output and passing an explicit scope. Do not assume generator defaults match the target organization.

## Migration and troubleshooting

Replace retired `@xylabs/toolchain`, ESLint-config, and tsconfig package names with their `@ariestools/*` equivalents. The compatibility stubs are no longer built in the active monorepo.

If installation returns 404 or 403, first verify the exact package name and version, registry configuration, and lockfile. The `@ariestools` toolchain/config packages are public; request authentication only when the repository is intentionally configured for a private registry or private package.

If a package command unexpectedly recurses, inspect same-named package scripts and use the matching `-only` binary. If a workspace is skipped, verify workspace discovery, the package name, and the root package-manager configuration before changing filters.
