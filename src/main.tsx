import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider as LegacyWagmiProvider } from 'wagmi'
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, lightTheme, darkTheme } from '@rainbow-me/rainbowkit'
import { PrivyProvider } from '@privy-io/react-auth'

import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

import App from './App'
import { wagmiConfig } from './lib/wagmi'
import { privyWagmiConfig } from './lib/privyWagmi'
import { StarknetProvider } from './lib/StarknetContext'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import { arcChain, hashkeyMainnet } from './lib/chains'
import { baseMainnet, arbitrumMainnet } from './lib/wagmi'
import { PRIVY_APP_ID, PRIVY_AUTH_ENABLED } from './lib/authMode'

const BRAND_ORIGIN = 'https://hashpaylink.com'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
})

const RK_LIGHT = lightTheme({
  accentColor: '#0071E3',
  accentColorForeground: 'white',
  borderRadius: 'large',
  fontStack: 'system',
  overlayBlur: 'small',
})

const RK_DARK = darkTheme({
  accentColor: '#0071E3',
  accentColorForeground: 'white',
  borderRadius: 'large',
  fontStack: 'system',
  overlayBlur: 'small',
})

function RainbowKitThemed({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <RainbowKitProvider theme={theme === 'dark' ? RK_DARK : RK_LIGHT} coolMode>
      {children}
    </RainbowKitProvider>
  )
}

function AppProviders() {
  const { theme } = useTheme()
  const app = (
    <RainbowKitThemed>
      <StarknetProvider>
        <App />
      </StarknetProvider>
    </RainbowKitThemed>
  )

  if (!PRIVY_AUTH_ENABLED) {
    return (
      <LegacyWagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>{app}</QueryClientProvider>
      </LegacyWagmiProvider>
    )
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID!}
      config={{
        loginMethods: ['email', 'wallet'],
        allowOAuthInEmbeddedBrowsers: true,
        defaultChain: baseMainnet,
        supportedChains: [baseMainnet, arcChain, arbitrumMainnet, hashkeyMainnet],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
        appearance: {
          theme: theme === 'dark' ? 'dark' : 'light',
          accentColor: '#0071E3',
          logo: `${BRAND_ORIGIN}${theme === 'dark' ? '/hash-logo-modal-dark.png' : '/hash-logo-modal-light.png'}`,
          landingHeader: 'Hash PayLink',
          loginMessage: 'Staff will never ask for this code.',
          emailDomain: 'Hash PayLink',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={privyWagmiConfig}>{app}</PrivyWagmiProvider>
      </QueryClientProvider>
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
