# Toolchain & Project Setup

## Package Manager

**pnpm is preferred** for new projects. Yarn and npm are also supported.

- Detect the package manager from the lock file and use it exclusively
- `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `package-lock.json` → npm
- Never mix package managers in a project
- When initializing a new project with no lock file, default to pnpm

## @xylabs/toolchain

The `@xylabs/toolchain` package provides a unified CLI for building, linting, compiling, and managing TypeScript projects. It is the standard build tool for XY Labs projects.

- **Repository:** https://github.com/xylabs/config
- **Install:** `pnpm add -D @xylabs/toolchain`

### CLI Commands

| Command | Purpose |
|---------|---------|
| `package-build` | Full build pipeline (clean → compile → lint) |
| `package-build-only` | Build without lint |
| `package-compile` | TypeScript compilation |
| `package-compile-only` | Compile without pre/post steps |
| `package-recompile` | Clean then compile |
| `package-lint` | Run ESLint via the toolchain |
| `package-lint-verbose` | Lint with detailed output |
| `package-relint` | Clean lint cache then lint |
| `package-fix` | Auto-fix lint issues |
| `package-clean` | Remove build artifacts |
| `package-publint` | Validate package for npm publishing |
| `package-gen-docs` | Generate TypeDoc documentation |
| `package-copy-assets-esm` | Copy non-TS assets to ESM output |
| `package-copy-assets-cjs` | Copy non-TS assets to CJS output |

### Wiring Up package.json Scripts

Map your package.json scripts to toolchain commands:

```json
{
  "scripts": {
    "build": "package-build",
    "compile": "package-compile",
    "lint": "package-lint",
    "lint:fix": "package-fix",
    "clean": "package-clean",
    "test": "vitest run"
  }
}
```

The toolchain commands handle configuration resolution, flag passing, and pipeline orchestration. Always use these instead of raw `tsc`, `eslint`, or `esbuild` invocations.

### Dual ESM/CJS Output

The toolchain supports building for both ESM and CommonJS targets. When a project needs dual output:
- ESM output goes to `dist/esm/`
- CJS output goes to `dist/cjs/`
- Use `package-copy-assets-esm` and `package-copy-assets-cjs` for non-TypeScript assets

## Project Setup for New Projects

When creating a new XY project:

1. Initialize with pnpm: `pnpm init`
2. Install the toolchain: `pnpm add -D @xylabs/toolchain typescript`
3. Set up tsconfig (see [typescript.md](typescript.md))
4. Set up ESLint (see [eslint.md](eslint.md))
5. Wire up package.json scripts as shown above
6. Set `"type": "module"` in package.json for ESM

## Monorepo Considerations

Many XY projects are monorepos using workspaces.

- Check for `pnpm-workspace.yaml` or `workspaces` in package.json
- Run commands at the correct scope using workspace-aware commands
- pnpm: `pnpm --filter <package> build`
- Each workspace package should have its own tsconfig, ESLint config, and package.json scripts

## Troubleshooting

### Build fails with compilation errors
- Run `package-clean` first to clear stale artifacts, then `package-compile`
- Check that `@xylabs/tsconfig` (or variant) is properly extended in tsconfig.json
- Verify TypeScript version matches the toolchain's peer dependency (~5.x)

### Lint command finds no files
- Ensure ESLint config exists (see [eslint.md](eslint.md))
- Check that source files match the glob patterns in the ESLint config
- Run `package-lint-verbose` for detailed output

### Package manager conflicts
- If you see dependency resolution errors, make sure you're using the correct package manager for the project
- Delete `node_modules` and the lock file only as a last resort — try `pnpm install` first
