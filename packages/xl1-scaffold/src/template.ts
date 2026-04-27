export interface TemplateFile {
  src: string
  dest: string
}

export interface Template {
  name: string
  description: string
  deps: {
    runtime: string[]
    extras?: string[]
    dev: string[]
  }
  tsconfig: {
    extends: string
    compilerOptions?: Record<string, unknown>
    include?: string[]
  }
  scripts: Record<string, string>
  files: TemplateFile[]
  smokeTest?: { pnpmScript: string }
  nextSteps: string[]
}
