export interface TemplateFile {
  dest: string
  src: string
}

export interface Template {
  deps: {
    dev: string[]
    extras?: string[]
    runtime: string[]
    // Optional sparse map of package-name → version string. Any package in
    // this map keeps the listed version verbatim instead of resolving to the
    // latest from the npm registry. Applies to runtime, dev, extras, AND
    // peer-deps pulled in by registry expansion. Merges via deepMerge — base
    // pins are inherited; preset entries override on key conflict.
    versions?: Record<string, string>
  }
  description: string
  files: TemplateFile[]
  name: string
  nextSteps: string[]
  scripts: Record<string, string>
  smokeTest?: { pnpmScript: string }
  tsconfig: {
    compilerOptions?: Record<string, unknown>
    extends: string
    include?: string[]
  }
}
