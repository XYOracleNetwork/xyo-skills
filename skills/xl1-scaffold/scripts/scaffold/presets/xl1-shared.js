import { extendBase } from './base.js';
const xl1SharedTemplateOverrides = {
    name: 'xl1-shared',
    description: 'TypeScript library for an XL1 monorepo — shared types, schemas, helpers',
    deps: {
        runtime: [],
        dev: [],
    },
    tsconfig: {
        // Environment-neutral (no DOM, no Node-only globals). Override base's
        // noEmit:true → false because downstream workspace members import the
        // compiled `dist/` output via `workspace:*`.
        compilerOptions: { noEmit: false, allowImportingTsExtensions: false },
    },
    scripts: { build: 'tsc' },
    files: [
        { src: 'xl1-shared/src/index.ts', dest: 'src/index.ts' },
    ],
    // No smoke test — libraries don't have a runtime to smoke. Build + typecheck
    // cover correctness; downstream packages will fail to import if the build
    // is broken.
};
export const xl1SharedTemplate = extendBase(xl1SharedTemplateOverrides);
//# sourceMappingURL=xl1-shared.js.map