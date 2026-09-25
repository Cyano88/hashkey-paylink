import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig(({ mode }) => {
  if (mode === 'pocket-native') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
    if (!env.VITE_PRIVY_APP_ID?.trim() || !env.VITE_AUTH_BRIDGE?.trim() || env.VITE_AUTH_BRIDGE === 'legacy' || !env.VITE_CIRCLE_USER_WALLET_APP_ID?.trim()) {
      throw new Error('Pocket native build requires production Privy/Circle public configuration. Run npm run build:pocket-mobile.')
    }
  }
  return {
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  plugins: [
    react(),
    nodePolyfills({
      // Polyfill Buffer, process, etc. used by WalletConnect / MetaMask SDK
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  }
})
