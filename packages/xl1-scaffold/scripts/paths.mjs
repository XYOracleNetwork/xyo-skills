// Shared path helpers for the scaffold's build scripts. Used by
// copy-templates.mjs and sync-to-plugin.mjs.

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Given an import.meta.url from a script under packages/xl1-scaffold/scripts/,
// returns the absolute path to the scaffold package root.
export function scaffoldRoot(moduleUrl) {
  return resolve(dirname(fileURLToPath(moduleUrl)), '..')
}

// Walks up from the given directory until it finds a pnpm-workspace.yaml.
// Throws if it never does (means we're outside the workspace tree).
export function findWorkspaceRoot(startDir) {
  let dir = startDir
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    dir = dirname(dir)
  }
  throw new Error(`pnpm-workspace.yaml not found walking up from ${startDir}`)
}
