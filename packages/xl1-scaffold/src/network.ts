// The XL1 network a generated project's gateway points at, chosen with
// `--network`. Each maps to a NetworkBootstrap constant that
// `@xyo-network/xl1-sdk` re-exports from `@xyo-network/xl1-protocol`
// (the entries of `DefaultNetworks`).
export const XL1_NETWORKS = {
  mainnet: { exportName: 'MainNetwork', label: 'XL1 mainnet' },
  sequence: { exportName: 'SequenceNetwork', label: 'Sequence (XL1 testnet)' },
  local: { exportName: 'LocalNetwork', label: 'local XL1 devnet (http://localhost:8080)' },
} as const

export type Xl1NetworkId = keyof typeof XL1_NETWORKS

// Testnet by default, matching xl1-testing's "Sequence unless told otherwise".
export const DEFAULT_NETWORK: Xl1NetworkId = 'sequence'

export function isXl1NetworkId(value: unknown): value is Xl1NetworkId {
  return typeof value === 'string' && Object.hasOwn(XL1_NETWORKS, value)
}

export function parseNetwork(value: string): Xl1NetworkId {
  if (!isXl1NetworkId(value)) {
    throw new Error(`Unknown --network: ${value}. Available: ${Object.keys(XL1_NETWORKS).join(', ')}`)
  }
  return value
}

// Tokens a template file may contain. Each is a valid identifier, so a
// template source stays parseable TS/TSX in an editor.
//   __XL1_NETWORK__        export name, e.g. SequenceNetwork
//   __XL1_NETWORK_ID__     network id, e.g. sequence
//   __XL1_NETWORK_LABEL__  human-readable name for comments
export function networkTemplateVars(network: Xl1NetworkId): Record<string, string> {
  const { exportName, label } = XL1_NETWORKS[network]
  return {
    __XL1_NETWORK__: exportName,
    __XL1_NETWORK_ID__: network,
    __XL1_NETWORK_LABEL__: label,
  }
}

const TOKEN = /__XL1_[A-Z_]+__/g

// Replaces every known token. Throws on a token without a value so a typo in
// a template fails the scaffold instead of shipping a broken file.
export function renderTemplate(contents: string, vars: Record<string, string>): string {
  return contents.replaceAll(TOKEN, (token) => {
    const value = vars[token]
    if (value === undefined) throw new Error(`template token ${token} has no value`)
    return value
  })
}
