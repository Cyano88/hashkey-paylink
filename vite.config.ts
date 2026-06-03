import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
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
})
