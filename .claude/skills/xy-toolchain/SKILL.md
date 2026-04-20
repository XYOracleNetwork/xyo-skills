---
name: xy-toolchain
description: XY Labs development toolchain (@xylabs packages). Covers @xylabs/toolchain CLI, ESLint flat config, TypeScript config variants, and Vitest. Activates when setting up projects, running builds, configuring linting, or writing tests in XY/XYO/XL1 projects.
user-invocable: false
---

# XY Toolchain

XY Labs publishes a coordinated set of development packages from the [xylabs/config](https://github.com/xylabs/config) monorepo. This skill covers how to use them.

This builds on the [Development Skill](../development/SKILL.md) which covers universal principles. This skill covers the **specific tools**.

## Table of Contents

### [Toolchain & Project Setup](toolchain.md)
Read when setting up a new project, running build/lint/compile commands, or troubleshooting build failures. Covers `@xylabs/toolchain` CLI, package manager conventions, and project structure.

### [ESLint Configuration](eslint.md)
Read when configuring ESLint, troubleshooting lint errors, or extending lint rules. Covers `@xylabs/eslint-config-flat` setup and usage.

### [TypeScript Configuration](typescript.md)
Read when configuring the TypeScript compiler, choosing a tsconfig base, or troubleshooting compilation. Covers `@xylabs/tsconfig`, `@xylabs/tsconfig-dom`, and `@xylabs/tsconfig-react`.

### [Testing with Vitest](testing.md)
Read when setting up tests, configuring Vitest, or integrating tests with the build pipeline. Covers Vitest setup and XY-specific testing conventions.
