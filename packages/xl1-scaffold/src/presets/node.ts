import { extendBase } from './base.js'

export const nodeTemplate = extendBase({
  name: 'node',
  description: 'Node.js + TypeScript XL1 service/CLI',
  deps: {
    runtime: ['@xyo-network/sdk-js', '@xyo-network/xl1-sdk'],
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
    { src: 'eslint.config.mjs', dest: 'eslint.config.mjs' },
    { src: 'vitest.config.ts', dest: 'vitest.config.ts' },
    { src: 'src/index.ts', dest: 'src/index.ts' },
  ],
  smokeTest: { pnpmScript: 'start' },
})
