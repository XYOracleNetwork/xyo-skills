import { config as ariesConfig } from '@ariestools/eslint-config-flat'

export default [
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'eslint.config.mjs',
      'vitest.config.ts',
    ],
  },
  ...ariesConfig,
]
