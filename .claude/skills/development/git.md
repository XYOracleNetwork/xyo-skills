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

## Branch Naming

Branches follow the pattern:

```
type/short-description
```

Use the same type prefixes as conventional commits:

```
feature/rps-game-ui
fix/wallet-connection-timeout
chore/update-deps
refactor/extract-game-logic
```

- Use kebab-case for the description
- Keep it short but descriptive enough to understand the purpose at a glance
