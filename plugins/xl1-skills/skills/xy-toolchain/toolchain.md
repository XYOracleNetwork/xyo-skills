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
3. Create a `src/` directory for all application source code
4. Set up tsconfig with `rootDir: "./src"` (see [typescript.md](typescript.md))
5. Set up ESLint (see [eslint.md](eslint.md))
6. Wire up package.json scripts as shown above
7. Set `"type": "module"` in package.json for ESM

**All application source code goes in `src/`.** Config files (`tsconfig.json`, `eslint.config.ts`, `vite.config.ts`, `vitest.config.ts`) and the Vite entry point (`index.html`) stay at the project root. The `src/` directory is the `rootDir` for TypeScript and the source root for Vite.

## Monorepo Considerations

Many XY projects are monorepos using workspaces.

- Check for `pnpm-workspace.yaml` or `workspaces` in package.json
- Run commands at the correct scope using workspace-aware commands
- pnpm: `pnpm --filter <package> build`
- Each workspace package should have its own tsconfig, ESLint config, and package.json scripts

## Vite Setup for XYO/XL1 dApps

When building a browser dApp with Vite that uses XYO or XL1 packages, use these two plugins:

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), topLevelAwait(), tsconfigPaths()],
})
```

Install them:
```sh
pnpm add -D vite-plugin-top-level-await vite-tsconfig-paths
```

**Why these plugins:**
- `vite-plugin-top-level-await` — XYO SDK dependencies (e.g., `@bitauth/libauth`) use top-level `await`. This plugin handles it for the dev server without requiring build target changes.
- `vite-tsconfig-paths` — ensures Vite resolves paths consistently with the TypeScript config, which matters for the SDK's multi-target builds.

**Browser compatibility:** XYO/XL1 SDK packages ship browser-specific builds via the `"browser"` condition in their `package.json` exports field. Vite automatically resolves these, so the consuming app typically does not need Node.js polyfills (`buffer`, `events`, `stream`, etc.). The `@xylabs/*` toolchain packages provide browser-safe alternatives internally (e.g., `@xylabs/buffer`).

If you see errors about missing Node.js built-ins, strongly prefer fixing the root cause (check Vite version, plugin setup, and that the browser export condition is being resolved) before adding polyfill aliases as a last resort.

## Troubleshooting

### Build fails with compilation errors
- Run `package-clean` first to clear stale artifacts, then `package-compile`
- Check that `@xylabs/tsconfig` (or variant) is properly extended in tsconfig.json
- Verify TypeScript version matches the toolchain's peer dependency (~5.x)

### Lint command finds no files
- Ensure ESLint config exists (see [eslint.md](eslint.md))
- Check that source files match the glob patterns in the ESLint config
- Run `package-lint-verbose` for detailed output

### npm install fails with 404 or 403 for `@xyo-network/*` or `@xylabs/*` packages
- Some XYO/XY packages require npm authentication to install. If `pnpm install` fails with `ERR_PNPM_FETCH_404` or `ERR_PNPM_FETCH_403` for `@xyo-network/*` or `@xylabs/*` packages, the user likely needs to log in to npm.
- Ask the user to run `npm login` (or `npm login --scope=@xyo-network` for scoped access).
- After login, retry `pnpm install`.
- **Never** commit the resulting `.npmrc` file — it contains auth tokens. Ensure `.npmrc` is in `.gitignore` (see [Development Workflow](../development/workflow.md) credential safety section).
- If the error persists after login, the package may genuinely not exist or the user may lack access to the organization. Confirm the exact package name and version before escalating.

### Package manager conflicts
- If you see dependency resolution errors, make sure you're using the correct package manager for the project
- Delete `node_modules` and the lock file only as a last resort — try `pnpm install` first
