import AppErrorBoundary from './components/AppErrorBoundary'
import React, { lazy, Suspense, useMemo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'

import './index.css'
// Console forms must be styled before any lazy surface or shared chunk renders.
import './developer/developer.css'

import { ThemeProvider, useTheme } from './lib/ThemeContext'
import DeveloperLoadingSkeleton from './components/DeveloperLoadingSkeleton'
import { arcChain, baseMainnet } from './lib/chains'
import { arbitrum, polygon } from 'viem/chains'
import { pocketXLayer } from './pocket/lib/pocketXStocksWallet'
import { PRIVY_APP_ID, PRIVY_AUTH_ENABLED } from './lib/authMode'
import { PrivyLoginProvider } from './lib/PrivyLoginProvider'
import { isPocketNativeRuntime, pocketRuntimeOrigin } from './pocket/lib/pocketRoutes'
import { installPocketNativeFetch } from './pocket/lib/pocketNativeFetch'

import { resolveAppSurface } from './lib/appSurface'

const WalletProviders = lazy(() => import('./lib/WalletProviders'))

const BRAND_ORIGIN = 'https://hashpaylink.com'
if (isPocketNativeRuntime()) document.documentElement.dataset.pocketRuntime = 'native'
installPocketNativeFetch()
const surface = resolveAppSurface(window.location.hostname, isPocketNativeRuntime())
// Apply before React mounts so checkout cannot flash the stored or system dark theme.
if (surface === 'checkout') {
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = 'only light'
}
const rootAppModule = surface === 'pocket' ? import('./pocket/PocketHostApp')
  : surface === 'checkout' ? import('./surfaces/CheckoutApp')
  : surface === 'admin' ? import('./surfaces/AdminApp')
  : surface === 'developer' ? import('./surfaces/DeveloperApp')
  : surface === 'docs' ? import('./surfaces/DocsApp')
  : import('./App')
const RootApp = lazy(() => rootAppModule)

function AppBootFallback() {
  if (surface === 'developer' || surface === 'admin') return <DeveloperLoadingSkeleton fullPage />
  if (isPocketNativeRuntime()) {
    return <main aria-label="Opening Pocket" className="min-h-screen bg-[#F5F5F7]" />
  }
  return <main aria-label="Opening app" className="min-h-screen bg-[#F5F5F7] dark:bg-[#0A0A0A]" />
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
    supportedChains: [baseMainnet, arcChain, arbitrum, polygon, pocketXLayer],
    embeddedWallets: {
      ethereum: {
        createOnLogin: 'off',
      },
    },
    externalWallets: {
      disableAllExternalWallets: surface !== 'developer',
    },
    appearance: {
      theme: theme === 'dark' ? 'dark' : 'light',
      accentColor: '#0071E3',
      logo: new URL('/privy-mark-logo.png', pocketRuntimeOrigin()).toString(),
      landingHeader: '\u00A0',
      loginMessage: 'Staff will never ask for this code.',
      emailDomain: 'Hash PayLink',
    },
    legal: {
      termsAndConditionsUrl: `${BRAND_ORIGIN}/docs/terms`,
      privacyPolicyUrl: `${BRAND_ORIGIN}/docs/privacy`,
    },
  }), [theme])

  const app = <Suspense fallback={<AppBootFallback />}><RootApp /></Suspense>

  // Public documentation has no wallet or authenticated API dependencies.
  if (surface === 'docs') return app

  if (surface === 'developer' || surface === 'admin') return <PrivyProvider appId={PRIVY_APP_ID!} config={privyConfig}>
    <PrivyLoginProvider><QueryClientProvider client={queryClient}>{app}</QueryClientProvider></PrivyLoginProvider>
  </PrivyProvider>

  const walletApp = <Suspense fallback={<AppBootFallback />}><WalletProviders privy={PRIVY_AUTH_ENABLED}>{app}</WalletProviders></Suspense>
  if (!PRIVY_AUTH_ENABLED) return <QueryClientProvider client={queryClient}>{walletApp}</QueryClientProvider>

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID!}
      config={privyConfig}
    >
      <PrivyLoginProvider>
        <QueryClientProvider client={queryClient}>
          {walletApp}
        </QueryClientProvider>
      </PrivyLoginProvider>
    </PrivyProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider forcedTheme={surface === 'checkout' ? 'light' : undefined}>
      <AppErrorBoundary checkout={surface === 'checkout'}>
        <AppProviders />
      </AppErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
)
