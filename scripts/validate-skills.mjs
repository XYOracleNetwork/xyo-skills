#!/usr/bin/env node
// Zero-dep validator for Agent Skills frontmatter, concrete schema examples,
// relative links / anchors, and the skill-stack layering rules.
// Usage: node scripts/validate-skills.mjs <skills-dir>
// Exits non-zero on invalid skills, emitting GitHub-style ::error annotations.
// Upward cross-layer links are reported as a non-fatal ::warning summary.

import { existsSync, readdirSync, readFileSync, lstatSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { cwd, exit, argv } from 'node:process'

import { extractAnchors, extractLinks, maskCode, parseLinkTarget } from './markdown-links.mjs'
import { findSchemaLiteralErrors } from './schema-literals.mjs'
import {
  BUILDS_ON_PREFIX,
  HANDS_OFF_PREFIX,
  SKILL_LAYERS_HEADING,
  checkLayerBullet,
  isRedirectStub,
  linkDirection,
  parseLayer,
  parseMetadata,
  parseSkillLayersSection,
} from './skill-layers.mjs'

const SKILL_DIR_NAME_RE = /^[a-z0-9][a-z0-9-]*$/
const REQUIRED_FIELDS = ['name', 'description']
const ARIESTOOLS_SKILLS_URL = 'https://github.com/ariestools/ariestools-skills'

let errorCount = 0
const errorsByRule = new Map()

function displayPath(file) {
  const rel = relative(cwd(), file)
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : file
}

function err(file, line, msg, rule = 'skill-structure') {
  const loc = line ? `file=${displayPath(file)},line=${line}` : `file=${displayPath(file)}`
  console.error(`::error ${loc}::${msg}`)
  errorCount++
  errorsByRule.set(rule, (errorsByRule.get(rule) ?? 0) + 1)
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
      err(full, null, `redirect stub "${name}" must not contain nested dirs or symlinks`, 'redirect-stub')
      continue
    }
    if (!allowlist.has(entry.name)) {
      err(full, null, `redirect stub "${name}" may only contain ${[...allowlist].join(', ')}; remove "${entry.name}" (canonical docs live in ariestools/ariestools-skills)`, 'redirect-stub')
    }
  }

  const skillMd = join(dir, 'SKILL.md')
  let content
  try {
    content = readFileSync(skillMd, 'utf8')
  } catch {
    err(skillMd, null, 'SKILL.md not found', 'redirect-stub')
    return
  }

  const lineCount = content.split('\n').length
  if (lineCount > REDIRECT_SKILL_MD_MAX_LINES) {
    err(skillMd, null, `redirect stub SKILL.md is ${lineCount} lines (max ${REDIRECT_SKILL_MD_MAX_LINES}); do not grow docs here — edit ariestools/ariestools-skills`, 'redirect-stub')
  }
  if (!/REDIRECT ONLY/i.test(content)) {
    err(skillMd, null, 'redirect stub SKILL.md must say "REDIRECT ONLY" in the description or body', 'redirect-stub')
  }
  if (!/ariestools\/ariestools-skills/.test(content)) {
    err(skillMd, null, 'redirect stub SKILL.md must point at ariestools/ariestools-skills', 'redirect-stub')
  }
  if (!/status:\s*redirect/.test(content)) {
    err(skillMd, null, 'redirect stub SKILL.md frontmatter must include `status: redirect`', 'redirect-stub')
  }
  if (!/canonical:\s*ariestools\/ariestools-skills/.test(content)) {
    err(skillMd, null, 'redirect stub SKILL.md frontmatter must include `canonical: ariestools/ariestools-skills`', 'redirect-stub')
  }

  for (const fileName of allowlist) {
    if (fileName === 'SKILL.md') continue
    const shimPath = join(dir, fileName)
    let shim
    try {
      shim = readFileSync(shimPath, 'utf8')
    } catch {
      err(shimPath, null, `required redirect shim missing: ${fileName}`, 'redirect-stub')
      continue
    }
    const shimLines = shim.split('\n').length
    if (shimLines > REDIRECT_SHIM_MD_MAX_LINES) {
      err(shimPath, null, `redirect shim ${fileName} is ${shimLines} lines (max ${REDIRECT_SHIM_MD_MAX_LINES}); do not grow docs here`, 'redirect-stub')
    }
    if (!/redirect stub|moved/i.test(shim)) {
      err(shimPath, null, `redirect shim ${fileName} must state it is a redirect / moved`, 'redirect-stub')
    }
    if (!/ariestools\/ariestools-skills/.test(shim)) {
      err(shimPath, null, `redirect shim ${fileName} must point at ariestools/ariestools-skills`, 'redirect-stub')
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
        err(path, failure.line, failure.message, 'schema-literal')
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

  const metadata = parseMetadata(content)
  return {
    name,
    dir,
    skillMd,
    content,
    metadata,
    isStub: Boolean(allowlist) || isRedirectStub(metadata),
    layer: null,
    section: null,
  }
}

/**
 * Layer rules: every SKILL.md declares a unique integer `metadata.layer`;
 * every non-stub router has a `## Skill layers` section whose "Builds on"
 * bullet links only lower-layer routers and whose "Hands off to" bullet links
 * only higher-layer routers.
 */
function validateLayers(skills) {
  const byLayer = new Map()
  for (const skill of skills.values()) {
    const { layer, line, error } = parseLayer(skill.metadata)
    if (error) {
      err(skill.skillMd, line ?? 1, error, 'layer-metadata')
      continue
    }
    if (byLayer.has(layer)) {
      err(skill.skillMd, line, `layer ${layer} is already declared by ${byLayer.get(layer)}; layers must be unique`, 'layer-metadata')
      continue
    }
    byLayer.set(layer, skill.name)
    skill.layer = layer
  }

  const layerOf = (name) => skills.get(name)?.layer ?? undefined
  for (const skill of skills.values()) {
    if (skill.isStub) continue
    const section = parseSkillLayersSection(skill.content)
    if (!section) {
      err(skill.skillMd, null, `router is missing a \`${SKILL_LAYERS_HEADING}\` section with "${BUILDS_ON_PREFIX}" and "${HANDS_OFF_PREFIX}" bullets`, 'layer-section')
      continue
    }
    skill.section = section
    for (const [kind, prefix] of [['buildsOn', BUILDS_ON_PREFIX], ['handsOffTo', HANDS_OFF_PREFIX]]) {
      const bullet = section[kind]
      if (!bullet) {
        err(skill.skillMd, section.line, `\`${SKILL_LAYERS_HEADING}\` has no bullet starting "${prefix}"`, 'layer-section')
        continue
      }
      if (skill.layer === null) continue // layer-metadata error already reported
      for (const failure of checkLayerBullet({ kind, bullet, ownLayer: skill.layer, layerOf })) {
        err(skill.skillMd, failure.line, failure.message, 'layer-direction')
      }
    }
  }
}

/** Markdown files under a skill, skipping its generated `scripts/` tree and symlinks. */
function listMarkdown(dir, isSkillRoot = true) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (isSkillRoot && entry.name === 'scripts') continue
      files.push(...listMarkdown(path, false))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path)
    }
  }
  return files
}

