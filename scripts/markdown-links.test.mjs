import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createSlugger,
  extractAnchors,
  extractHeadings,
  extractLinks,
  headingText,
  maskCode,
  maskCodeSpans,
  maskFencedCode,
  parseLinkTarget,
  slugify,
} from './markdown-links.mjs'

test('slugify follows GitHub rules: lowercase, strip punctuation but - and _, spaces to -', () => {
  assert.equal(slugify('Definition of Done'), 'definition-of-done')
  assert.equal(slugify('Identity & Wallets'), 'identity--wallets')
  assert.equal(slugify('Chain Data Indexing — Protocol'), 'chain-data-indexing--protocol')
  assert.equal(slugify('Browser ↔ Service Wiring'), 'browser--service-wiring')
  assert.equal(slugify('Auto-sign (xyoSigner_sign)'), 'auto-sign-xyosigner_sign')
  assert.equal(slugify('xl1.dapp.json vs. xl1.deploy.json?'), 'xl1dappjson-vs-xl1deployjson')
  assert.equal(slugify('Step 1: Café'), 'step-1-café')
})

test('createSlugger suffixes duplicates -1, -2 and keeps counting past collisions', () => {
  const slug = createSlugger()
  assert.deepEqual(
    ['Notes', 'Notes', 'Notes', 'Notes 1', 'Notes-1'].map((text) => slug(text)),
    ['notes', 'notes-1', 'notes-2', 'notes-1-1', 'notes-1-2'],
  )
  assert.equal(createSlugger()('Notes'), 'notes', 'each slugger starts fresh')
})

test('headingText keeps code literally and drops link URLs, tags, and closing hashes', () => {
  assert.equal(headingText('[Browser UX](browser-ux.md)'), 'Browser UX')
  assert.equal(headingText('Headless verification → moved to [xl1-testing](../xl1-testing/SKILL.md)'), 'Headless verification → moved to xl1-testing')
  assert.equal(headingText('Auto-sign (`xyoSigner_sign`)'), 'Auto-sign (xyoSigner_sign)')
  assert.equal(headingText('Use `@<scope>/shared` <em>first</em>'), 'Use @<scope>/shared first')
  assert.equal(headingText('Closing hashes ##'), 'Closing hashes')
  assert.equal(headingText('C# stays'), 'C# stays')
  assert.equal(headingText('__Bold__ and snake_case'), 'Bold and snake_case')
})

test('extractHeadings ignores frontmatter, fenced code, and #hashtags', () => {
  const source = [
    '---',
    '# not a heading: yaml comment',
    'name: x',
    '---',
    '# Title',
    '```sh',
    '# shell comment',
    '```',
    '#hashtag',
    '## Title',
    '   ### Indented ok',
  ].join('\n')
  assert.deepEqual(extractHeadings(source).map(({ level, slug, line }) => ({ level, slug, line })), [
    { level: 1, slug: 'title', line: 5 },
    { level: 2, slug: 'title-1', line: 10 },
    { level: 3, slug: 'indented-ok', line: 11 },
  ])
})

test('extractAnchors includes explicit HTML ids', () => {
  const anchors = extractAnchors('# Top\n<a id="custom-anchor"></a>\n')
  assert.ok(anchors.has('top'))
  assert.ok(anchors.has('custom-anchor'))
})

test('maskFencedCode blanks ``` and ~~~ blocks, honours fence length, and preserves lines', () => {
  const source = ['a', '````md', '```', '[x](inner.md)', '```', '````', '~~~', '[y](tilde.md)', '~~~', 'b'].join('\n')
  const masked = maskFencedCode(source)
  assert.equal(masked.split('\n').length, source.split('\n').length)
  assert.equal(masked.length, source.length)
  assert.doesNotMatch(masked, /inner|tilde/)
  assert.match(masked, /^a\n[\s\S]*\nb$/)
})

test('maskCodeSpans blanks matched spans of equal length and leaves unmatched ticks literal', () => {
  assert.equal(maskCodeSpans('see `a](b)` and [c](d.md)'), `see ${' '.repeat(7)} and [c](d.md)`)
  assert.equal(maskCodeSpans('``has ` inside`` x'), `${' '.repeat(16)} x`)
  assert.equal(maskCodeSpans('lone ` tick [c](d.md)'), 'lone ` tick [c](d.md)')
  assert.equal(maskCodeSpans('para `one\n\ntwo` [c](d.md)'), 'para `one\n\ntwo` [c](d.md)', 'spans do not cross blank lines')
  assert.equal(maskCodeSpans('\\`not code` [c](d.md)'), '\\`not code` [c](d.md)', 'escaped opener is literal')
})

test('the dapp-checklist grep regex in a code span is not reported as a link', () => {
  const line = "- [ ] `grep -rE \"from ['\\\"](ethers|viem|web3|@ethersproject|@walletconnect)\" src/` returns nothing. See [gate](SKILL.md)."
  assert.deepEqual(extractLinks(maskCode(line)).map((l) => l.target), ['SKILL.md'])
})

test('extractLinks finds inline links, titles, angle brackets, and reference definitions', () => {
  const source = [
    '[a](a.md) and ![img](img/x.png "title")',
    '[b](<path with spaces.md>) [c](c.md#frag)',
    '[d]: d.md',
    '[^1]: footnote, not a link',
    '<!-- [hidden](hidden.md) -->',
  ].join('\n')
  assert.deepEqual(extractLinks(maskCode(source)), [
    { target: 'a.md', line: 1 },
    { target: 'img/x.png', line: 1 },
    { target: 'path with spaces.md', line: 2 },
    { target: 'c.md#frag', line: 2 },
    { target: 'd.md', line: 3 },
  ])
})

test('parseLinkTarget classifies and decodes destinations', () => {
  assert.deepEqual(parseLinkTarget('https://github.com/x'), { kind: 'external', path: 'https://github.com/x', anchor: null })
  assert.equal(parseLinkTarget('mailto:a@b.c').kind, 'external')
  assert.equal(parseLinkTarget('//cdn.example/x').kind, 'external')
  assert.deepEqual(parseLinkTarget(''), { kind: 'empty', path: '', anchor: null })
  assert.deepEqual(parseLinkTarget('#same-file'), { kind: 'relative', path: '', anchor: 'same-file' })
  assert.deepEqual(parseLinkTarget('../x/SKILL.md#a%20b'), { kind: 'relative', path: '../x/SKILL.md', anchor: 'a b' })
  assert.deepEqual(parseLinkTarget('file%20name.md?plain=1'), { kind: 'relative', path: 'file name.md', anchor: null })
  assert.equal(parseLinkTarget('/skills/x.md').kind, 'absolute')
})
