# Git Workflow

## Conventional Commits

All commit messages follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description
```

### Types
- `feat` — a new feature
- `fix` — a bug fix
- `refactor` — code change that neither fixes a bug nor adds a feature
- `chore` — maintenance tasks, dependency updates, config changes
- `docs` — documentation only changes
- `test` — adding or updating tests
- `build` — changes to the build system or dependencies
- `ci` — changes to CI configuration

### Rules
- **Scope** is optional but encouraged (e.g., `feat(game): add move validation`)
- **Description** is lowercase, imperative mood, no trailing period
- Keep the first line under 72 characters
- Use the body for additional context when the description alone isn't enough

### Examples
```
feat(rps): add rock-paper-scissors move submission
fix(wallet): handle disconnection during transaction signing
refactor(api): extract payload validation into shared utility
chore: update typescript to 5.x
```

## Atomic Commits

Each commit is exactly **one logical change**.

- Every commit should compile and pass tests independently
- If a change requires multiple steps, each step is its own commit
- Don't mix refactoring with feature work in one commit
- Don't mix formatting changes with logic changes

If you find yourself writing "and" in a commit message, consider splitting it into two commits.

## Never Rewrite History

Git history is append-only. We always add to it, never rewrite it.

**Never do any of the following:**
- `git commit --amend` — make a new commit instead
- `git rebase` (interactive or otherwise) — merge instead
- `git push --force` or `git push --force-with-lease` — if the push is rejected, resolve it with a merge
- `git reset --hard` to a previous commit — use `git revert` to undo changes
- `git filter-branch` or `git rebase --onto` — history stays as-is

**Why:** Rewriting history destroys the audit trail, breaks other people's branches, and makes it impossible to trust that what you see is what actually happened. In a protocol built on cryptographic proof of origin, immutable history isn't just a preference — it's a principle.

**If you made a mistake in a commit:**
- Wrong code? Make a new commit that fixes it.
- Bad commit message? Let it stand — the next commit's message can provide context.
- Committed to the wrong branch? Cherry-pick to the right branch, revert on the wrong one.

## Gitflow Branching Model

We follow [Gitflow](https://nvie.com/posts/a-successful-branching-model/) where possible.

### Long-lived Branches
- **`main`** — production-ready code. Every commit on main is a release.
- **`develop`** — integration branch for the next release. Feature branches merge here.

### Short-lived Branches
- **`feature/<description>`** — new functionality, branched from `develop`, merged back to `develop`
- **`fix/<description>`** — bug fixes during development, branched from `develop`
- **`release/<version>`** — release prep (version bumps, final fixes), branched from `develop`, merged to both `main` and `develop`
- **`hotfix/<description>`** — urgent production fixes, branched from `main`, merged to both `main` and `develop`

### Branch Naming
- Use kebab-case for the description: `feature/rps-game-ui`, `hotfix/wallet-connection-timeout`
- Keep it short but descriptive enough to understand the purpose at a glance

### Workflow
1. New work starts as a `feature/` branch off `develop`
2. When complete, merge feature into `develop`
3. When `develop` is release-ready, create a `release/` branch for final stabilization
4. Merge the release branch into `main` (tag it) and back into `develop`
5. If a critical bug is found in production, create a `hotfix/` branch from `main`

### Pragmatism
Not every repo needs the full ceremony. For smaller projects or early-stage work, a simplified flow (feature branches off `main`, no `develop`) is acceptable. Use the full model when the project has releases, environments, or multiple contributors that benefit from the structure.
