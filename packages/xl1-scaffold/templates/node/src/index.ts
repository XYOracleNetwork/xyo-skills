import 'dotenv/config'

import { __XL1_NETWORK__ } from '@xyo-network/xl1-sdk'

// The __XL1_NETWORK_LABEL__ — chosen with `--network=__XL1_NETWORK_ID__` when this
// project was scaffolded (also recorded as `xl1.network` in package.json).
// Gateways, signers' funds and INDEXER_FLOOR_BLOCK are all per network.
const NETWORK = __XL1_NETWORK__

console.log('Hello world')
console.log(`XL1 network: ${NETWORK.name} (${NETWORK.id}) at ${NETWORK.url}`)
