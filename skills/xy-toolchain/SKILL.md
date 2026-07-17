---
name: xy-toolchain
description: Aries Tools TypeScript toolchain used by XY, XYO, and XL1 repositories. Covers the @ariestools/toolchain xy CLI, library and application profiles, monorepo and single-package topology, package-manager behavior, xy.config.ts compile modes, tiered ESLint flat configs, @ariestools TypeScript configs, Vitest, dependency and API-exposure analysis, publishing checks, dead-code analysis, repository policy, skills, and work tracking. Use when setting up or maintaining projects, selecting a project profile, running or debugging build/lint/test commands, configuring package output, fixing dependency placement or required presence, validating publish surfaces, or interpreting xy command failures.
metadata:
  version: 1.1.25 # x-release-please-version
---

# XY Toolchain

Use the active [`@ariestools/toolchain`](https://github.com/ariestools/toolchain) packages. Do not install the retired `@xylabs/*` compatibility names in new work.

Inspect the repository's `package.json`, lockfile, `xy.config.ts`, ESLint config, TypeScript configs, and test config before choosing commands. Prefer existing repository scripts; use the `xy` CLI directly when the repository exposes no narrower wrapper.

This skill builds on the [Development Skill](../xy-development/SKILL.md), which covers language and workflow principles. Load only the reference needed for the task:

## References

### [Project profiles](project-profiles.md)

Read first when classifying a repository or package as a library or final application, choosing neutral/node/browser/React guidance, deciding how monorepo and single-package setup differ, or determining whether framework tooling or `xy compile` owns production output.

### [Toolchain and project setup](toolchain.md)

Read when installing the toolchain, selecting a package manager, wiring scripts, distinguishing `xy` commands from `package-*` hooks, migrating from `@xylabs/*`, or troubleshooting project setup.

### [Compilation and package output](compilation.md)

Read when editing `xy.config.ts`, selecting neutral/node/browser targets, choosing library/bundle/transpile/monolith/vendor mode, configuring validation, or debugging emitted files and export layouts.

### [Command and policy catalog](commands.md)

Read when choosing among `build`, `check`, `fix`, `deplint`, `api-exposure`, `publint`, `dead`, repository-policy commands, `skills`, or `work`; also read when configuring dependency placement/presence or using `--rules`, `--json`, `--strict`, and automation behavior.

### [ESLint configuration](eslint.md)

Read when creating or repairing an ESLint flat config, selecting a rule tier, enabling type-aware linting, honoring `.gitignore`, diagnosing lint performance, or using `xy lint init`, `lint lint`, and `lint config`.

### [TypeScript configuration](typescript.md)

Read when selecting `@ariestools/tsconfig`, `-dom`, or `-react`, configuring Node types, interpreting `noEmit`, or separating type validation from toolchain emission.

### [Testing with Vitest](testing.md)

Read when configuring Vitest, choosing spec locations, running a workspace or path, clearing the test cache, or distinguishing test failures from build failures.

## Scaffolding an XL1 app

Use the [xl1-scaffold](../xl1-scaffold/SKILL.md) skill for an XL1 application scaffold, then verify the generated dependencies and configs use the active `@ariestools/*` packages described here before installing.
