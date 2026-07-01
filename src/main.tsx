import React, { useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth'

import './index.css'

import App from './App'
import { privyWagmiConfig } from './lib/privyWagmi'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import { arcChain, baseMainnet } from './lib/chains'
import { arbitrum } from 'viem/chains'
import { PRIVY_APP_ID, PRIVY_AUTH_ENABLED } from './lib/authMode'
import { PrivyLoginProvider } from './lib/PrivyLoginProvider'

const BRAND_ORIGIN = 'https://hashpaylink.com'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
})

function AppProviders() {
  const { theme } = useTheme()
  const privyConfig = useMemo<PrivyClientConfig>(() => ({
    loginMethods: ['email', 'wallet'],
    allowOAuthInEmbeddedBrowsers: true,
    defaultChain: baseMainnet,
    supportedChains: [baseMainnet, arcChain, arbitrum],
    embeddedWallets: {
      ethereum: {
        createOnLogin: 'off',
      },
    },
    appearance: {
      theme: theme === 'dark' ? 'dark' : 'light',
      accentColor: '#0071E3',
      logo: `${BRAND_ORIGIN}/privy-mark-logo.png`,
      landingHeader: 'Hash PayLink',
      loginMessage: 'Staff will never ask for this code.',
      emailDomain: 'Hash PayLink',
    },
    legal: {
      termsAndConditionsUrl: `${BRAND_ORIGIN}/docs/terms`,
      privacyPolicyUrl: `${BRAND_ORIGIN}/docs/privacy`,
    },
  }), [theme])

  const app = <App />

  if (!PRIVY_AUTH_ENABLED) {
    return (
      <WagmiProvider config={privyWagmiConfig}>
        <QueryClientProvider client={queryClient}>{app}</QueryClientProvider>
      </WagmiProvider>
    )
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID!}
      config={privyConfig}
    >
      <PrivyLoginProvider>
        <QueryClientProvider client={queryClient}>
          <PrivyWagmiProvider config={privyWagmiConfig}>{app}</PrivyWagmiProvider>
        </QueryClientProvider>
      </PrivyLoginProvider>
    </PrivyProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppProviders />
    </ThemeProvider>
  </React.StrictMode>,
)
