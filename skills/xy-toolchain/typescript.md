# TypeScript Configuration

## Select the environment config

| Package | Extends | Use when |
|---|---|---|
| `@ariestools/tsconfig` | Base | Environment-neutral code, Node code with explicit Node types, libraries, services, and CLIs |
| `@ariestools/tsconfig-dom` | Base | Browser-targeted code that uses DOM APIs |
| `@ariestools/tsconfig-react` | DOM | React applications and component libraries |

The DOM and React packages declare their parent configs as peers. Install the complete chain explicitly:

```sh
# Base / environment-neutral
pnpm add -D @ariestools/tsconfig typescript

# Browser / DOM
pnpm add -D @ariestools/tsconfig @ariestools/tsconfig-dom typescript

# React
pnpm add -D @ariestools/tsconfig @ariestools/tsconfig-dom @ariestools/tsconfig-react typescript
```

Use TypeScript 5.9 or 6 with the current toolchain. Follow the consuming repository's exact range policy.

## Understand the base config

The base currently supplies strict, ESM-oriented settings including:

- `target`, `lib`: ESNext
- `module`, `moduleResolution`: NodeNext
- `strict`, `noImplicitAny`, `noImplicitOverride`
- `allowImportingTsExtensions`, `allowJs`, `resolveJsonModule`
- `isolatedModules`, `erasableSyntaxOnly`
- declarations, declaration maps, and source maps
- `outDir: "dist"`
- `noEmit: true`

`noEmit: true` is intentional: TypeScript validates the full package while the toolchain's selected compile mode emits publishable JavaScript and declarations. Do not remove it merely because raw `tsc` produces no files.

## Basic configuration

Use the smallest applicable config:

```json
{
  "extends": "@ariestools/tsconfig",
  "include": ["src"]
}
```

For React:

```json
{
  "extends": "@ariestools/tsconfig-react",
  "include": ["src"]
}
```

The React config adds `jsx: "react-jsx"`; the DOM config adds DOM and DOM iterable libraries.

## Node types

The base is not a license to expose Node globals everywhere. For a Node package, install Node types and declare them explicitly:

```sh
pnpm add -D @types/node
```

```json
{
  "extends": "@ariestools/tsconfig",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src"]
}
```

Keep browser and neutral packages free of Node types unless the source genuinely requires them. The compiler resolves platform-specific types when producing browser, neutral, and node targets.

## Overrides and multiple configs

Override only the option the package needs. Do not reset strictness, module resolution, or emit behavior by copying a large standalone compiler-options block from an older repository.

Use separate configs when tooling and production emission need different file sets. For example, a package may keep `tsconfig.json` broad for validation and let the toolchain derive its emission inputs rather than excluding specs from validation.

Configure output platforms and compiler modes in `xy.config.ts`, not by creating ad hoc CommonJS and ESM tsconfigs. See [compilation.md](compilation.md).

## Troubleshooting

For module-resolution errors, inspect the complete `extends` chain, installed peer configs, package export maps, path aliases, and source import extensions. For missing Node globals, add explicit Node types only to the Node package. For errors in specs or configs during `xy compile`, remember that full-package validation includes non-emitted TypeScript files by design.

Use `xy clean` or `xy recompile` when stale declarations are the credible cause. Do not delete lockfiles or reinstall dependencies as the first response to a TypeScript diagnostic.
