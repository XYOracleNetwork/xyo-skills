#!/usr/bin/env node
// Mirrors packages/xl1-scaffold/templates/ into dist/templates/ so the compiled
// bootstrap script is self-contained.

import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SRC = resolve(ROOT, 'templates')
const DEST = resolve(ROOT, 'dist/templates')

if (!existsSync(SRC)) {
  console.error(`Source templates dir missing: ${SRC}`)
  process.exit(1)
}

mkdirSync(DEST, { recursive: true })
cpSync(SRC, DEST, { recursive: true })
console.log(`Copied templates -> ${DEST}`)
