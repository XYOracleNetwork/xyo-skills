import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  checkLayerBullet,
  isRedirectStub,
  linkDirection,
  parseLayer,
  parseMetadata,
  parseSkillLayersSection,
  routerTarget,
} from './skill-layers.mjs'

const LAYERS = { 'base': 3, 'mid': 4, 'top': 5 }
const layerOf = (name) => LAYERS[name]

function skillMd({ name, layer, extra = '', body = '' }) {
  return [
    '---',
    `name: ${name}`,
    `description: Fixture skill ${name}.`,
    'metadata:',
    '  version: 1.0.0 # x-release-please-version',
    ...(layer === undefined ? [] : [`  layer: ${layer}`]),
    ...(extra ? [extra] : []),
    '---',
    '',
    `# ${name}`,
    '',
    body,
  ].join('\n')
}

test('parseMetadata reads direct metadata children, dropping comments and quotes', () => {
  const metadata = parseMetadata(skillMd({ name: 'x', layer: 4, extra: "  status: 'redirect'\n  internal: true\n  nested:\n    deep: ignored" }))
  assert.equal(metadata.version.value, '1.0.0')
  assert.deepEqual(metadata.layer, { value: '4', line: 6 })
  assert.equal(metadata.status.value, 'redirect')
  assert.equal(metadata.internal.value, 'true')
  assert.equal(metadata.deep, undefined)
  assert.deepEqual(parseMetadata('no frontmatter'), {})
})

test('isRedirectStub accepts status: redirect or internal: true', () => {
  assert.equal(isRedirectStub(parseMetadata(skillMd({ name: 'a', extra: '  status: redirect' }))), true)
  assert.equal(isRedirectStub(parseMetadata(skillMd({ name: 'a', extra: '  internal: true' }))), true)
  assert.equal(isRedirectStub(parseMetadata(skillMd({ name: 'a', layer: 3 }))), false)
})

test('parseLayer requires a positive integer', () => {
  assert.deepEqual(parseLayer(parseMetadata(skillMd({ name: 'a', layer: 7 }))), { layer: 7, line: 6, error: null })
  assert.match(parseLayer(parseMetadata(skillMd({ name: 'a' }))).error, /missing/)
  assert.match(parseLayer(parseMetadata(skillMd({ name: 'a', layer: '4.5' }))).error, /positive integer/)
  assert.match(parseLayer(parseMetadata(skillMd({ name: 'a', layer: 'five' }))).error, /positive integer/)
})

test('linkDirection and routerTarget', () => {
  assert.equal(linkDirection(5, 4), 'down')
  assert.equal(linkDirection(5, 7), 'up')
  assert.equal(linkDirection(5, 5), 'same')
  assert.equal(routerTarget('../xl1-patterns/SKILL.md'), 'xl1-patterns')
  assert.equal(routerTarget('../xl1-patterns/commit-reveal.md'), null)
  assert.equal(routerTarget('SKILL.md'), null)
})

test('parseSkillLayersSection finds both bullets, continuation lines, and the section range', () => {
  const content = skillMd({
    name: 'mid',
    layer: 4,
    body: [
      '## Skill layers',
      '',
      'Intro text.',
      '',
      '- **Builds on:** [base](../base/SKILL.md) (3)',
      '  continued [more](../base/SKILL.md)',
      '- **Hands off to:** [top](../top/SKILL.md) (5)',
      '',
      '### Sub-heading stays inside',
      '',
      '## Next section',
      '[top](../top/SKILL.md)',
    ].join('\n'),
  })
  const section = parseSkillLayersSection(content)
  assert.equal(section.line, 11)
  assert.equal(section.endLine, 21)
  assert.equal(section.buildsOn.line, 15)
  assert.match(section.buildsOn.text, /continued/)
  assert.equal(section.handsOffTo.line, 17)
  assert.doesNotMatch(section.handsOffTo.text, /Sub-heading/)
  assert.equal(parseSkillLayersSection(skillMd({ name: 'x', body: '## Skill Layers\n' })), null, 'heading match is exact')
  assert.equal(parseSkillLayersSection(skillMd({ name: 'x', body: '```md\n## Skill layers\n```\n' })), null, 'fenced headings do not count')
})

test('Builds on must point strictly down; Hands off to strictly up', () => {
  const check = (kind, ownLayer, text) => checkLayerBullet({ kind, bullet: { line: 10, text }, ownLayer, layerOf })
  assert.deepEqual(check('buildsOn', 4, '- **Builds on:** [base](../base/SKILL.md) (3)'), [])
  assert.deepEqual(check('handsOffTo', 4, '- **Hands off to:** [top](../top/SKILL.md) (5)'), [])

  const upInBuildsOn = check('buildsOn', 4, '- **Builds on:** [base](../base/SKILL.md),\n  [top](../top/SKILL.md)')
  assert.equal(upInBuildsOn.length, 1)
  assert.equal(upInBuildsOn[0].line, 11)
  assert.match(upInBuildsOn[0].message, /strictly lower layer, but top is layer 5/)

  const downInHandsOff = check('handsOffTo', 4, '- **Hands off to:** [base](../base/SKILL.md)')
  assert.match(downInHandsOff[0].message, /strictly higher layer, but base is layer 3/)

  const selfLink = check('buildsOn', 4, '- **Builds on:** [mid](../mid/SKILL.md)')
  assert.match(selfLink[0].message, /strictly lower/)
})

