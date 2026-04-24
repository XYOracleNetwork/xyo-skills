import { config as xylabsConfig } from '@xylabs/eslint-config-flat'

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
  ...xylabsConfig,
]
