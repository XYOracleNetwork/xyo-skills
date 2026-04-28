export interface TemplateFile {
  dest: string
  src: string
}

export interface Template {
  deps: {
    dev: string[]
    extras?: string[]
    runtime: string[]
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
