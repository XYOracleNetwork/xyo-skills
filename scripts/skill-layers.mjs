// Skill-stack layering rules, shared by validate-skills.mjs and the
// marketplace renderers. Pure string logic — callers do the file I/O.
//
// Each SKILL.md declares `metadata.layer: <n>`. Lower layers are foundations;
// higher layers compose them. Every non-stub router carries a `## Skill layers`
// section whose `- **Builds on:**` bullet links only lower-layer routers and
// whose `- **Hands off to:**` bullet links only higher-layer routers.

import { extractLinks, frontmatterEnd, maskCode, maskFencedCode, parseLinkTarget } from './markdown-links.mjs'

export const SKILL_LAYERS_HEADING = '## Skill layers'
export const BUILDS_ON_PREFIX = '- **Builds on:**'
export const HANDS_OFF_PREFIX = '- **Hands off to:**'

const SKILL_NAME_RE = '[a-z0-9][a-z0-9-]*'
const ROUTER_LINK_RE = new RegExp(`^\\.\\./(${SKILL_NAME_RE})/SKILL\\.md$`)

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

/**
 * Direct children of the top-level `metadata:` mapping in a SKILL.md
 * frontmatter, as `{ key: { value, line } }`. Trailing `# comments` are
 * dropped and quotes removed; deeper nesting is ignored.
 */
export function parseMetadata(content) {
  const lines = content.split('\n')
  const end = frontmatterEnd(lines)
  const metadata = {}
  if (end === -1) return metadata
  let inMetadata = false
  let childIndent = null
  for (let i = 1; i < end; i++) {
    const line = lines[i].replace(/\r$/, '')
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const indent = line.length - line.trimStart().length
    if (indent === 0) {
      inMetadata = /^metadata\s*:\s*(?:#.*)?$/.test(line)
      childIndent = null
      continue
    }
    if (!inMetadata) continue
    childIndent ??= indent
    if (indent !== childIndent) continue
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/)
    if (!match) continue
    const value = unquote(match[2].replace(/\s+#.*$/, '').trim())
    metadata[match[1]] = { value, line: i + 1 }
  }
  return metadata
}

/**
 * A redirect stub is a skill whose canonical copy lives elsewhere. Stubs ship
 * to Skills.sh only — the Claude and Codex renderers drop them — and no other
 * skill may link into them.
 */
export function isRedirectStub(metadata) {
  return metadata.status?.value === 'redirect' || metadata.internal?.value === 'true'
}

/** `{ layer, line, error }` for `metadata.layer`; `layer` is null on error. */
export function parseLayer(metadata) {
  const field = metadata.layer
  if (!field) return { layer: null, line: null, error: 'frontmatter `metadata.layer` is missing' }
  if (!/^\d+$/.test(field.value)) {
    return { layer: null, line: field.line, error: `frontmatter \`metadata.layer\` must be a positive integer, got ${JSON.stringify(field.value)}` }
  }
  return { layer: Number(field.value), line: field.line, error: null }
}

/** 'down' (toward foundations — allowed), 'same', or 'up' (drift). */
export function linkDirection(fromLayer, toLayer) {
  if (toLayer < fromLayer) return 'down'
  if (toLayer > fromLayer) return 'up'
  return 'same'
}

/** Skill name if `path` is a sibling router link (`../<skill>/SKILL.md`), else null. */
export function routerTarget(path) {
  return ROUTER_LINK_RE.exec(path)?.[1] ?? null
}

function isBulletStart(line) {
  return /^\s*(?:[-*+]|\d+[.)])\s/.test(line)
}

function collectBullet(lines, start, end) {
  let stop = start + 1
  while (stop < end) {
    const line = lines[stop]
    if (line.trim() === '' || isBulletStart(line) || /^ {0,3}#/.test(line)) break
    stop++
  }
  return { line: start + 1, text: lines.slice(start, stop).join('\n') }
}

/**
 * Locates the `## Skill layers` section of a router. Returns null when absent,
 * otherwise `{ line, endLine, buildsOn, handsOffTo }` where each bullet is
 * `{ line, text }` (continuation lines included) or null when missing.
 * `line`/`endLine` are 1-based and the range [line, endLine) covers the section.
 */
export function parseSkillLayersSection(content) {
  const lines = maskFencedCode(content).split('\n')
  const startIdx = lines.findIndex((line) => line.trimEnd() === SKILL_LAYERS_HEADING)
  if (startIdx === -1) return null
  let endIdx = startIdx + 1
  while (endIdx < lines.length && !/^ {0,3}#{1,2}(?:[ \t]|$)/.test(lines[endIdx])) endIdx++
  const section = { line: startIdx + 1, endLine: endIdx + 1, buildsOn: null, handsOffTo: null }
  for (let i = startIdx + 1; i < endIdx; i++) {
    if (!section.buildsOn && lines[i].startsWith(BUILDS_ON_PREFIX)) {
      section.buildsOn = collectBullet(lines, i, endIdx)
    } else if (!section.handsOffTo && lines[i].startsWith(HANDS_OFF_PREFIX)) {
      section.handsOffTo = collectBullet(lines, i, endIdx)
    }
  }
  return section
}

/**
 * Checks one layer bullet. `kind` is 'buildsOn' (links must go down) or
 * 'handsOffTo' (links must go up). `layerOf(skillName)` returns a layer number
 * or undefined. Returns `[{ line, message }]` with file line numbers (offset
 * by `bullet.line`); an empty array means valid.
 */
export function checkLayerBullet({ kind, bullet, ownLayer, layerOf }) {
  const label = kind === 'buildsOn' ? 'Builds on' : 'Hands off to'
  const want = kind === 'buildsOn' ? 'down' : 'up'
  const errors = []
  const masked = maskCode(bullet.text)
  const links = extractLinks(masked).map((link) => ({
    ...link,
    line: bullet.line + link.line - 1,
    parsed: parseLinkTarget(link.target),
  }))
  const relative = links.filter((link) => link.parsed.kind === 'relative')
  for (const link of relative) {
    const skill = routerTarget(link.parsed.path)
    if (!skill) {
      errors.push({ line: link.line, message: `"${label}" may only link sibling routers (../<skill>/SKILL.md); found ${JSON.stringify(link.target)}` })
      continue
    }
    const targetLayer = layerOf(skill)
    // Unknown skill or unparseable layer: the link / layer-metadata checks
    // report the root cause on the target, so don't double-report it here.
    if (targetLayer === undefined) continue
    const direction = linkDirection(ownLayer, targetLayer)
    if (direction !== want) {
      const rule = want === 'down' ? 'a strictly lower' : 'a strictly higher'
      errors.push({ line: link.line, message: `"${label}" must link ${rule} layer, but ${skill} is layer ${targetLayer} and this skill is layer ${ownLayer}` })
    }
  }
  const body = masked.slice(masked.indexOf(':**') + 3).trim()
  if (kind === 'buildsOn' && links.length === 0) {
    errors.push({ line: bullet.line, message: '"Builds on" must link at least one lower-layer router (or the ariestools-skills URL for layers 1–2)' })
  }
  if (kind === 'handsOffTo' && relative.length === 0 && !/^none\b/i.test(body)) {
    errors.push({ line: bullet.line, message: '"Hands off to" must link at least one higher-layer router, or say "none" at the top of the stack' })
  }
  return errors
}
