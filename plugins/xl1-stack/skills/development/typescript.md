# TypeScript Conventions

## Strictness Posture

We are strict and opinionated. Most opinions are enforced via ESLint. The conventions below cover what linters can't catch — judgment calls that require understanding intent.

## The `any` Policy: Exhaust Alternatives First

`any` is a last resort. It should be so painful to use that you investigate and implement alternatives before reaching for it.

When you encounter a situation where `any` seems necessary, work through this ladder:

1. **`unknown`** — the type-safe top type. Use it when you don't know the shape yet and will narrow later.
2. **Generics / type parameters** — if the type varies by call site, parameterize it.
3. **Type assertions (`as Type`)** — for narrowing when you know more than the compiler. Prefer `as` over `any`.
4. **Overloads** — for functions with genuinely different input/output type combinations.
5. **Only then: `any`** — with a `// TODO: [reason alternatives don't work]` comment explaining the constraint.

If `any` starts propagating to other types (infecting inferred types downstream), that is a strong signal to reconsider. `any` should be contained, never contagious.

Never use `any` for convenience, speed, or to silence a type error you don't understand. Understand the error first.

## Return Types: Prefer Inference

Let TypeScript's type inference do its job. Inferred return types often produce better covariance and contravariance than manually annotated ones.

**Do not annotate return types** unless one of these applies:
- It's a public API boundary where the contract must be explicit
- The inferred type is unexpectedly wide or complex
- A type guard is needed (the `is` return type)
- The function is recursive and inference can't resolve it

## Interfaces vs Types

**Prefer `interface`** over `type` for object shapes.

Use `type` only when `interface` can't express it:
- Union types: `type Result = Success | Failure`
- Intersection types: `type Combined = A & B`
- Mapped or conditional types
- Aliasing primitives or tuples: `type ID = string`

Rationale: interfaces are extendable via declaration merging, produce clearer error messages, and are more idiomatic for describing object shapes.

## Readonly

Use `readonly` where it **communicates intent** — it signals that a value shouldn't be mutated after creation.

This is not a blanket rule. Apply it when it makes contracts clearer:
- Function parameters that shouldn't be modified by the callee
- Class properties set in the constructor that shouldn't change
- Array/object parameters where mutation would be a bug

Don't add `readonly` reflexively to everything — use it where it tells the reader something meaningful.

## ESM Only

Always use ES modules. No CommonJS.

- Use `import` / `export` — never `require()` or `module.exports`
- Set `"type": "module"` in `package.json`
- Use `.js` extensions in relative import paths (TypeScript resolves `.ts` → `.js`)

## Imports: Root Barrel Packages and Tree Shaking

**Import from the root barrel package of each monorepo.** Each SDK monorepo publishes a single root package that re-exports everything. Tree shaking eliminates what you don't use.

```ts
// Good — root barrel import, tree shaking handles the rest
import { Payload, PayloadBuilder, Account, BoundWitnessBuilder } from '@xyo-network/sdk-js'

// Avoid — importing from sub-packages
import { Payload } from '@xyo-network/payload-model'
import { PayloadBuilder } from '@xyo-network/payload-builder'
import { Account } from '@xyo-network/account'
```

This is simpler, more maintainable, and the bundler eliminates unused exports. See the XYO and XL1 knowledge skills for the specific root barrel packages.

**Import ordering:**
- External packages first, then internal modules, separated by a blank line

## Other Conventions

- **Prefer union types** over enums: `type Status = 'active' | 'inactive'` rather than `enum Status { Active, Inactive }`
- **Naming**: PascalCase for types and interfaces, camelCase for variables and functions
- **Null handling**: prefer optional chaining (`?.`) and nullish coalescing (`??`) over manual null checks
