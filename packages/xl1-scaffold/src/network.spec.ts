import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  describe, expect, it,
} from 'vitest'

import {
  DEFAULT_NETWORK, networkTemplateVars, parseNetwork, renderTemplate, XL1_NETWORKS,
} from './network.js'
import {
  nodeTemplate, reactTemplate, xl1MonorepoTemplate, xl1ServiceTemplate, xl1SharedTemplate,
} from './presets/index.js'

const TEMPLATES_DIR = path.resolve(__dirname, '../templates')
const NETWORK_IDS = Object.keys(XL1_NETWORKS).map(id => parseNetwork(id))

function renderFile(relPath: string, network = DEFAULT_NETWORK): string {
  return renderTemplate(readFileSync(path.join(TEMPLATES_DIR, relPath), 'utf8'), networkTemplateVars(network))
}

describe('--network', () => {
  it('defaults to sequence (testnet), matching xl1-testing', () => {
    expect(DEFAULT_NETWORK).toBe('sequence')
  })

  it('maps each network to the xl1-sdk export of the same DefaultNetworks entry', () => {
    expect(XL1_NETWORKS.mainnet.exportName).toBe('MainNetwork')
    expect(XL1_NETWORKS.sequence.exportName).toBe('SequenceNetwork')
    expect(XL1_NETWORKS.local.exportName).toBe('LocalNetwork')
  })

  it('rejects an unknown network', () => {
    expect(() => parseNetwork('testnet')).toThrow(/Unknown --network: testnet/)
  })
})

describe('renderTemplate', () => {
  it('substitutes every token', () => {
    const out = renderTemplate('import { __XL1_NETWORK__ } // __XL1_NETWORK_ID__ / __XL1_NETWORK_LABEL__', networkTemplateVars('mainnet'))
    expect(out).toBe('import { MainNetwork } // mainnet / XL1 mainnet')
  })

  it('throws on an unknown token instead of shipping it', () => {
    expect(() => renderTemplate('__XL1_TYPO__', networkTemplateVars('local'))).toThrow(/__XL1_TYPO__/)
  })

  it('leaves files without tokens untouched', () => {
    const text = 'export default defineConfig({ test: { globals: true } })\n'
    expect(renderTemplate(text, networkTemplateVars('local'))).toBe(text)
  })
})

describe('network substitution in the shipped templates', () => {
  const allFiles = [nodeTemplate, reactTemplate, xl1MonorepoTemplate, xl1ServiceTemplate, xl1SharedTemplate]
    .flatMap(t => t.files.map(f => f.src))
  const templateFiles = readdirSync(TEMPLATES_DIR, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.relative(TEMPLATES_DIR, path.join(entry.parentPath, entry.name)))

  it('every preset file exists among the templates', () => {
    for (const src of allFiles) expect(templateFiles).toContain(src)
  })

  for (const network of NETWORK_IDS) {
    const { exportName } = XL1_NETWORKS[network]

    it(`leaves no token behind in any template file (${network})`, () => {
      for (const file of templateFiles) expect(renderFile(file, network)).not.toMatch(/__XL1_/)
    })

    it(`points the React GatewayProvider at ${exportName}`, () => {
      const app = renderFile('react/src/App.tsx', network)
      expect(app).toContain(`import { ${exportName} } from '@xyo-network/xl1-sdk'`)
      expect(app).toContain(`const NETWORK = ${exportName}`)
      expect(app).toContain('<GatewayProvider gatewayName={NETWORK.id}>')
    })

    it(`wires ${exportName} into the node and xl1-service entries`, () => {
      for (const file of ['node/src/index.ts', 'xl1-service/src/index.ts']) {
        const src = renderFile(file, network)
        expect(src).toContain(`import { ${exportName} } from '@xyo-network/xl1-sdk'`)
        expect(src).toContain(`const NETWORK = ${exportName}`)
      }
    })

    it(`names the network in every .env.example (${network})`, () => {
      const envExamples = templateFiles.filter(f => f.endsWith('_env.example'))
      expect(envExamples.length).toBeGreaterThan(0)
      for (const file of envExamples) expect(renderFile(file, network)).toContain(`--network=${network}`)
    })
  }

  // Regression: the templates used to hard-wire MainNetwork whatever the
  // prompt asked for.
  it('hard-wires no network constant in any template source', () => {
    for (const file of templateFiles) {
      const raw = readFileSync(path.join(TEMPLATES_DIR, file), 'utf8')
      expect(raw).not.toMatch(/\b(?:Main|Sequence|Local)Network\b/)
    }
  })
})
