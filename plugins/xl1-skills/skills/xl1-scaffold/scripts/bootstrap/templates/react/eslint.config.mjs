import { recommendedConfig as xylabsConfig } from '@xylabs/eslint-config-react-flat'

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  ...xylabsConfig,
]
