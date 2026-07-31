# Project Profiles

## Contents

- [Classify independent axes](#classify-independent-axes)
- [Select the profile](#select-the-profile)
- [Apply common profiles](#apply-common-profiles)
- [Package roles and dependency policy](#package-roles-and-dependency-policy)
- [Handle repository topology](#handle-repository-topology)
- [Choose the production build owner](#choose-the-production-build-owner)
- [Verify the selected profile](#verify-the-selected-profile)

## Classify independent axes

Classify each package before choosing configs or commands. Do not infer one axis from another:

| Axis | Choices | Governs |
|---|---|---|
| Consumption / role | Library, library/CLI, CLI, service, app, workspace-root, tooling | Dependency placement, peer promotion, and prod-install expectations |
| Runtime | Neutral, Node, or browser | TypeScript libraries, compile target, and platform checks |
| Framework | React or non-React | React TypeScript, ESLint, and test support |
| Topology | Single-package or monorepo | Configuration placement and command orchestration |
| Output owner | `xy compile` or framework build | Which command produces deployable or publishable output |

Use **library** when another package imports the package's public API. Use a **terminal product role** (`cli`, `service`, `app`, `tooling`) for a final application, service, website, worker, or self-contained CLI that no consumer imports. A package with both `bin` and an importable public API is **library/CLI**, so apply library dependency rules to its public surface.

Treat **React as a browser framework**, not as a fourth compile platform. A React package still chooses browser or, less commonly, neutral/Node runtime behavior based on the code it ships.

## Select the profile

Use this order:

1. Ask whether a consumer imports the package. Classify it as library, library/CLI, or a terminal product role.
2. Identify the runtime APIs used by shipped code: environment-neutral, Node, or browser/DOM.
3. Add the React layer only when the package contains React components or an application rendered with React.
4. Identify whether the package is independently publishable, deployable, or only a private workspace orchestrator.
5. Decide whether the toolchain emits the production package or a framework such as Vite or Next.js owns the build.
6. In a monorepo, repeat this classification for every workspace package. Do not assign one profile to the entire repository merely because the root has one runtime.

## Apply common profiles

| Profile | TypeScript | ESLint | Output | Dependency and policy emphasis |
|---|---|---|---|---|
| Neutral library | `@ariestools/tsconfig` + optional `@ariestools/lib-neutral` types | Non-React flat config | Default neutral target | Run `publint`, `deplint`, and API-exposure analysis; keep Node and DOM globals out |
| Node library | Base config plus explicit Node types | Non-React flat config | `compile.node: true` | Validate Node exports and consumer dependency/peer contracts |
| Browser library | `@ariestools/tsconfig-dom` | Non-React flat config | `compile.browser: true` | Validate browser portability and publish surface |
| React component library | `@ariestools/tsconfig-react` | React flat config | Usually `compile.browser: true` | Treat React/runtime contracts as library dependency decisions; validate packed exports |
| Node server or worker | Base config plus explicit Node types | Non-React flat config | Node output or deployment framework | Role `service`; keep runtime requirements in `dependencies` (prod install matters) |
| CLI-only package | Base config plus explicit Node types | Non-React flat config | Node output; bundle only when intentional | Declare `bin`; role `cli` unless it also exposes an importable API (`library/cli`) |
| Browser website | `@ariestools/tsconfig-dom` | Non-React flat config | Browser framework/bundler | Usually private role `app`; do not require a library export map |
| React website | `@ariestools/tsconfig-react` | React flat config | React framework/bundler | Usually private role `app`; run DOM/browser tests only where browser APIs are required |

Follow [typescript.md](typescript.md) for the exact config packages, explicit Node types, and `@ariestools/lib-neutral`. Follow [eslint.md](eslint.md) for the active flat-config packages and tiers. Follow [compilation.md](compilation.md) for target opt-in semantics and output modes.

Do not add Node types to neutral or browser packages to silence errors from a misplaced config or test. Do not add DOM types to neutral or Node libraries merely because another workspace contains a website. For neutral packages that need timers or `AbortController`, use `@ariestools/lib-neutral` rather than `@types/node`.

Choose the Vitest environment per test suite, not from the package label alone. Prefer `@ariestools/vitest-config` in monorepos (`spec/`, `spec/node/`, `spec/browser/` routing). Use Node for logic tests and a DOM or browser environment only for tests that render or access browser APIs. Place every `.spec.ts` under any `spec/` directory at any depth as described in [testing.md](testing.md).

## Package roles and dependency policy

Use package roles only for dependency-policy behavior. They do not select a compile target or open an interactive shell.

Deplint auto-detects a **role** and derives policy **facets**. Progress output labels the effective role (`library`, `library/cli`, `cli`, `service`, `app`, `workspace-root`, `tooling`). Legacy labels `terminal[cli]` / `terminal[private]` are no longer used; they map to `cli` and to `service` / `app` / `workspace-root` / `tooling` respectively.

| Role | Typical meaning | Key policy |
|---|---|---|
| `library` | Importable package | Peer promotion / AEI may apply to external runtime deps |
| `library/cli` | `bin` plus importable library | Library peer rules + CLI prod install for the bin surface |
| `cli` | Terminal CLI product | Runtime deps stay in `dependencies` when the graph is trusted |
| `service` | Long-running Node process (`scripts.start` → JS entry) | **Prod install matters** — do not demote real runtime deps to `devDependencies` |
| `app` | Frontend or full-stack app (Vite/Next/etc.) | Framework runtime in `dependencies`; test-only tooling may move to dev |
| `workspace-root` | Monorepo root / meta package | Aggressive demotion; almost nothing belongs in `dependencies` |
| `tooling` | Generators, codemods, internal bins | Demote product-looking deps unless the tool ships its own prod install |

**Trusted runtime graph:** for roles where `prodInstallMatters` is true (`service`, many CLIs), demotion (`move-to-dev`) is allowed only when the analyzer has real entry roots (manifest, `bin`, start scripts, or framework entries → reachable files). When the graph is untrusted, prefer keeping ambiguous deps in `dependencies` rather than breaking `pnpm install --prod` or Docker slim images.

**Private is not terminal:** `private: true` alone does not make a package a service. A private workspace package with a real `main` / `exports` surface is still a **library**.

Set an explicit role when metadata cannot express the product shape:

```ts
import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: {
    deplint: {
      role: 'service',
      // Optional facet overrides and roots when heuristics are weak:
      // prodInstallMatters: true,
      // runtimeEntry: 'scripts',
      // runtimeRoots: ['dist/neutral/index.mjs'],
    },
  },
  compile: {
    node: true,
  },
}

export default config
```

`commands.deplint.terminal: true` remains as a deprecated convenience that forces non-library (terminal-equivalent) facets. Prefer `role`. Put role overrides in the **package's** `xy.config.ts`, not at a mixed-monorepo root, because root command configuration cascades.

Services, CLIs, and apps keep runtime requirements in `dependencies`; consumers cannot satisfy a peer contract for an application they never import. Libraries require a deliberate dependency-versus-peer decision. Use `xy api-exposure` as evidence, then configure exceptional dependencies with `commands.deplint.packages` placement and presence (or `xy deplint pick`) as described in [commands.md](commands.md) rather than forcing the whole package into the wrong role.

## Handle repository topology

### Single-package repository

Treat the repository root as the package:

1. Keep `package.json`, `xy.config.ts`, TypeScript, ESLint, and Vitest configuration at the root unless the framework requires a narrower location.
2. Run the repository's root scripts for normal validation.
3. Use `xy` package arguments only when they provide a useful targeted diagnostic; do not assume workspace filtering is required.
4. Apply publish gates only when the root package is actually published.

### Monorepo

Treat the root as orchestration and each workspace as an independently classified package:

1. Keep shared defaults at the root and package-specific exceptions beside the affected package.
2. Run root `xy` commands to discover workspaces, order dependent compilation, apply concurrency, and aggregate diagnostics.
3. Use a package name or path for targeted work, then rerun the required root gate when changes can affect dependents.
4. Let neutral libraries, Node services, CLIs, browser libraries, and React applications coexist; give each its own TypeScript and compile settings.
5. Keep workspace-internal runtime packages in `dependencies`; do not convert them mechanically to peers.
6. Avoid applying role, Node, DOM, or React settings at the root when only some workspaces need them.
7. Prefer root `@ariestools/vitest-config` for monorepo test layout; package-level Vitest config only when a workspace deliberately diverges.

A private monorepo root is commonly `workspace-root`, but `private: true` on the root does not make every child workspace a service or app. Classification and package-level configuration still apply per workspace.

## Choose the production build owner

Use `xy compile` to emit publishable library output and packages whose supported toolchain compile mode owns the artifact. Select neutral, Node, or browser targets explicitly as described in [compilation.md](compilation.md).

Keep a framework's production build when the framework owns application bundling, routing, assets, server rendering, or deployment metadata. For example, retain `vite build` or `next build` for a website instead of replacing it mechanically with `xy compile`. Continue using applicable `xy` commands for linting, dependency policy, repository policy, tests, and any workspace libraries built by the toolchain.

Do not assume the script named `build` must invoke `xy build`. Inspect the existing script and distinguish:

- Toolchain package build: compile plus package policy checks.
- Framework application build: application type-check/bundle/deployment output.
- Repository aggregate build: orchestration across both kinds of workspaces.

## Verify the selected profile

After configuration changes:

1. Run the repository's normal build or compile command.
2. Run `xy lint` and `xy deplint`; use `--strict` when warnings must fail.
3. Run `xy publint` for every published library or CLI surface.
4. Run the repository test script; remember that `xy build` does not include tests.
5. Run `xy check` for repository and configuration policy.
6. For published packages, inspect the packed artifact and test it from a clean consumer when export or dependency behavior changed.

Interpret failures through the selected profile. A peer-placement warning may mean a service or app was misclassified as a library; demoting runtime deps on a service may mean the role or runtime graph is wrong; a Node-global error may mean a browser or neutral package inherited Node types; missing website output may mean the framework build was replaced by a library compiler.
