import type { Xl1NetworkId } from './network.js'
import type { Template } from './template.js'

// `@xyo-network/sdk` declares engines `node: ^26` and `@xyo-network/xl1-sdk`
// `>=26`. Written into every generated package.json — workspace members
// included, because neither npm nor pnpm inherits `engines` from the
// workspace root, and a member is what a host (Vercel, a container build)
// actually runs.
export const NODE_ENGINE_RANGE = '>=26'

export interface BuildPackageJsonArgs {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  name: string
  // Recorded as `xl1.network` on a standalone project or workspace root, so
  // later workspace-member scaffolds (and agents) can read which network the
  // project targets. Members inherit it and do not repeat it.
  network: Xl1NetworkId
  packageManager: string
  template: Template
  workspaceMember: boolean
}

export function buildPackageJson(args: BuildPackageJsonArgs): Record<string, unknown> {
  // Workspace members inherit packageManager from the root — emitting it here
  // would cause pnpm-version drift between root and members.
  return {
    name: args.name,
    version: '0.1.0',
    private: true,
    type: 'module',
    ...args.template.packageJson,
    ...(args.workspaceMember ? {} : { packageManager: args.packageManager }),
    engines: { node: NODE_ENGINE_RANGE },
    ...(args.workspaceMember ? {} : { xl1: { network: args.network } }),
    scripts: args.template.scripts,
    dependencies: args.dependencies,
    devDependencies: args.devDependencies,
  }
}
