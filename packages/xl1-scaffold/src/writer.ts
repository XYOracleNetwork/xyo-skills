import { spawnSync } from 'node:child_process'
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderTemplate } from './network.js'
import type { PnpmRunner } from './pnpm-runner.js'
import type { TemplateFile } from './template.js'

// Resolves the templates directory both in dev (tsx src/...) and compiled (dist/...) modes.
// Source layout:    packages/xl1-scaffold/templates/
// Compiled layout:  packages/xl1-scaffold/dist/templates/  (populated by scripts/copy-templates.mjs)
export function resolveTemplatesRoot(moduleUrl: string): string {
  const here = path.dirname(fileURLToPath(moduleUrl))
  // In compiled mode: here = .../dist, templates = .../dist/templates
  // In dev mode:       here = .../src, templates = .../templates (sibling)
  const compiledPath = path.resolve(here, 'templates')
  if (existsSync(compiledPath)) return compiledPath
  const devPath = path.resolve(here, '..', 'templates')
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
    throw new Error(`Target dir is not empty: ${target}. Pass --force to overwrite files in place.`)
  }
}

export function writeString(target: string, relPath: string, contents: string): void {
  const out = path.join(target, relPath)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, contents.endsWith('\n') ? contents : contents + '\n')
  console.log(`  wrote ${relPath}`)
}

export function writeJson(target: string, relPath: string, value: unknown): void {
  writeString(target, relPath, JSON.stringify(value, null, 2))
}

// Copies a template file, substituting `__XL1_*__` tokens from `vars` (see
// network.ts). Every template file is UTF-8 text.
export function copyTemplateFile(templatesRoot: string, file: TemplateFile, target: string, vars: Record<string, string>): void {
  // file.src is a path relative to templates/ (e.g. 'node/eslint.config.mjs',
  // 'shared/_gitignore'). Each preset's files declare their source location
  // explicitly, so a child template inheriting from a parent picks up the
  // parent's file paths automatically — no fallback chain needed.
  const found = path.resolve(templatesRoot, file.src)
  if (!existsSync(found)) {
    throw new Error(`template file not found: ${found}`)
  }
  const out = path.join(target, file.dest)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, renderTemplate(readFileSync(found, 'utf8'), vars))
  console.log(`  wrote ${file.dest}`)
}

export function runPnpmStep(runner: PnpmRunner, target: string, label: string, pnpmArgs: string[]): void {
  console.log(`\n${label}...`)
  // A standalone project carries its own pnpm-workspace.yaml, which makes it
  // its own workspace root, so pnpm never walks up into an enclosing
  // workspace. Only without one is --ignore-workspace needed for that — and it
  // must not be passed with one, because it also makes pnpm skip the
  // settings (allowBuilds, minimumReleaseAge, …) in that file.
  const ignoreWorkspace = existsSync(path.join(target, 'pnpm-workspace.yaml')) ? [] : ['--ignore-workspace']
  const r = spawnSync(
    runner.command,
    [...runner.args, ...ignoreWorkspace, ...pnpmArgs],
    { cwd: target, stdio: 'inherit' },
  )
  if (r.status === 0) return
  if (r.error) console.error(`${runner.label} failed to start: ${r.error.message}`)
  // eslint-disable-next-line unicorn/no-process-exit -- CLI tool: propagate pnpm's exact exit code for CI visibility
  process.exit(r.status ?? 1)
}
