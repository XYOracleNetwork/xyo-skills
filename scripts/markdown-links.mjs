// Pure Markdown helpers for the skill link checker: GitHub heading slugs,
// code masking, and link / heading extraction. Zero-dep and fs-free so the
// validator stays runnable on a bare Node install and every rule is unit-tested.
//
// Masking replaces code with spaces instead of deleting it, so line numbers in
// the masked text still match the source file.

// github-slugger strips everything that is not a letter, mark, number,
// connector punctuation (`_`), hyphen, or space, then turns spaces into `-`.
// Consecutive hyphens are kept (`Identity & Wallets` → `identity--wallets`).
const SLUG_STRIP_RE = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu

export function slugify(text) {
  return text.toLowerCase().replace(SLUG_STRIP_RE, '').replaceAll(' ', '-')
}

/**
 * Returns a stateful slug function with GitHub's duplicate handling: the second
 * `## Notes` becomes `notes-1`, the third `notes-2`. Use one per document.
 */
export function createSlugger() {
  const occurrences = new Map()
  return function slug(text) {
    const base = slugify(text)
    let result = base
    while (occurrences.has(result)) {
      const next = occurrences.get(base) + 1
      occurrences.set(base, next)
      result = `${base}-${next}`
    }
    occurrences.set(result, 0)
    return result
  }
}

function blank(text) {
  return text.replace(/[^\n]/g, ' ')
}

const FENCE_OPEN_RE = /^[ \t]*(`{3,}|~{3,})(.*)$/
const FENCE_CLOSE_RE = /^[ \t]*(`{3,}|~{3,})[ \t\r]*$/

/** Blanks fenced code blocks (``` or ~~~, any indentation, unclosed runs to EOF). */
export function maskFencedCode(source) {
  const lines = source.split('\n')
  let fence = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (fence) {
      const close = FENCE_CLOSE_RE.exec(line)
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null
      lines[i] = blank(line)
      continue
    }
    const open = FENCE_OPEN_RE.exec(line)
    // A backtick fence's info string cannot contain backticks (CommonMark 4.5).
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = open[1]
      lines[i] = blank(line)
    }
  }
  return lines.join('\n')
}

/**
 * Blanks inline code spans. A run of N backticks opens a span that closes at
 * the next run of exactly N backticks; an opener with no closer is literal.
 * Spans never cross a blank line (paragraph boundary). A backslash escapes the
 * first backtick of an opener only; inside a span backslashes are literal.
 */
export function maskCodeSpans(text) {
  const runs = [...text.matchAll(/`+/g)].map((match) => ({
    index: match.index,
    length: match[0].length,
    isEscaped: match.index > 0 && text[match.index - 1] === '\\',
  }))
  let out = ''
  let cursor = 0
  for (let i = 0; i < runs.length; i++) {
    let { index, length } = runs[i]
    if (index < cursor) continue
    if (runs[i].isEscaped) {
      index++
      length--
    }
    if (length === 0) continue
    const closeIdx = runs.findIndex((run, j) => j > i && run.length === length)
    if (closeIdx === -1) continue
    const close = runs[closeIdx]
    if (/\n[ \t\r]*\n/.test(text.slice(index + length, close.index))) continue
    const end = close.index + close.length
    out += text.slice(cursor, index) + blank(text.slice(index, end))
    cursor = end
    i = closeIdx
  }
  return out + text.slice(cursor)
}

/** Blanks `<!-- … -->` comments, which GitHub does not render. */
export function maskHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, blank)
}

/** Blanks everything that is not rendered prose: fences, code spans, comments. */
export function maskCode(source) {
  return maskHtmlComments(maskCodeSpans(maskFencedCode(source)))
}

/** Index of the closing `---` of a leading YAML frontmatter block, or -1. */
export function frontmatterEnd(lines) {
  if (lines[0]?.trimEnd() !== '---') return -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') return i
  }
  return -1
}

function lineAt(text, index) {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++
  }
  return line
}

// `](dest)` / `](dest "title")` / `](<dest with spaces>)`. Destinations may hold
// one level of balanced parentheses, as CommonMark allows.
const INLINE_LINK_RE = /\]\(\s*(<[^<>\n]*>|[^\s()<>]*(?:\([^\s()]*\)[^\s()<>]*)*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*\)/g
// `[label]: dest` reference definitions (footnotes `[^1]:` excluded).
const REFERENCE_DEF_RE = /^ {0,3}\[(?!\^)[^\]\n]+\]:[ \t]*(<[^<>\n]*>|\S+)/gm

/**
 * Link destinations in already-masked Markdown, with 1-based line numbers.
 * Pass the output of `maskCode` so links inside code are never reported.
 */
export function extractLinks(masked) {
  const links = []
  for (const re of [INLINE_LINK_RE, REFERENCE_DEF_RE]) {
    for (const match of masked.matchAll(re)) {
      const raw = match[1]
      const target = raw.startsWith('<') ? raw.slice(1, -1) : raw
      links.push({ target, line: lineAt(masked, match.index) })
    }
  }
  return links.sort((a, b) => a.line - b.line)
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Splits a link destination into `{ kind, path, anchor }`. `kind` is
 * `external` (any URL scheme or `//host`), `empty`, `absolute` (`/path`), or
 * `relative`. `path` is '' for a same-file `#anchor` link; `anchor` is null
 * when the destination has no fragment.
 */
