import React, { useMemo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth'
import '@fontsource/inter/latin.css'

import './index.css'

import App from './App'
import { privyWagmiConfig } from './lib/privyWagmi'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import { arcChain, baseMainnet } from './lib/chains'
import { arbitrum, polygon } from 'viem/chains'
import { PRIVY_APP_ID, PRIVY_AUTH_ENABLED } from './lib/authMode'
import { PrivyLoginProvider } from './lib/PrivyLoginProvider'

const BRAND_ORIGIN = 'https://hashpaylink.com'

class AppErrorBoundary extends React.Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[hashpaylink:error-boundary]', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 font-inter text-gray-950 dark:bg-[#0f1014] dark:text-white">
        <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#111216]">
          <p className="text-[11px] font-bold uppercase tracking-widest text-red-500">Hash PayLink</p>
          <h1 className="mt-2 text-xl font-black tracking-tight">Something failed to open</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Refresh and try again. If it repeats, send this message to support.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {this.state.error.message}
          </pre>
        </section>
      </main>
    )
  }
}

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
    loginMethods: ['email'],
    allowOAuthInEmbeddedBrowsers: true,
    defaultChain: baseMainnet,
    supportedChains: [baseMainnet, arcChain, arbitrum, polygon],
    embeddedWallets: {
      ethereum: {
        createOnLogin: 'off',
      },
    },
    externalWallets: {
      disableAllExternalWallets: true,
    },
    appearance: {
      theme: theme === 'dark' ? 'dark' : 'light',
      accentColor: '#0071E3',
      logo: new URL('/privy-mark-logo.png', window.location.origin).toString(),
      landingHeader: '\u00A0',
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
      <AppErrorBoundary>
        <AppProviders />
      </AppErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
)
