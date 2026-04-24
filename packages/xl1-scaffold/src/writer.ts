import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { TemplateFile } from './template.js'

// Resolves the templates directory both in dev (tsx src/...) and compiled (dist/...) modes.
// Source layout:    packages/xl1-scaffold/templates/
// Compiled layout:  packages/xl1-scaffold/dist/templates/  (populated by build/copy-templates.mjs)
export function resolveTemplatesRoot(moduleUrl: string): string {
  const here = dirname(fileURLToPath(moduleUrl))
  // In compiled mode: here = .../dist, templates = .../dist/templates
  // In dev mode:       here = .../src, templates = .../templates (sibling)
  const compiledPath = resolve(here, 'templates')
  if (existsSync(compiledPath)) return compiledPath
  const devPath = resolve(here, '..', 'templates')
  if (existsSync(devPath)) return devPath
  throw new Error(`templates dir not found near ${here}`)
}

export function ensureTargetDir(target: string, force: boolean): void {
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true })
    return
  }
  const entries = readdirSync(target)
  if (entries.length > 0 && !force) {
    console.error(`Target dir is not empty: ${target}`)
    console.error('Pass --force to overwrite files in place.')
    process.exit(1)
  }
}

export function writeString(target: string, relPath: string, contents: string): void {
  const out = join(target, relPath)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, contents.endsWith('\n') ? contents : contents + '\n')
  console.log(`  wrote ${relPath}`)
}

export function writeJson(target: string, relPath: string, value: unknown): void {
  writeString(target, relPath, JSON.stringify(value, null, 2))
}

export function copyTemplateFile(templatesRoot: string, templateName: string, file: TemplateFile, target: string): void {
  // shared files live at templates/shared/, template files at templates/<name>/
  const candidates = [
    resolve(templatesRoot, templateName, file.src),
    resolve(templatesRoot, 'shared', file.src),
  ]
  const found = candidates.find(p => existsSync(p))
  if (!found) {
    throw new Error(`template file not found: ${file.src} (looked in ${candidates.join(', ')})`)
  }
  const out = join(target, file.dest)
  mkdirSync(dirname(out), { recursive: true })
  copyFileSync(found, out)
  console.log(`  wrote ${file.dest}`)
}

export function runPnpmStep(target: string, label: string, pnpmArgs: string[]): void {
  console.log(`\n${label}...`)
  // --ignore-workspace prevents pnpm from walking up to a parent
  // pnpm-workspace.yaml, which would otherwise make it treat the scaffolded
  // target as a workspace member (reusing the outer node_modules instead of
  // installing the target's own deps).
  const r = spawnSync(
    'corepack',
    ['pnpm@10', '--ignore-workspace', ...pnpmArgs],
    { cwd: target, stdio: 'inherit' },
  )
  if (r.status !== 0) {
    console.error(`${label} failed.`)
    process.exit(r.status ?? 1)
  }
}
