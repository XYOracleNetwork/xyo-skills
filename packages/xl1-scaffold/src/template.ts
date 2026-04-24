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
  }
  scripts: Record<string, string>
  files: TemplateFile[]
  smokeTest?: { pnpmScript: string }
  nextSteps: string[]
}

export const BASE = {
  scripts: {
    'lint': 'eslint .',
    'lint:fix': 'eslint . --fix',
    'test': 'vitest run',
    'test:watch': 'vitest',
    'typecheck': 'tsc --noEmit',
  },
  tsconfig: {
    compilerOptions: { outDir: './dist', rootDir: './src' },
    include: ['src'],
  },
  sharedFiles: [
    { src: '_gitignore', dest: '.gitignore' },
  ] as TemplateFile[],
} as const
