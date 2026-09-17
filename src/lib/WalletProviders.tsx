import type { ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi'
import { privyWagmiConfig } from './privyWagmi'

export default function WalletProviders({ children, privy }: { children: ReactNode; privy: boolean }) {
  return privy
    ? <PrivyWagmiProvider config={privyWagmiConfig}>{children}</PrivyWagmiProvider>
    : <WagmiProvider config={privyWagmiConfig}>{children}</WagmiProvider>
}
