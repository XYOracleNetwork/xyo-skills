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

### Repo Conventions

Beyond scripts and config files, observe how the existing codebase does things:
- How are modules structured? Follow the same patterns for new code.
- How are exports organized? Match the style.
- How are dependencies declared? If the repo uses `dependencies` vs `devDependencies` with intent, respect that.
- If there are existing examples of what you're building (a similar component, endpoint, or utility), use them as a template rather than inventing a new pattern.

When in doubt, read existing code first and follow its lead.

### The Rule

If the repo has a way to do it, use the repo's way. Ad-hoc commands are for exploration only — never for producing a deliverable.

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

### 5. No Regressions
- Existing functionality still works, not just the new code
- If the change touches shared utilities or interfaces, verify downstream consumers
- If unsure whether something regressed, run the full test suite — don't assume

### Applying the Definition of Done

Before declaring any task complete, run through this checklist explicitly. If any step fails, the work is not done — fix it before moving on. This applies equally to new features, bug fixes, and refactors.
