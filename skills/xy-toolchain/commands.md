# Command and Policy Catalog

## Contents

- [Global behavior](#global-behavior)
- [Lifecycle gates](#lifecycle-gates)
- [Dependency and publish analysis](#dependency-and-publish-analysis)
- [Repository policy](#repository-policy)
- [Skills and work tracking](#skills-and-work-tracking)
- [Clean](#clean)
- [Configuration and automation](#configuration-and-automation)

## Global behavior

Use `pnpm xy --help` and `pnpm xy <command> --help` from the repository's installed toolchain. Commands evolve faster than copied command lists.

Common global controls include:

| Flag | Behavior |
|---|---|
| `--jobs <n>` | Limit parallel work; default is 16 |
| `--json` | Emit a machine-readable result envelope and suppress decorative output |
| `--rules` | List supported rules and effective levels for a rule-bearing command |
| `--strict` | Treat warnings as failures |
| `--profile` | Emit package/phase timing information where supported |
| `--no-defer` | Bypass a same-named local package script |
| `--no-incremental` | Force a full compile/build when the command normally uses incremental state |

Do not infer that a zero exit code means zero warnings unless `--strict` was active. For automation, prefer `--json` over parsing decorated terminal output.

## Lifecycle gates

| Command | Included work | Important exclusions |
|---|---|---|
| `xy compile` | Type validation and package emission | Lint, tests, publish checks |
| `xy build` | Compile, publint, deplint, ESLint | Tests, `xy check`, license, secure |
| `xy rebuild` | Clean plus a full non-incremental build | Tests, license, secure |
| `xy test [target]` | Vitest for a workspace or path | Compile and lint |
| `xy check` | Git, package-manager, publish, repo-layout, ESLint-config, and skill policy | Compile, source ESLint, deplint, tests |
| `xy fix [package]` | Git lint, deplint, repo lint, publint, and ESLint fixes | Non-fixable findings, tests, compile |

Run the gates required by the target repository or CI rather than treating one aggregate command as universal.

## Dependency and publish analysis

### `xy deplint [package]`

Analyze imports against `dependencies`, `devDependencies`, and `peerDependencies`. Detect unlisted, unused, misplaced, redundant, unsatisfied, range-style, and workspace-protocol problems. Use `--fix` for supported changes, then inspect `package.json` and rerun cleanly.

Choose the dependency/peer classifier deliberately:

- `legacy` promotes external runtime dependencies of libraries toward peers.
- `aei` uses API Exposure Index evidence and leaves borderline cases for review.
- `aei-next` also supports `peer-with-default` when the install-strategy heuristics match.

#### Package roles

Deplint auto-detects a package **role** (`library`, `library/cli`, `cli`, `service`, `app`, `workspace-root`, `tooling`) and applies policy facets. Agents must not treat every private package as free to demote runtime deps to `devDependencies`.

Critical cases:

- **`service` / `cli` with a trusted runtime graph:** keep real runtime deps in `dependencies`. Demoting them breaks `pnpm install --prod` and Docker slim images.
- **`private: true` is not a service signal.** A private package with a real `main` / `exports` surface remains a **library**.
- Progress labels use role ids (`service`, `cli`, …), not legacy `terminal[private]` / `terminal[cli]`.
- Prefer `commands.deplint.role` (and optional `runtimeRoots` / facets) over deprecated `terminal: true`.

Full role table, facets (`prodInstallMatters`, trusted graphs, `runtimeEntry`), and override examples: [project-profiles.md](project-profiles.md#package-roles-and-dependency-policy).

#### Package placement and presence

Configure exceptional packages through `commands.deplint.packages`. Separate where a package belongs from whether its declaration must exist:

```ts
import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: {
    deplint: {
      packages: {
        typescript: { placement: 'dev' },
        'eslint-plugin-example': {
          placement: 'dev',
          presence: 'allowed',
        },
        react: {
          placement: 'peer',
          presence: 'required',
        },
      },
    },
  },
}

export default config
```

Use `placement` to control the manifest section whenever a dependency is declared or discovered:

- `dep` selects `dependencies`.
- `dev` selects `devDependencies`.
- `peer` selects `peerDependencies`; when deplint adds a required or promoted peer, it also adds the development companion.
- `peer-with-default` intentionally selects both `dependencies` and `peerDependencies`.

Use `presence` independently:

- `inferred` is the default. Source and peer-chain evidence decide whether the declaration exists; `placement` alone does not retain an unused declaration.
- `allowed` retains a declaration that static analysis cannot justify but does not add it when absent. Use it for dynamically or convention-loaded plugins and similar dependencies invisible to source scanning.
- `required` adds and retains a missing declaration. Always pair it with `placement`; `dep.package.required` reports and can fix the missing manifest entry.

Treat `refType` as deprecated. Its historical behavior combines placement with allowed presence: `refType: 'dev'` is equivalent to `{ placement: 'dev', presence: 'allowed' }`. Do not migrate mechanically to `{ placement: 'dev' }` unless unused-removal behavior is intended.

Placement overrides also inform `xy api-exposure`. Root and package `commands.deplint.packages` entries deep-merge, so a root placement can combine with a package-level presence override. Keep package-role classification separate from these per-dependency policies, and do not distort source imports to satisfy an inappropriate classifier default.

#### Interactive pick

Use `xy deplint pick` for an interactive table of borderline AEI packages (`dep.dependencies.aei-review`) plus every package already listed under `commands.deplint.packages` in the monorepo's `xy.config` files:

```sh
pnpm xy deplint pick
pnpm xy deplint pick @scope/package
```

Space cycles each row through `none` / `dep` / `dev` / `peer`; Enter writes the chosen placements (or removes the entry for `none`) into the appropriate `xy.config`. After picking, run `xy deplint --fix` to apply placements to `package.json` manifests. Redundant placement overrides that match the active classifier can be cleaned with `--fix` via `dep.package.redundant-placement`.

### `xy api-exposure [package]`

Measure how a package's public runtime and type surface couples consumers to each dependency. Use `--dep` to narrow analysis, `--min-band` to filter output, and `--fail-on` for an explicit automation threshold. Treat results as dependency-placement evidence, not as a mechanical peer-dependency mandate.

### `xy publint [package]`

Validate the npm package surface, including upstream publint checks, compiled output/export-map parity, platform portability, export condition order, published files, source leakage, side effects, root legacy fields, and workspace peer ranges. Use `--fix` for XY-managed fixable rules; it cannot fix every upstream publint error.

### `xy dead [package]`

Analyze declaration liveness at package, repository, and active editor-workspace scope. Use `--deprecated` to report consumed deprecated exports. `--fix` adds deprecation markers by default; `--fix-remove` removes dead declarations and cascades supported cleanup. Review removals carefully and rerun compile and tests.

### `xy license` and `xy secure`

Use `xy license` to check production dependency licenses against the configured allowlist. Use `xy secure` to audit direct dependency age and download metadata. Do not describe `xy secure` as a full vulnerability scanner.

## Repository policy

Use the focused command when diagnosing one policy family:

| Command | Policy |
|---|---|
| `xy git lint` | Repository Git configuration such as LF settings and case sensitivity |
| `xy packman lint` | Package-manager safety configuration, including pnpm release-age policy |
| `xy repo lint` | Workspace structure, versions, engines, package-manager fields, and spec layout |
| `xy node lint` | Root Volta pin and package `engines.node` portability |
| `xy lint lint` | Local ESLint config package, `.gitignore` parity, redundant rules, and overrides |
| `xy skills lint` | Required project skills, versions, and duplicate/unnecessary installations |

`xy check --fix` runs the fixable forms of the policy families included by `xy check`. Rerun without `--fix`, and use `--strict` when warnings must block CI.

## Skills and work tracking

`xy skills` wraps the bundled Skills.sh CLI and adds XY-aware defaults, linting, and updates. Use `xy skills lint --fix` to install missing profile-required skills; use `--offline` when upstream version checks are intentionally unavailable.

### `xy work`

`xy work` stores AI-friendly work items under `.xy/work/` (canonical local storage: `.xy/work/items/*.json`). Prefer it over free-form TODO notes when the repository adopts work tracking.

```sh
pnpm xy work init
pnpm xy work add bug "Describe the problem"
pnpm xy work list
pnpm xy work list --all
pnpm xy work sync
pnpm xy work triage
pnpm xy work queue
pnpm xy work next --claim
pnpm xy work claim <id>
pnpm xy work done <id> --evidence "pnpm xy build passed"
pnpm xy work update <id> --status blocked --blocked-reason "…"
pnpm xy work lint
```

| Command | Purpose |
|---|---|
| `work init` | Create the repo-local work store and config |
| `work add <type> <title>` | Capture a bug, todo, feature, idea, debt, research, question, or risk |
| `work list` | List local items (table output) |
| `work list --all` | Also list open GitHub issues **not** created by `xy work`, normalized as `GH-<number>` |
| `work sync` | Bidirectional reconcile of local items and GitHub Issues when available |
| `work triage` / `update` / `queue` / `next` / `claim` / `done` / `show` | Lifecycle operations |
| `work move <id> --to <folder>` | Move an item between multi-root workspace folder repos |
| `work lint` | Store health (gitignore, GitHub availability, sync drift) |

Record verification evidence when completing an item. Do not initialize work tracking merely because the command exists; follow repository policy.

#### GitHub Issues integration

When `stores.github.enabled` is true (the default for new stores) and the GitHub CLI (`gh`) is installed, authenticated, and the repo has a GitHub remote:

- **`work add`** dual-writes a GitHub issue marked as created by `xy work`:
  - label: `xy-work`
  - body marker: `<!-- xy-work: <id> -->`
  - footer noting creation by the `xy work` tool
  - link stored on the local item under `stores.github` (`number`, `url`, `createdByXyWork: true`)
- If GitHub is unavailable or create fails, the local item is still written.
- **`work list --all`** includes open external GitHub issues (no `xy-work` label/marker, not already linked) as normalized `GH-<number>` rows for display; type is inferred from labels when possible.
- **`work sync`** reconciles when available:
  - Local active items without a GitHub link → create a marked issue
  - GitHub issues not present locally → import (`XYW-…` id when marked, else `GH-<number>`)
  - Linked pairs: newer title wins; local `done`/`wontfix` closes the issue; closed GitHub issues mark local done

Disable dual-write and sync in `.xy/work/config.json`:

```json
{
  "stores": {
    "github": { "enabled": false }
  }
}
```

Use inline source markers only as anchors (`// xy-work: <id>`); keep priority, acceptance, and verification on the work item.

#### Multi-folder editor workspaces

When several git repos are open together (for example `GitHub.code-workspace`), work subcommands accept scope flags:

| Flag | Behavior |
|---|---|
| `--workspace` | Operate across folders in the active/local `*.code-workspace` |
| `--workspace-file <path>` | Explicit workspace file (implies `--workspace`) |
| `--repo <name>` | Limit or target a single workspace folder by name |

```sh
pnpm xy work list --workspace
pnpm xy work list --workspace --repo toolchain
pnpm xy work move XYW-20260724-A145D1 --to sdk-js --from toolchain
```

`work move` relocates a work item between workspace folder repos. Use `--from` when the id is ambiguous across folders. Do not invent cross-repo moves without an actual multi-root workspace layout.

## Clean

### `xy clean [package]`

Remove build artifacts (`dist`, `build`, and configured patterns). Array fields in config cascade (union) from root to package.

| Flag | Behavior |
|---|---|
| *(default)* | Clean built-in and configured patterns, subject to safety rules and excludes |
| `--full` | Also remove all gitignored files under each package (fresh-clone hygiene); still honors `commands.clean.exclude` and default excludes such as `node_modules` |
| `--full-all` | Like `--full`, but also ignores `exclude` / default excludes; only `.git` remains protected |

Configure under `commands.clean` in `xy.config.ts`:

```ts
import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: {
    clean: {
      patterns: ['coverage', '.turbo'],
      include: ['tmp/**'],
      exclude: ['.cache'],
      rules: {
        'clean.gitignored-only': 'error', // default: only delete gitignored matches for configured patterns
        'clean.gitignored-all': 'off', // default: off; enable to wipe every gitignored path under the package
      },
    },
  },
}

export default config
```

- `patterns` — extra package-relative globs beyond builtins.
- `include` — always cleaned; bypasses `clean.gitignored-only`, still subject to hard safety and `exclude`.
- `exclude` — never cleaned (plus immutable `.git` and default `node_modules` excludes).
- Hard rules `clean.inside-root` and `clean.relative-pattern` always apply and cannot be turned off.

Prefer `xy clean` over ad-hoc `rm -rf dist`. Use `--full` only when you intend fresh-clone hygiene; use `--full-all` only when you intentionally want to delete excluded trees such as `node_modules` under packages.

## Configuration and automation

Put rule levels and command settings under `commands` in `xy.config.ts`:

```ts
import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: {
    dead: {
      rules: {
        'dead.workspace.export-published': 'warn',
      },
    },
    deplint: {
      classifier: 'aei',
      rules: {
        'dep.workspace.protocol': ['error', { protocol: 'workspace:~' }],
      },
    },
  },
}

export default config
```

Inspect the installed catalog before inventing rule IDs:

```sh
pnpm xy --rules
pnpm xy deplint --rules --json
pnpm xy check --rules
```

Validate every fixer with three checks: the finding appears before the fix, `--fix` makes the intended scoped edit, and a second non-fix run is clean.
