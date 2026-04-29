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
  files: [{ src: 'shared/_gitignore', dest: '.gitignore' }],
  nextSteps: ['pnpm dev'],
}

export type Override = DeepPartial<Template> & Pick<Template, 'name' | 'description'>

// Generic preset extension. Use `extendBase` for direct base extension, or
// `extend(parent, override)` to compose a preset on top of another preset.
//
// Files are deduped by `dest` after the deepMerge, with later (child) entries
// winning. This lets a child preset override an inherited file by declaring
// the same `dest` with a different `src`.
export function extend(parent: Template, override: Override): Template {
  const merged = deepMerge(parent, override)
  const seen = new Set<string>()
  merged.files = [...merged.files].reverse().filter((f) => {
    if (seen.has(f.dest)) return false
    seen.add(f.dest)
    return true
  }).reverse()
  return merged
}

export function extendBase(override: Override): Template {
  return extend(baseTemplate, override)
}
