export const BASE = {
    scripts: {
        'lint': 'eslint .',
        'lint:fix': 'eslint . --fix',
        'test': 'vitest run',
        'test:watch': 'vitest',
        'typecheck': 'tsc --noEmit',
    },
    tsconfig: {
        compilerOptions: { outDir: './dist', rootDir: './src' },
        include: ['src'],
    },
    sharedFiles: [
        { src: '_gitignore', dest: '.gitignore' },
    ],
};
//# sourceMappingURL=template.js.map