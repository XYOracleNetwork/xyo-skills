import { extendBase } from './base.js';
const xl1MonorepoTemplateOverrides = {
    name: 'xl1-monorepo',
    description: 'pnpm workspace root for XL1 dApps (sub-packages added via subsequent --workspace-member scaffolds)',
    // No runtime deps at the workspace root. devDeps come from base
    // (@xylabs/toolchain, @xylabs/tsconfig, eslint, typescript, vitest) — sub-
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
        'dev': 'pnpm -r --parallel run dev',
        'build': 'pnpm -r run build',
        'typecheck': 'pnpm -r run typecheck',
        'lint': 'pnpm -r run lint',
        'lint:fix': 'pnpm -r run lint:fix',
        'test': 'pnpm -r run test',
    },
    // The root only holds workspace orchestration — no source to compile, no
    // tsconfig.json needed. Each sub-package carries its own tsconfig.
    omitTsconfig: true,
    files: [
        { src: 'xl1-monorepo/pnpm-workspace.yaml', dest: 'pnpm-workspace.yaml' },
        { src: 'xl1-monorepo/_env.example', dest: '.env.example' },
        { src: 'xl1-monorepo/README.md', dest: 'README.md' },
    ],
};
export const xl1MonorepoTemplate = extendBase(xl1MonorepoTemplateOverrides);
//# sourceMappingURL=xl1-monorepo.js.map