/**
 * Relative-link rules over every skills/<skill>/**.md (except scripts/):
 * targets must exist inside skills/, `#anchors` must match a GitHub heading
 * slug, and non-stub files must not link into a redirect stub. Returns upward
 * cross-layer link counts keyed by "from→to" for the drift summary.
 */
function validateLinks(skillsDir, skills) {
  const anchorCache = new Map()
  const anchorsOf = (file) => {
    if (!anchorCache.has(file)) anchorCache.set(file, extractAnchors(readFileSync(file, 'utf8')))
    return anchorCache.get(file)
  }
  const upward = new Map()

  for (const from of skills.values()) {
    for (const file of listMarkdown(from.dir)) {
      const content = readFileSync(file, 'utf8')
      const section = file === from.skillMd ? from.section : null
      for (const link of extractLinks(maskCode(content))) {
        const parsed = parseLinkTarget(link.target)
        if (parsed.kind === 'external') continue
        if (parsed.kind === 'empty') {
          err(file, link.line, 'empty link destination `]()`', 'link-target')
          continue
        }
        if (parsed.kind === 'absolute') {
          err(file, link.line, `absolute link ${JSON.stringify(link.target)}; use a path relative to this file (absolute paths break in installed copies)`, 'link-target')
          continue
        }
        const target = parsed.path === '' ? file : resolve(dirname(file), parsed.path)
        const relToSkills = relative(skillsDir, target)
        if (relToSkills.startsWith('..') || isAbsolute(relToSkills)) {
          err(file, link.line, `link ${JSON.stringify(link.target)} leaves skills/; installed copies (Skills.sh, plugins) contain only skills/, so link a URL instead`, 'link-target')
          continue
        }
        const toName = relToSkills.split(sep)[0]
        const to = skills.get(toName)
        if (!from.isStub && to?.isStub && to !== from) {
          err(file, link.line, `link ${JSON.stringify(link.target)} points into redirect stub ${toName}/, which the plugins do not ship; link ${ARIESTOOLS_SKILLS_URL} instead`, 'stub-link')
          continue
        }
        if (!existsSync(target)) {
          err(file, link.line, `broken link ${JSON.stringify(link.target)}: ${displayPath(target)} does not exist`, 'link-target')
          continue
        }
        if (parsed.anchor && target.endsWith('.md') && statSync(target).isFile() && !anchorsOf(target).has(parsed.anchor)) {
          err(file, link.line, `broken anchor ${JSON.stringify(link.target)}: no heading in ${displayPath(target)} has the slug "${parsed.anchor}"`, 'link-anchor')
        }
        if (from.isStub || !to || to === from || to.isStub || from.layer === null || to.layer === null) continue
        if (section && link.line >= section.line && link.line < section.endLine) continue
        if (linkDirection(from.layer, to.layer) !== 'up') continue
        const key = `${from.name}→${to.name}`
        const edge = upward.get(key) ?? { from, to, count: 0, files: new Map() }
        edge.count++
        const fileName = basename(file)
        edge.files.set(fileName, (edge.files.get(fileName) ?? 0) + 1)
        upward.set(key, edge)
      }
    }
  }
  return upward
}

