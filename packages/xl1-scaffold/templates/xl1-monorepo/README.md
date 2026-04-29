# XL1 monorepo

A pnpm workspace for an XL1 dApp split into sub-packages under `packages/`. Common layout:

- `packages/app` — React + Vite frontend (scaffolded with `--template=react`)
- `packages/service` — Express HTTP backend (scaffolded with `--template=xl1-service`)
- `packages/shared` — TypeScript library for code shared between app and service (`--template=xl1-shared`)

## Workspace dependencies

To consume `shared` from `app` or `service`, add to that package's `package.json`:

```json
{
  "dependencies": {
    "@<your-scope>/shared": "workspace:*"
  }
}
```

Then `pnpm install` at the workspace root links it.

## Common commands (run from this root)

```shell
pnpm install                  # install + link all workspace packages
pnpm -r run typecheck         # tsc --noEmit across all packages
pnpm -r run lint              # eslint across all packages
pnpm -r run build             # build all packages
pnpm -r run test              # vitest across all packages
pnpm --filter app run dev     # run dev server for just one package
```
