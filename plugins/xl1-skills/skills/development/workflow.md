# Development Workflow

## Use the Repo's Native Toolchain

Before running any build, lint, test, or dev command, **discover what the repo already provides** and use that. Never run ad-hoc one-off commands when the repo has a defined way to do things.

### Discovery Checklist

Before executing commands in a repo, check these in order:

1. **Package manager** — detect from the lock file and use that exclusively:
   - `pnpm-lock.yaml` → use `pnpm`
   - `yarn.lock` → use `yarn`
   - `package-lock.json` → use `npm`
   - Never mix package managers. Never run `npm install` in a pnpm repo.

2. **package.json scripts** — read `scripts` in `package.json` before running anything:
   - If `"build"` exists, use `pnpm build` — not raw `tsc` or `esbuild`
   - If `"lint"` exists, use `pnpm lint` — not raw `eslint .`
   - If `"test"` exists, use `pnpm test` — not raw `jest` or `vitest`
   - If `"dev"` exists, use `pnpm dev` — not raw `ts-node` or `tsx`
   - The scripts may include flags, configs, or pipelines that raw commands miss.

3. **Monorepo awareness** — check if the repo uses workspaces:
   - Look for `workspaces` in `package.json`, `pnpm-workspace.yaml`, `nx.json`, or `lerna.json`
   - Run commands at the correct scope (root vs. package)
   - Use workspace-aware commands: `pnpm --filter <package> build`, not `cd packages/foo && pnpm build`

4. **Config files** — check for existing configuration before assuming defaults:
   - `tsconfig.json` / `tsconfig.*.json` — don't assume compiler options
   - `.eslintrc.*` / `eslint.config.*` — don't assume lint rules
   - `vitest.config.*` / `jest.config.*` — don't assume test setup
   - These files are authoritative. Don't override them with CLI flags unless intentionally fixing something.

5. **Dependency versions** — when adding new dependencies, always use `pnpm add <package>` (or the repo's package manager equivalent) to resolve the latest published version. Do not manually write version numbers in package.json from memory — they may be significantly outdated. If a specific version is required for peer dependency compatibility, pin to that version explicitly (e.g., `pnpm add @mui/material@~7.3.9`).

### Repo Conventions

Beyond scripts and config files, observe how the existing codebase does things:
- How are modules structured? Follow the same patterns for new code.
- How are exports organized? Match the style.
- How are dependencies declared? If the repo uses `dependencies` vs `devDependencies` with intent, respect that.
- If there are existing examples of what you're building (a similar component, endpoint, or utility), use them as a template rather than inventing a new pattern.

When in doubt, read existing code first and follow its lead.

### Credential Safety

Never commit secrets or authentication tokens to the repository:
- `.npmrc` — may contain npm auth tokens after `npm login`. Always add it to `.gitignore`.
- `.env`, `.env.*` — may contain API keys and secrets. Always gitignored.
- Never log, echo, or display auth tokens in command output.
- When setting up a new project, verify `.gitignore` includes `.npmrc` and `.env` before the first commit.

### The Rule

If the repo has a way to do it, use the repo's way. Ad-hoc commands are for exploration only — never for producing a deliverable.

**This applies even when you just created the scripts yourself.** After scaffolding a new project, use the scripts you defined — don't bypass them with raw commands like `npx tsc -b` or `npx eslint .` for "quick checks". The scripts exist to run the correct pipeline; partial raw invocations can miss flags, configs, or pipeline steps and give misleading results.

## Definition of Done

A feature is not complete until **all of the following are true**:

### 1. Builds Cleanly
- The repo's build command (`pnpm build` or equivalent) succeeds with zero errors
- No new TypeScript compiler errors introduced
- If the project has multiple build targets, all of them pass

### 2. Linter Passes
- The repo's lint command (`pnpm lint` or equivalent) passes with zero errors and zero warnings
- Don't suppress lint rules to make it pass — fix the underlying issue
- If a lint rule must be disabled, use an inline comment with a justification

### 3. Tests Pass
- All existing tests pass — no regressions
- New behavior has corresponding tests
- Tests follow the principles in [testing.md](testing.md)
- Run the repo's test command (`pnpm test` or equivalent), not a subset

### 4. Dependencies Are Correct
- New packages are added to the right place: `dependencies` for runtime, `devDependencies` for build/test-only
- Dependencies are installed via the repo's package manager — don't forget to actually run `pnpm install` (or equivalent)
- No phantom dependencies — if your code imports it, it must be in `package.json` (don't rely on transitive installs)
- Version ranges follow the repo's existing conventions (pinned, caret, tilde)
- All peer dependency warnings are resolved — install the required peers at the versions the package expects, not just the latest. Note: `pnpm install` suppresses warnings when the lockfile is already up to date. After adding or changing dependencies, run `pnpm install --resolution-only` to force a fresh resolution check that surfaces all peer dependency warnings.
- **Transitive peer dependencies can cause runtime failures that the compiler and linter miss.** pnpm's strict isolation means peer deps of your dependencies are not automatically available to Vite's bundler. If a dependency uses MUI, emotion, or another framework internally, your app must install those peer deps explicitly. When adding a new dependency, check its `peerDependencies` (and those of its direct dependencies) for packages your app doesn't already provide. A clean `pnpm compile` does not guarantee the app will run — missing peer deps surface as `Could not resolve "..."` errors at runtime.

### 5. Dev Server Starts (apps only)
- If the project is an application with a dev server (`pnpm dev` or equivalent), start it and confirm it launches without errors
- The production build and dev server often use different tools (e.g., Vite uses Rollup for `build` but esbuild for `dev`) — passing one does not guarantee the other
- **Open the app in the browser and check the console for errors.** Missing transitive peer dependencies, incorrect polyfills, and other runtime-only failures will not surface from the terminal output alone — they appear as errors in the browser console. If an MCP-connected browser is available, use it to inspect the console. Otherwise, open the dev URL manually and verify no errors appear.

### 6. No Placeholders or Mocks in Delivered Code
- Every user-visible action must do what it claims. If the UI says "Recorded on XL1 Blockchain", the code must actually submit a transaction — not call `console.log` with a TODO comment.
- Do not stub integrations with placeholder implementations (e.g., `Account.random()` instead of a real wallet connection, a no-op function behind a "Submit" button). If the real integration isn't wired up yet, the UI should not present it as functional.
- If something genuinely cannot be implemented yet (missing API, blocked dependency), disable the UI element or show an explicit "not yet available" state — never fake success.

### 7. No Regressions
- Existing functionality still works, not just the new code
- If the change touches shared utilities or interfaces, verify downstream consumers
- If unsure whether something regressed, run the full test suite — don't assume

### Applying the Definition of Done

Before declaring any task complete, run through this checklist explicitly. If any step fails, the work is not done — fix it before moving on. This applies equally to new features, bug fixes, and refactors.
