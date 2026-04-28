#!/usr/bin/env node
// Mirrors packages/xl1-scaffold/templates/ into dist/templates/ so the compiled
// scaffold script is self-contained.

import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { scaffoldRoot } from './paths.mjs'

const ROOT = scaffoldRoot(import.meta.url)
const SRC = resolve(ROOT, 'templates')
const DEST = resolve(ROOT, 'dist/templates')

if (!existsSync(SRC)) {
  console.error(`Source templates dir missing: ${SRC}`)
  process.exit(1)
}

mkdirSync(DEST, { recursive: true })
cpSync(SRC, DEST, { recursive: true })
console.log(`Copied templates -> ${DEST}`)
