#!/usr/bin/env node
// Zero-dep validator for Agent Skills frontmatter and concrete schema examples.
// Usage: node scripts/validate-skills.mjs <skills-dir>
// Exits non-zero on invalid skills, emitting GitHub-style ::error annotations.

import { readdirSync, readFileSync, lstatSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { exit, argv } from 'node:process'

import { findSchemaLiteralErrors } from './schema-literals.mjs'

const SKILL_DIR_NAME_RE = /^[a-z0-9][a-z0-9-]*$/
const REQUIRED_FIELDS = ['name', 'description']

let errorCount = 0

function err(file, line, msg) {
  const loc = line ? `file=${file},line=${line}` : `file=${file}`
  console.error(`::error ${loc}::${msg}`)
  errorCount++
}

function parseFrontmatter(content, filePath) {
  const lines = content.split('\n')
  if (lines[0] !== '---') {
    err(filePath, 1, 'SKILL.md must start with `---` frontmatter delimiter')
    return null
  }
  const endIdx = lines.indexOf('---', 1)
  if (endIdx === -1) {
    err(filePath, 1, 'frontmatter block is not closed with a `---` delimiter')
    return null
  }
  const fields = {}
  for (let i = 1; i < endIdx; i++) {
    const raw = lines[i]
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue
    if (/^\s/.test(raw)) continue
    const match = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/)
    if (!match) {
      err(filePath, i + 1, `unparseable frontmatter line: ${JSON.stringify(raw)}`)
      continue
    }
    const [, key, rawValue] = match
    let value = rawValue.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    fields[key] = { value, line: i + 1 }
  }
  return fields
}

function hasSymlinkAnywhere(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isSymbolicLink()) return p
    if (entry.isDirectory()) {
      const nested = hasSymlinkAnywhere(p)
      if (nested) return nested
    }
  }
  return null
}

/**
 * Base skills whose authority lives in ariestools/ariestools-skills.
 * This repo may keep only temporary redirect stubs under these names.
 */
const REDIRECT_STUBS = {
  'xy-development': new Set(['SKILL.md', 'workflow.md']),
  'xy-toolchain': new Set(['SKILL.md', 'testing.md']),
}

const REDIRECT_SKILL_MD_MAX_LINES = 80
const REDIRECT_SHIM_MD_MAX_LINES = 60

function validateRedirectStub(skillsDir, name, allowlist) {
  const dir = join(skillsDir, name)
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      err(full, null, `redirect stub "${name}" must not contain nested dirs or symlinks`)
      continue
    }
    if (!allowlist.has(entry.name)) {
      err(full, null, `redirect stub "${name}" may only contain ${[...allowlist].join(', ')}; remove "${entry.name}" (canonical docs live in ariestools/ariestools-skills)`)
    }
  }

  const skillMd = join(dir, 'SKILL.md')
  let content
  try {
    content = readFileSync(skillMd, 'utf8')
  } catch {
    err(skillMd, null, 'SKILL.md not found')
    return
  }

  const lineCount = content.split('\n').length
  if (lineCount > REDIRECT_SKILL_MD_MAX_LINES) {
    err(skillMd, null, `redirect stub SKILL.md is ${lineCount} lines (max ${REDIRECT_SKILL_MD_MAX_LINES}); do not grow docs here — edit ariestools/ariestools-skills`)
  }
  if (!/REDIRECT ONLY/i.test(content)) {
    err(skillMd, null, 'redirect stub SKILL.md must say "REDIRECT ONLY" in the description or body')
  }
  if (!/ariestools\/ariestools-skills/.test(content)) {
    err(skillMd, null, 'redirect stub SKILL.md must point at ariestools/ariestools-skills')
  }
  if (!/status:\s*redirect/.test(content)) {
    err(skillMd, null, 'redirect stub SKILL.md frontmatter must include `status: redirect`')
  }
  if (!/canonical:\s*ariestools\/ariestools-skills/.test(content)) {
    err(skillMd, null, 'redirect stub SKILL.md frontmatter must include `canonical: ariestools/ariestools-skills`')
  }

  for (const fileName of allowlist) {
    if (fileName === 'SKILL.md') continue
    const shimPath = join(dir, fileName)
    let shim
    try {
      shim = readFileSync(shimPath, 'utf8')
    } catch {
      err(shimPath, null, `required redirect shim missing: ${fileName}`)
      continue
    }
    const shimLines = shim.split('\n').length
    if (shimLines > REDIRECT_SHIM_MD_MAX_LINES) {
      err(shimPath, null, `redirect shim ${fileName} is ${shimLines} lines (max ${REDIRECT_SHIM_MD_MAX_LINES}); do not grow docs here`)
    }
    if (!/redirect stub|moved/i.test(shim)) {
      err(shimPath, null, `redirect shim ${fileName} must state it is a redirect / moved`)
    }
    if (!/ariestools\/ariestools-skills/.test(shim)) {
      err(shimPath, null, `redirect shim ${fileName} must point at ariestools/ariestools-skills`)
    }
  }
}

