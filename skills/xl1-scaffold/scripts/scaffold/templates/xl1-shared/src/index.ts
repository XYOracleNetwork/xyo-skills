// Shared code for an XL1 monorepo.
//
// Put environment-neutral code here that BOTH `app` (React) and `service`
// (Express) need to agree on:
//   - API request/response types
//   - Zod schemas validated on both sides
//   - Game/business constants (`as const` objects + derived union types;
//     TS `enum` fails typecheck under erasableSyntaxOnly and is lint-flagged)
//   - Branded ID types
//
// Avoid:
//   - React components, hooks, browser globals
//   - Express handlers, Node-only globals (fs, child_process, etc.)
//   - @xyo-network/xl1-react-client-sdk, @xyo-network/xl1-sdk imports — those belong in app/service
//
// Other packages reference this via `"@<scope>/shared": "workspace:*"` in their
// package.json dependencies, then `import { … } from '@<scope>/shared'`.
// They resolve the compiled dist/ (see this package's `exports`), so rebuild
// (`pnpm build:shared` from the workspace root) after changing exports.

export {}
