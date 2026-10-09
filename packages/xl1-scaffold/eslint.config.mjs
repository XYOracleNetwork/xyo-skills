import { recommendedConfig } from '@ariestools/eslint-config-flat'

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
  // Tier 2 type-checked is what 10.x maps the old @xylabs `config`
  // (recommendedTypeCheckedConfig) to.
  ...recommendedConfig({ tier: 2, isTypeChecked: true }),
]
