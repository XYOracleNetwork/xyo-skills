#!/usr/bin/env node
// Zero-dep validator for Agent Skills frontmatter.
// Usage: node scripts/validate-skills.mjs <skills-dir>
// Exits non-zero on invalid skills, emitting GitHub-style ::error annotations.

import { readdirSync, readFileSync, lstatSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { exit, argv } from 'node:process'

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
