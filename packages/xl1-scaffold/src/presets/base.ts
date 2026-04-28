import type { Template } from '../template.js'
// eslint-disable-next-line import-x/no-internal-modules -- internal helper, intentional sibling reach
import { deepMerge } from '../utils/deep-merge.js'

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

// Universal defaults shared by every concrete preset. Presets must NOT repeat
// what's listed here — `extendBase`'s deep-merge concats arrays, so duplicates
// would propagate into the generated package.json.
//
// If a future preset needs to *exclude* something the base provides (e.g. opt
// out of vitest), introduce a `deps.devExclude: string[]` slot on Template and
// apply the exclusion after the merge in extendBase. Not needed today.
export const baseTemplate: Template = {
  name: 'base',
  description: 'shared base preset',
  deps: {
    runtime: [],
    dev: ['@xylabs/toolchain', '@xylabs/tsconfig', 'eslint', 'typescript', 'vitest'],
  },
  tsconfig: {
    extends: '@xylabs/tsconfig',
    compilerOptions: { outDir: './dist', rootDir: './src' },
    include: ['src'],
  },
  scripts: {
    'lint': 'eslint .',
    'lint:fix': 'eslint . --fix',
    'test': 'vitest run',
    'test:watch': 'vitest',
    'typecheck': 'tsc --noEmit',
  },
  files: [{ src: '_gitignore', dest: '.gitignore' }],
  nextSteps: ['pnpm dev'],
}

export type Override = DeepPartial<Template> & Pick<Template, 'name' | 'description'>

export function extendBase(override: Override): Template {
  return deepMerge(baseTemplate, override)
}
