import { deepMerge } from '../utils/deep-merge.js';
// Universal defaults shared by every concrete preset. Presets must NOT repeat
// what's listed here — `extendBase`'s deep-merge concats arrays, so duplicates
// would propagate into the generated package.json.
//
// If a future preset needs to *exclude* something the base provides (e.g. opt
// out of vitest), introduce a `deps.devExclude: string[]` slot on Template and
// apply the exclusion after the merge in extendBase. Not needed today.
export const baseTemplate = {
    name: 'base',
    description: 'shared base preset',
    deps: {
        runtime: [],
        dev: ['@ariestools/toolchain', '@ariestools/tsconfig', 'eslint', 'typescript', 'vitest'],
        // `typescript` is pinned rather than resolved to `^latest`: typescript-eslint
        // declares `typescript: >=4.8.4 <6.1.0`, so an unpinned TS resolves to 7.x
        // and every `pnpm lint` dies with "typescript-eslint does not support TS
        // 7.0" before linting a single file. Raise this to ^6 once typescript-eslint
        // ships TS >=7 support (typescript-eslint#10940).
        versions: { typescript: '^5' },
    },
    tsconfig: {
        extends: '@ariestools/tsconfig',
        compilerOptions: { outDir: './dist', rootDir: './src' },
        include: ['src'],
    },
    scripts: {
        'lint': 'eslint .',
        'lint:fix': 'eslint . --fix',
        // --passWithNoTests: a freshly scaffolded project has no specs yet, and
        // vitest exits 1 on "No test files found". A placeholder spec would be
        // dead weight the dApp DoD then flags; real specs land with the features.
        'test': 'vitest run --passWithNoTests',
        'test:watch': 'vitest',
        'typecheck': 'tsc --noEmit',
    },
    files: [{ src: 'shared/_gitignore', dest: '.gitignore' }],
    nextSteps: ['pnpm dev'],
};
// Generic preset extension. Use `extendBase` for direct base extension, or
// `extend(parent, override)` to compose a preset on top of another preset.
//
// Files are deduped by `dest` after the deepMerge, with later (child) entries
// winning. This lets a child preset override an inherited file by declaring
// the same `dest` with a different `src`.
export function extend(parent, override) {
    const merged = deepMerge(parent, override);
    const seen = new Set();
    merged.files = merged.files.toReversed().filter((f) => {
        if (seen.has(f.dest))
            return false;
        seen.add(f.dest);
        return true;
    }).toReversed();
    return merged;
}
export function extendBase(override) {
    return extend(baseTemplate, override);
}
// Drops inherited scripts that make no sense for a preset. deepMerge cannot
// delete keys (an undefined child value keeps the parent's), so removal is a
// separate, explicit step.
export function omitScripts(template, names) {
    return {
        ...template,
        scripts: Object.fromEntries(Object.entries(template.scripts).filter(([name]) => !names.includes(name))),
    };
}
//# sourceMappingURL=base.js.map