import { extendBase } from './base.js';
const xl1SharedTemplateOverrides = {
    name: 'xl1-shared',
    description: 'TypeScript library for an XL1 monorepo — shared types, schemas, helpers',
    deps: {
        runtime: [],
        // Required by the eslint.config.mjs below (ESLint itself comes from base).
        // Without a config, `eslint .` aborts and `pnpm -r run lint` fails.
        dev: ['@ariestools/eslint-config-flat'],
    },
    tsconfig: {
        // Environment-neutral (no DOM, no Node-only globals). Override base's
        // noEmit:true → false because downstream workspace members import the
        // compiled `dist/` output via `workspace:*`.
        compilerOptions: { noEmit: false, allowImportingTsExtensions: false },
    },
    // Without an `exports` map, `import … from '@<scope>/shared'` cannot resolve
    // under NodeNext (inherited from @ariestools/tsconfig) or Vite. Targets are
    // what `tsc` emits for src/index.ts given base's rootDir ./src + outDir ./dist
    // (`declaration: true` comes from @ariestools/tsconfig). `types` must stay
    // first — conditions match in key order.
    packageJson: {
        exports: {
            '.': {
                types: './dist/index.d.ts',
                default: './dist/index.js',
            },
        },
    },
    scripts: { build: 'tsc' },
    files: [
        // Environment-neutral flat config (no React/DOM rules) — same file the
        // node preset ships; no copy needed in templates/xl1-shared/.
        { src: 'node/eslint.config.mjs', dest: 'eslint.config.mjs' },
        { src: 'xl1-shared/src/index.ts', dest: 'src/index.ts' },
    ],
    // No smoke test — libraries don't have a runtime to smoke. Build + typecheck
    // cover correctness; downstream packages will fail to import if the build
    // is broken.
};
export const xl1SharedTemplate = extendBase(xl1SharedTemplateOverrides);
//# sourceMappingURL=xl1-shared.js.map