function validateSchemaExamples(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink()) continue // reported by the directory safety check
    if (entry.isDirectory()) {
      validateSchemaExamples(path)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      for (const failure of findSchemaLiteralErrors(readFileSync(path, 'utf8'))) {
        err(path, failure.line, failure.message)
      }
    }
  }
}

function validateSkill(skillsDir, name) {
  const dir = join(skillsDir, name)
  if (!SKILL_DIR_NAME_RE.test(name)) {
    err(dir, null, `skill directory name "${name}" must match ${SKILL_DIR_NAME_RE} (lowercase letters, digits, hyphens; cannot start with a hyphen or dot)`)
    return
  }
  const stat = lstatSync(dir)
  if (stat.isSymbolicLink()) {
    err(dir, null, 'skill directory is a symlink; symlinks are rejected to prevent path escape')
    return
  }
  if (!stat.isDirectory()) {
    err(dir, null, 'expected a directory')
    return
  }
  const symlinkPath = hasSymlinkAnywhere(dir)
  if (symlinkPath) {
    err(symlinkPath, null, 'symlinks are rejected inside skill directories to prevent path escape during sync')
  }
  const skillMd = join(dir, 'SKILL.md')
  let content
  try {
    content = readFileSync(skillMd, 'utf8')
  } catch {
    err(skillMd, null, 'SKILL.md not found')
    return
  }
  const fields = parseFrontmatter(content, skillMd)
  if (!fields) return
  for (const key of REQUIRED_FIELDS) {
    const field = fields[key]
    if (!field) {
      err(skillMd, 1, `frontmatter missing required field: ${key}`)
      continue
    }
    if (typeof field.value !== 'string' || field.value.length === 0) {
      err(skillMd, field.line, `frontmatter field "${key}" must be a non-empty string`)
    }
  }
  const declaredName = fields.name?.value
  if (declaredName && declaredName !== name) {
    err(skillMd, fields.name.line, `frontmatter name "${declaredName}" does not match directory name "${name}"`)
  }

  validateSchemaExamples(dir)

  const allowlist = REDIRECT_STUBS[name]
  if (allowlist) {
    validateRedirectStub(skillsDir, name, allowlist)
  }
}

function main() {
  const skillsDirArg = argv[2]
  if (!skillsDirArg) {
    console.error('usage: node scripts/validate-skills.mjs <skills-dir>')
    exit(2)
  }
  const skillsDir = resolve(skillsDirArg)
  let topStat
  try {
    topStat = statSync(skillsDir)
  } catch {
    err(skillsDir, null, 'skills directory does not exist')
    exit(1)
  }
  if (!topStat.isDirectory()) {
    err(skillsDir, null, 'skills path is not a directory')
    exit(1)
  }
  const entries = readdirSync(skillsDir, { withFileTypes: true })
  const skillDirs = entries
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .map((e) => e.name)
  if (skillDirs.length === 0) {
    err(skillsDir, null, 'skills directory contains no skill subdirectories — refusing to proceed (would wipe target on sync)')
    exit(1)
  }
  for (const name of skillDirs) {
    validateSkill(skillsDir, name)
  }
  if (errorCount > 0) {
    console.error(`\nvalidation failed with ${errorCount} error(s)`)
    exit(1)
  }
  console.log(`validated ${skillDirs.length} skill(s) in ${skillsDir}`)
}

main()
