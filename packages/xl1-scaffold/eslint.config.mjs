import { config as xylabsConfig } from '@xylabs/eslint-config-flat'

export default [
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'templates/',
      'eslint.config.mjs',
      'scripts/',
      'vitest.config.ts',
    ],
  },
  ...xylabsConfig,
]