test('layer bullets accept only router links, URLs for layers 1–2, and "none" at the top', () => {
  const check = (kind, ownLayer, text) => checkLayerBullet({ kind, bullet: { line: 1, text }, ownLayer, layerOf })
  assert.match(check('buildsOn', 4, '- **Builds on:** [gateway](../base/gateway.md)')[0].message, /only link sibling routers/)
  assert.deepEqual(check('buildsOn', 3, '- **Builds on:** `xy-toolchain` from [ariestools-skills](https://github.com/ariestools/ariestools-skills) (1–2)'), [])
  assert.match(check('buildsOn', 3, '- **Builds on:** nothing linked')[0].message, /at least one/)
  assert.deepEqual(check('handsOffTo', 5, '- **Hands off to:** none — the top of the stack'), [])
  assert.match(check('handsOffTo', 4, '- **Hands off to:** later layers')[0].message, /say "none"/)
  assert.deepEqual(check('handsOffTo', 4, '- **Hands off to:** [ghost](../ghost/SKILL.md)'), [], 'unknown skills are reported by the link check instead')
  assert.deepEqual(check('handsOffTo', 4, '- **Hands off to:** `[top](../top/SKILL.md)` [top](../top/SKILL.md)'), [], 'code spans are ignored')
})

function writeSkill(root, name, files) {
  mkdirSync(join(root, name), { recursive: true })
  for (const [file, content] of Object.entries(files)) writeFileSync(join(root, name, file), content)
}

function runValidator(root) {
  return spawnSync(process.execPath, [fileURLToPath(new URL('./validate-skills.mjs', import.meta.url)), root], { encoding: 'utf8' })
}

function layered(name, layer, buildsOn, handsOffTo, body = '') {
  return skillMd({ name, layer, body: `## Skill layers\n\n- **Builds on:** ${buildsOn}\n- **Hands off to:** ${handsOffTo}\n\n## Use\n\n${body}\n` })
}

test('validate-skills passes a well-layered fixture and fails each rule category', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'xyo-layer-skill-'))
  try {
    const good = join(fixture, 'good')
    writeSkill(good, 'stub', { 'SKILL.md': skillMd({ name: 'stub', layer: 1, extra: '  status: redirect\n  internal: true' }) })
    writeSkill(good, 'base', {
      'SKILL.md': layered('base', 3, '[ariestools-skills](https://github.com/ariestools/ariestools-skills)', '[mid](../mid/SKILL.md)'),
      'topic.md': '# Topic\n\n## Duplicate\n\n## Duplicate\n\nSee [mid gateway](../mid/gateway.md#rest-roots) and [self](#duplicate-1).\n',
    })
    writeSkill(good, 'mid', {
      'SKILL.md': layered('mid', 4, '[base](../base/SKILL.md)', 'none'),
      'gateway.md': '# Gateway\n\n## REST roots\n\n`[not](../stub/SKILL.md)` is code.\n',
    })
    const pass = runValidator(good)
    assert.equal(pass.status, 0, pass.stderr)
    assert.match(pass.stdout, /::warning::1 upward relative link/)
    assert.match(pass.stdout, /base \(L3\)\s+mid \(L4\)\s+1\s+topic\.md×1/)

    const bad = join(fixture, 'bad')
    cpSync(good, bad, { recursive: true })
    writeFileSync(join(bad, 'base', 'topic.md'), [
      '# Topic',
      '[missing](nope.md)',
      '[anchor](../mid/gateway.md#rest-root)',
      '[stub](../stub/SKILL.md)',
    ].join('\n'))
    const baseMd = readFileSync(join(bad, 'base', 'SKILL.md'), 'utf8')
    writeFileSync(join(bad, 'base', 'SKILL.md'), baseMd.replace('## Skill layers', '## Layers'))
    writeFileSync(join(bad, 'mid', 'SKILL.md'), layered('mid', 4, '[base](../base/SKILL.md)', '[base](../base/SKILL.md)'))
    writeSkill(bad, 'dup', { 'SKILL.md': layered('dup', 3, '[base](../base/SKILL.md)', 'none') })
    const fail = runValidator(bad)
    assert.equal(fail.status, 1)
    assert.match(fail.stderr, /topic\.md,line=2::broken link "nope\.md"/)
    assert.match(fail.stderr, /topic\.md,line=3::broken anchor "\.\.\/mid\/gateway\.md#rest-root"/)
    assert.match(fail.stderr, /topic\.md,line=4::link "\.\.\/stub\/SKILL\.md" points into redirect stub stub\//)
    assert.match(fail.stderr, /dup\/SKILL\.md,line=6::layer 3 is already declared by base/)
    assert.match(fail.stderr, /base\/SKILL\.md::router is missing a `## Skill layers` section/)
    assert.match(fail.stderr, /mid\/SKILL\.md,line=14::"Hands off to" must link a strictly higher layer, but base is layer 3/)
    for (const rule of ['link-target: 1', 'link-anchor: 1', 'stub-link: 1', 'layer-metadata: 1', 'layer-section: 1', 'layer-direction: 1']) {
      assert.ok(fail.stderr.includes(rule), `summary should count ${rule}:\n${fail.stderr}`)
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
