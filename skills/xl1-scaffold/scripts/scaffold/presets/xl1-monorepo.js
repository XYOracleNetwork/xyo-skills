import { extendBase, omitScripts } from './base.js';
const xl1MonorepoTemplateOverrides = {
    name: 'xl1-monorepo',
    description: 'pnpm workspace root for XL1 dApps (sub-packages added via subsequent --workspace-member scaffolds)',
    // No runtime deps at the workspace root. devDeps come from base
    // (@ariestools/toolchain, @ariestools/tsconfig, ESLint, TypeScript, Vitest) — sub-
    // packages share these via `pnpm -r run lint/typecheck/test/build`.
    deps: {
        runtime: [],
        dev: [],
    },
    scripts: {
        // Workspace orchestrator scripts. `-r` fans out to every workspace package.
        // `dev` uses --parallel so app and service run concurrently in one terminal;
        // packages without a dev script (e.g. xl1-shared) are skipped automatically.
        // The default port pair is :3000 (app, Vite) and :3001 (service, Express),
        // wired same-origin via Vite's /api/* proxy — see browser-service-wiring.md.
        //
        // app and service resolve `@<scope>/shared` through its `exports` map to the
        // emitted dist/ (.js + .d.ts), so every script that compiles, lints, tests or
        // runs a consumer builds shared first. `build` needs no pre-step: `pnpm -r`
        // runs in topological order, so shared builds before its dependents. The path
        // filter matches nothing (exit 0) when the workspace has no packages/shared.
        'build:shared': 'pnpm --filter ./packages/shared run build',
        'dev': 'pnpm run build:shared && pnpm -r --parallel run dev',
        'build': 'pnpm -r run build',
        'typecheck': 'pnpm run build:shared && pnpm -r run typecheck',
        'lint': 'pnpm run build:shared && pnpm -r run lint',
        'lint:fix': 'pnpm run build:shared && pnpm -r run lint:fix',
        'test': 'pnpm run build:shared && pnpm -r run test',
    },
    // The root only holds workspace orchestration — no source to compile, no
    // tsconfig.json needed. Each sub-package carries its own tsconfig.
    omitTsconfig: true,
    // pnpm-workspace.yaml is generated (workspace-yaml.ts), not copied: it
    // carries the pnpm 12 settings every non-member project gets, plus this
    // `packages` list.
    workspacePackages: ['packages/*'],
    files: [
        { src: 'xl1-monorepo/_env.example', dest: '.env.example' },
        { src: 'xl1-monorepo/README.md', dest: 'README.md' },
    ],
};
// Base's `test:watch: vitest` would run every package's specs at the root
// under no package's vitest config (wrong environment for app vs service).
// Watch from inside a package instead: `pnpm --filter <pkg> run test:watch`.
export const xl1MonorepoTemplate = omitScripts(extendBase(xl1MonorepoTemplateOverrides), ['test:watch']);
//# sourceMappingURL=xl1-monorepo.js.map