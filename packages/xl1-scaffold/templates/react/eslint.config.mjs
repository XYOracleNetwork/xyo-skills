import { config as ariesConfig } from '@ariestools/eslint-config-react-flat'

export default [
  {
    // The root config files sit outside tsconfig's `include: ['src']`, so the
    // type-checked preset's projectService cannot resolve them and errors with
    // "was not found by the project service". Ignoring them matches how the
    // node template handles its own root config files.
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'eslint.config.mjs',
      'vite.config.ts',
      'vitest.config.ts',
    ],
  },
  ...ariesConfig,
]