export function parseLinkTarget(target) {
  if (target === '') return { kind: 'empty', path: '', anchor: null }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) {
    return { kind: 'external', path: target, anchor: null }
  }
  const hashIdx = target.indexOf('#')
  const beforeHash = hashIdx === -1 ? target : target.slice(0, hashIdx)
  const anchor = hashIdx === -1 ? null : safeDecode(target.slice(hashIdx + 1))
  const path = safeDecode(beforeHash.split('?')[0])
  if (path.startsWith('/')) return { kind: 'absolute', path, anchor }
  return { kind: 'relative', path, anchor }
}

const ATX_HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t\r]*$/

/**
 * Plain text GitHub derives a heading's anchor from: code spans keep their
 * literal content; links and images keep their text; HTML tags, entities, and
 * emphasis markers are dropped.
 */
export function headingText(raw) {
  const content = raw.replace(/(?:^|[ \t]+)#+[ \t]*$/, '')
  const parts = content.split(/(`+)([\s\S]*?)\1/)
  let text = ''
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i]
    // split() with two capture groups yields [prose, ticks, code, prose, …].
    if (i % 3 === 2) {
      text += segment.trim()
      continue
    }
    if (i % 3 === 1) continue
    text += segment
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi, '')
      .replace(/(^|[^\p{L}\p{N}])_+(?=\S)/gu, '$1')
      .replace(/(?<=\S)_+(?=$|[^\p{L}\p{N}])/gu, '')
  }
  return text.trim()
}

/**
 * ATX headings outside frontmatter and fenced code, each with its GitHub slug.
 * Returns `[{ level, text, slug, line }]` in document order.
 */
export function extractHeadings(source) {
  const lines = maskFencedCode(source).split('\n')
  const start = frontmatterEnd(lines) + 1
  const slug = createSlugger()
  const headings = []
  for (let i = start; i < lines.length; i++) {
    const match = ATX_HEADING_RE.exec(lines[i])
    if (!match) continue
    const text = headingText(match[2] ?? '')
    headings.push({ level: match[1].length, text, slug: slug(text), line: i + 1 })
  }
  return headings
}

/** Every fragment a link may target in this document: heading slugs plus HTML ids. */
export function extractAnchors(source) {
  const anchors = new Set(extractHeadings(source).map((h) => h.slug))
  for (const match of maskCode(source).matchAll(/<a\s[^>]*\b(?:id|name)\s*=\s*["']([^"']+)["']/gi)) {
    anchors.add(match[1])
  }
  return anchors
}
