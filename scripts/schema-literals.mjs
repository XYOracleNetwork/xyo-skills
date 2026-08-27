// Keep executable schema examples aligned with SDK payload-model/Schema.ts.
// This checks concrete literals only; namespace ownership and version-suffix
// semantics still require review, and dynamic strings require SDK validation.

const SCHEMA_NAME_RE = /^[a-z0-9]+(?:\.[a-z0-9]+)*$/
const PLACEHOLDERS = new Set(['...', '…'])

export function findSchemaLiteralErrors(source) {
  const patterns = [
    /\b(?:asSchema|makeSchema)\s*\(\s*(['"])([^'"\r\n]*)\1/g,
    /(?<![\w.$])(?:schema|['"]schema['"])\s*:\s*(?:z\.literal\s*\(\s*)?(['"])([^'"\r\n]*)\1/g,
  ]
  const errors = []
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = match[2]
      if (PLACEHOLDERS.has(value)) continue
      if (SCHEMA_NAME_RE.exec(value)?.[0] === value) continue
      const line = source.slice(0, match.index).split('\n').length
      errors.push({
        line,
        value,
        message: `invalid schema literal ${JSON.stringify(value)}; use nonempty ASCII [a-z0-9] segments separated by single dots`,
      })
    }
  }
  return errors.sort((a, b) => a.line - b.line)
}
