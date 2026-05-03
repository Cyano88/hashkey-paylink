import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, lightTheme, darkTheme } from '@rainbow-me/rainbowkit'

import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

import App from './App'
import { wagmiConfig } from './lib/wagmi'
import { StarknetProvider } from './lib/StarknetContext'
import { ThemeProvider, useTheme } from './lib/ThemeContext'

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitThemed>
            <StarknetProvider>
              <App />
            </StarknetProvider>
          </RainbowKitThemed>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
