import { extendBase } from './base.js';
const nodeTemplateOverrides = {
    name: 'node',
    description: 'Node.js + TypeScript XL1 service/CLI',
    deps: {
        runtime: ['@xyo-network/sdk-js', '@xyo-network/xl1-sdk', 'dotenv'],
        dev: ['@xylabs/eslint-config-flat', '@types/node', 'tsx'],
    },
    tsconfig: {
        // Base @xylabs/tsconfig sets noEmit: true + allowImportingTsExtensions:
        // true. Both must be overridden so `tsc` produces dist/ for `pnpm start`.
        // `typecheck` passes --noEmit on the CLI, so type-check-only runs still
        // do the right thing.
        compilerOptions: { noEmit: false, allowImportingTsExtensions: false },
    },
    scripts: {
        dev: 'tsx --watch src/index.ts',
        start: 'node dist/index.js',
        build: 'tsc',
    },
    files: [
        { src: 'node/eslint.config.mjs', dest: 'eslint.config.mjs' },
        { src: 'node/vitest.config.ts', dest: 'vitest.config.ts' },
        { src: 'node/_env.example', dest: '.env.example' },
        { src: 'node/src/index.ts', dest: 'src/index.ts' },
    ],
    smokeTest: { pnpmScript: 'start' },
};
export const nodeTemplate = extendBase(nodeTemplateOverrides);
//# sourceMappingURL=node.js.map