# TypeScript Configuration

## @xylabs/tsconfig Variants

XYO Foundation publishes three TypeScript config packages. Choose the right one based on your project's target environment:

| Package | Extends | Use When |
|---------|---------|----------|
| `@xylabs/tsconfig` | — (base) | Node.js libraries, backend services, CLI tools |
| `@xylabs/tsconfig-dom` | `@xylabs/tsconfig` | Browser-targeting code that uses DOM APIs |
| `@xylabs/tsconfig-react` | `@xylabs/tsconfig-dom` | React applications and component libraries |

Each config extends the one above it via `"extends"` in its `tsconfig.json`, but **does not declare the parent as a package dependency**. TypeScript resolves the `"extends"` target from `node_modules` at compile time, so all configs in the chain must be explicitly installed. Install the full inheritance chain for your target:

```bash
# Node.js / backend
pnpm add -D @xylabs/tsconfig

# Browser / DOM
pnpm add -D @xylabs/tsconfig @xylabs/tsconfig-dom

# React
pnpm add -D @xylabs/tsconfig @xylabs/tsconfig-dom @xylabs/tsconfig-react
```

All require TypeScript ~5.x as a peer dependency.

## Usage

### Basic Setup

Create `tsconfig.json` in your project root:

```json
{
  "extends": "@xylabs/tsconfig",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

For React projects:

```json
{
  "extends": "@xylabs/tsconfig-react",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### Overriding Compiler Options

The base configs set opinionated defaults. Override specific options when your project needs it:

```json
{
  "extends": "@xylabs/tsconfig",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "target": "ES2022"
  }
}
```

Only override what you need. The base config is designed to be correct for most XY projects.

### Multiple tsconfig Files

Some projects need different configs for different concerns:

- `tsconfig.json` — main config for IDE and compilation
- `tsconfig.build.json` — stricter config for production builds (excludes test files)

```json
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"]
}
```

## Relationship to Layer 1

- **Layer 1** (Development Skill) covers TypeScript *coding conventions*: the `any` policy, return type inference, interfaces vs types, readonly usage
- **This file** covers TypeScript *compiler configuration*: which base config to extend, build targets, project structure

These are complementary — Layer 1 tells you how to write the code, this tells you how to compile it.

## Troubleshooting

### "Cannot find module" errors
- Check that `paths` or `baseUrl` in tsconfig aren't conflicting with the base config
- In monorepos, ensure each package has its own tsconfig with correct `references`
- Run `package-clean` to clear stale declaration files

### Type errors from dependencies
- Make sure `@types/*` packages match the version of the library you're using
- Check that `skipLibCheck` isn't masking real issues (the base config sets this intentionally)

### Build output in wrong location
- Verify `outDir` and `rootDir` are set correctly in your tsconfig
- The base config doesn't set these — you must set them per project
