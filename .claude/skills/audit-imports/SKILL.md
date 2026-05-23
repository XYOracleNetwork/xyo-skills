---
name: audit-imports
description: Audit import hygiene across the XL1 skill snippets — verify each named import resolves through the referenced barrel, flag deep imports that should use a barrel, surface cross-skill inconsistencies, validate subpath exports, catch unused/missing imports inside snippets, and confirm scaffold parity. Activates when the user wants to check, verify, or audit imports in this repo's skill content.
---

# Audit Imports

Audits every code snippet in the XL1 skills against this repo's import-hygiene rules. **Report-only by default** — only edits files when invoked with `--fix`, and only for the mechanical checks.

## Scope

- `skills/**/*.md` — all skill markdown
- `skills/xl1-scaffold/scripts/scaffold/templates/**` — scaffold templates

Ignore everything else. Do **not** edit application code under `src/`.

## Project rules being checked

- Prefer root-barrel imports for tree shaking. The four root barrels:
  - `@xyo-network/sdk-js`
  - `@xyo-network/xl1-sdk`
  - `@xyo-network/chain-sdk`
  - `@xyo-network/react-chain-client-sdk`
- Fall back to a sub-package only when a symbol is genuinely not re-exported through a barrel (e.g. storage drivers like `StorageArchivist` come from `@xyo-network/archivist-storage`).
- The same symbol should be imported from the same package across all skills.
- Every package referenced in a skill must be installable via the scaffold templates.

## Invocation

`/audit-imports [check] [--fix]`

| Argument | Effect |
|---|---|
| *(none)* | Run all six checks |
| `barrels` | Symbols missing from the named root barrel |
| `inverse` | Sub-package imports that the root barrel already covers |
| `consistency` | Same symbol sourced from different packages across skills |
| `subpaths` | Subpath imports (`pkg/test`) not declared in `exports` |
| `usage` | Unused or apparently-missing imports inside a snippet |
| `scaffold` | Skill-referenced packages that aren't in any scaffold template |
| `--fix` | Apply mechanical edits for `barrels`, `inverse`, and `consistency` only |

## Execution plan

The slow part is fetching package metadata over the network. Cache it once, then run analysis in parallel.

### Phase 1 — Inventory (sequential, local)

Use `Grep` to collect every `import ... from '@xyo-network/...'` line under the scope above. Build:

- `imports[]` — `{ file, line, package, subpath?, symbols: string[], typeOnly: bool }`
- `packages` — the unique set of `@xyo-network/*` packages referenced

For markdown skills, only consider imports that appear inside fenced code blocks (```ts / ```tsx). Ignore imports in prose or comments.

### Phase 2 — Cache barrel exports (parallel agents)

For each unique package in `packages`, spawn an `Explore` agent in parallel (one Agent tool call per package, all in a single message). Each agent:

1. Fetches `https://registry.npmjs.org/<encoded-pkg>/latest` to get the latest version and `exports` field.
2. Fetches the published `index.d.ts` via `https://unpkg.com/<pkg>@<version>/<entry>` (entry comes from the `exports` or `types` field). Falls back to `src/index.ts` from `https://raw.githubusercontent.com/XYOracleNetwork/<repo>/main/...` if unpkg 404s.
3. Parses the `.d.ts` for top-level `export` declarations — both value and type — including `export *` re-exports (recurse one level if needed).
4. Writes `/tmp/xyo-barrel-exports.<package-slug>.json` with shape:
   ```json
   { "package": "@xyo-network/foo", "version": "x.y.z", "exports": { "field": [...], "symbols": ["A", "B"] }, "fetched_at": "ISO-8601" }
   ```
5. If anything fails (404, parse error, private package), writes the same file with `"error": "<reason>"` so the parent doesn't refetch.

Cache files are reused across runs — skip the fetch if `/tmp/xyo-barrel-exports.<slug>.json` exists and is less than 24 h old. Pass an explicit "ignore cache" flag to bust it (`/audit-imports --refresh`).

### Phase 3 — Run checks (parallel agents)

Spawn one `general-purpose` agent per requested check, all in a single message. Each agent reads the cache files from Phase 2 and produces its report section. Checks:

1. **`barrels`** — for each import where the package is one of the four root barrels, verify every named symbol is in that barrel's `symbols` set. Missing symbols → find which sub-package's cache contains the symbol, recommend that.
2. **`inverse`** — for each import where the package is a sub-package, check whether every symbol is also re-exported from one of the four root barrels. If yes, recommend switching.
3. **`consistency`** — build `symbol → set(packages)` across all callsites. Any symbol with `|set| > 1` is a finding. Recommend the preferred source: root barrel if it exports the symbol; otherwise the most-used sub-package.
4. **`subpaths`** — for any import with a subpath, verify the subpath is in the package's `exports` field (from the cached `package.json`). Report undeclared subpaths.
5. **`usage`** — within each fenced code block, parse named imports and check each appears at least once in the rest of the block. Also flag PascalCase identifiers used in the block that look like SDK symbols but aren't imported. Be conservative — only flag obvious cases.
6. **`scaffold`** — read every `templates/*/package.json` under the scaffold templates dir. Confirm each `@xyo-network/*` package referenced in a skill appears as a `dependency` or `peerDependency` in at least one template. Report orphans.

## Output format

```
## Check N: <name>

### Findings (<count>)
- <one-line summary>
  - skills/<file>.md:<line> — `<current>` → `<recommended>`

### Unverified
- <package> — <reason>
```

End with a summary table:

| Check | Files scanned | Findings | Unverified |
|---|---|---|---|
| barrels | … | … | … |
| … | | | |

## `--fix` behavior

If `--fix` is passed, after producing the report apply mechanical edits for checks 1, 2, and 3 only:

- Use `Edit` to rewrite the `from '@xyo-network/...'` portion of the offending import line.
- Never merge two import lines together. Never reorder symbols. Never touch surrounding text.
- Re-run Phase 1's grep after editing and confirm the diff matches the report.

Do not auto-fix `subpaths`, `usage`, or `scaffold` — these are judgment calls (a missing subpath might be a typo or a real bug; an unused import might be intentional in a partial example; a scaffold orphan might mean the skill is wrong or the scaffold needs the dep).

## Notes

- Skip imports with `// audit-imports: ignore` on the same line.
- For type-only imports (`import type { X } from ...`), check the same way — type re-exports must also be present in the barrel.
- If two checks would produce the same edit (e.g. `barrels` and `consistency` both want to move a symbol), `barrels` wins — it's the more specific finding.
