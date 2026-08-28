import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { findSchemaLiteralErrors } from './schema-literals.mjs'

test('rejects the two concrete hyphen regressions from the skill examples', () => {
  const source = [
    "const Results = asSchema('com.example.market.results-view', true)",
    "schema: z.literal('com.example.market.results-view'),",
    "Use `asSchema('com.your-org.app.entity', true)`.",
  ].join('\n')

  const errors = findSchemaLiteralErrors(source)

  assert.deepEqual(errors.map(({ line, value }) => ({ line, value })), [
    { line: 1, value: 'com.example.market.results-view' },
    { line: 2, value: 'com.example.market.results-view' },
    { line: 3, value: 'com.your-org.app.entity' },
  ])
})

test('checks JSON properties and makeSchema without requiring one-line calls', () => {
  const source = [
    'makeSchema(',
    '  "com.example.bad_name",',
    ')',
    '{ "schema": "com.example.Caps" }',
    "schema: 'com.example.café'",
    "schema: 'com..example'",
  ].join('\n')

  const errors = findSchemaLiteralErrors(source)

  assert.deepEqual(errors.map(({ line, value }) => ({ line, value })), [
    { line: 1, value: 'com.example.bad_name' },
    { line: 4, value: 'com.example.Caps' },
    { line: 5, value: 'com.example.café' },
    { line: 6, value: 'com..example' },
  ])
})

test('rejects empty names, edge dots, URL punctuation, and whitespace', () => {
  const invalid = ['', '.com.example', 'com.example.', 'com.example/x', 'com.example.%78', 'com.example.x y']

  for (const value of invalid) {
    assert.equal(findSchemaLiteralErrors(`asSchema('${value}', true)`).length, 1, value)
  }
})

test('accepts concrete ASCII names and leaves non-schema version prose alone', () => {
  const source = [
    "asSchema('com.example.sensor2.reading', true)",
    "makeSchema('network.xyo.payload')",
    'schema: z.literal("com.example.market.results")',
    '{ "schema": "com.example.market" }',
    "$schema: 'https://json-schema.org/draft/2020-12/schema'",
    'Do not add `.v2` to a new schema; preserve historical contracts.',
    "const apiVersion = 'google-api.v2'",
    'https://example.com/path-with-hyphens',
  ].join('\n')

  assert.deepEqual(findSchemaLiteralErrors(source), [])
})

test('distinguishes placeholders and syntax from namespace/version semantics', () => {
  const source = [
    "schema: '...'",
    "schema: z.literal('…')",
    "asSchema('local', true)",
    "asSchema('com.example.historical.v1', true)",
    'asSchema(dynamicName, true)',
  ].join('\n')

  // Base syntax permits single segments and suffixes; policy is not inferred.
  assert.deepEqual(findSchemaLiteralErrors(source), [])
})

test('the native skill validator fails on an invalid nested documentation example', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'xyo-schema-skill-'))
  try {
    const skill = join(fixture, 'example-skill')
    mkdirSync(join(skill, 'references'), { recursive: true })
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: example-skill\ndescription: Fixture for schema validation.\n---\n')
    writeFileSync(join(skill, 'references', 'payload.md'), "asSchema('com.example.bad-name', true)\n")

    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('./validate-skills.mjs', import.meta.url)), fixture,
    ], { encoding: 'utf8' })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /payload\.md,line=1::invalid schema literal/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