function reportUpwardLinks(upward) {
  if (upward.size === 0) return
  const edges = [...upward.values()].sort((a, b) => a.from.layer - b.from.layer || a.to.layer - b.to.layer)
  const total = edges.reduce((sum, edge) => sum + edge.count, 0)
  console.log(`::warning::${total} upward relative link(s) across ${edges.length} skill edge(s): lower layers should hand off, not depend on higher ones (non-fatal; table below)`)
  const rows = edges.map((edge) => [
    `${edge.from.name} (L${edge.from.layer})`,
    `${edge.to.name} (L${edge.to.layer})`,
    String(edge.count),
    [...edge.files].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name}×${n}`).join(', '),
  ])
  const header = ['from', 'to', 'links', 'files']
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)))
  const format = (row) => row.map((cell, i) => (i === 2 ? cell.padStart(widths[i]) : cell.padEnd(widths[i]))).join('  ').trimEnd()
  console.log(`\nUpward links by edge (body text; ${SKILL_LAYERS_HEADING} sections excluded):`)
  console.log(`  ${format(header)}`)
  for (const row of rows) console.log(`  ${format(row)}`)
  console.log('')
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
    .sort()
  if (skillDirs.length === 0) {
    err(skillsDir, null, 'skills directory contains no skill subdirectories — refusing to proceed (would wipe target on sync)')
    exit(1)
  }
  const skills = new Map()
  for (const name of skillDirs) {
    const skill = validateSkill(skillsDir, name)
    if (skill) skills.set(name, skill)
  }
  validateLayers(skills)
  reportUpwardLinks(validateLinks(skillsDir, skills))
  if (errorCount > 0) {
    const byRule = [...errorsByRule].map(([rule, n]) => `${rule}: ${n}`).join(', ')
    console.error(`\nvalidation failed with ${errorCount} error(s) — ${byRule}`)
    exit(1)
  }
  console.log(`validated ${skillDirs.length} skill(s) in ${skillsDir}`)
}

main()
