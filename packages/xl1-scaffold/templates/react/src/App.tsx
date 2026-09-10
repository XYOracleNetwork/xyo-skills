import { ConnectAccountsStack, GatewayProvider, InPageGatewaysProvider } from '@xyo-network/xl1-react-client-sdk'
import { MainNetwork } from '@xyo-network/xl1-sdk'
import { useState } from 'react'

export function App() {
  const [address, setAddress] = useState<string | undefined>()

  // transport="rest" is the XL1 best practice: in-page reads come from the
  // network's cacheable static bucket layout instead of one live gateway call
  // per read. The prop still defaults to 'rpc', so it must be set explicitly.
  // Writes are unaffected — mempool submission still goes over the RPC url.
  return (
    <InPageGatewaysProvider transport="rest">
      <GatewayProvider gatewayName={MainNetwork.id}>
        <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
          <h1>XL1 dApp</h1>
          <ConnectAccountsStack onAccountConnected={setAddress} />
          {address ? <p>{`Connected account: ${address}`}</p> : null}
        </main>
      </GatewayProvider>
    </InPageGatewaysProvider>
  )
}
