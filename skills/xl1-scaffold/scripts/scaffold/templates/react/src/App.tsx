import { ConnectAccountsStack } from '@xyo-network/xl1-react-client-sdk'
import { useState } from 'react'

export function App() {
  const [address, setAddress] = useState<string | undefined>()

  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>XL1 dApp</h1>
      <ConnectAccountsStack onAccountConnected={setAddress} />
      {address ? <p>{`Connected account: ${address}`}</p> : null}
    </main>
  )
}
