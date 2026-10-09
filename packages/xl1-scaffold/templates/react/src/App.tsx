import type { XyoAddress } from '@xyo-network/sdk'
import {
  ConnectAccountsStack, GatewayProvider, InPageGatewaysProvider,
} from '@xyo-network/xl1-react-client-sdk'
import { __XL1_NETWORK__ } from '@xyo-network/xl1-sdk'
import { useCallback, useState } from 'react'

// The __XL1_NETWORK_LABEL__ — chosen with `--network=__XL1_NETWORK_ID__` when this
// project was scaffolded (also recorded as `xl1.network` in package.json —
// the workspace root's, in a monorepo). GatewayProvider selects the wallet/in-page gateway for this
// network id. Change networks here and in the service together; the indexer
// floor block (VITE_INDEXER_FLOOR_BLOCK) is per network too.
const NETWORK = __XL1_NETWORK__

export function App() {
  // The account this dApp acts as, chosen from the accounts the wallet grants.
  const [address, setAddress] = useState<XyoAddress | undefined>()

  // onAccountsChanged reports every account the wallet lets this site use after
  // each grant read that changes them, including [] when access is revoked.
  // Keep the chosen account while it is still granted; otherwise fall back to
  // the first one, or clear it. (onAccountConnected is a compatibility prop: it
  // reports only the first account and never fires on revoke, so an address
  // lifted through it goes stale.)
  const onAccountsChanged = useCallback((accounts: readonly XyoAddress[]) => {
    setAddress(current => (current !== undefined && accounts.includes(current) ? current : accounts[0]))
  }, [])

  // transport="rest" is the XL1 best practice: in-page reads come from the
  // network's cacheable static bucket layout instead of one live gateway call
  // per read. The prop still defaults to 'rpc', so it must be set explicitly.
  // Writes are unaffected — mempool submission still goes over the RPC URL.
  return (
    <InPageGatewaysProvider transport="rest">
      <GatewayProvider gatewayName={NETWORK.id}>
        <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
          <h1>XL1 dApp</h1>
          {/* Renders the connect prompt and the granted account itself — restyle it
              through its slot props (AccountComponent, ConnectComponent, …). */}
          <ConnectAccountsStack onAccountsChanged={onAccountsChanged} />
          {/* Pass `address` to wallet-gated components; gate writes on it plus a
              write-capable runner ('addPayloadsToChain' in defaultGateway). */}
          <p>{address === undefined ? 'Connect your XL1 wallet to unlock wallet-gated actions.' : 'Wallet-gated actions are available.'}</p>
        </main>
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
