import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  coinbaseWallet,
  injectedWallet,
  walletConnectWallet,
  rabbyWallet,
  braveWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createConfig, http } from 'wagmi'
import { defineChain } from 'viem'

// ─── HashKey Testnet Chain Definition ──────────────────────────────────────
// Chain ID 133 = HashKey Testnet
// NOTE: https://hashkey.drpc.org is the MAINNET (Chain 177) endpoint.
// The correct testnet RPCs for Chain ID 133 are listed below.
export const hashkeyTestnet = defineChain({
  id: 133,
  name: 'HashKey Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'HashKey',
    symbol: 'HSK',
  },
  rpcUrls: {
    default: {
      http: [
        'https://testnet.hsk.xyz',           // official
        'https://hashkey-testnet.drpc.org',  // drpc fallback
      ],
    },
    public: {
      http: [
        'https://testnet.hsk.xyz',
        'https://hashkey-testnet.drpc.org',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'HashKey Explorer',
      url: 'https://testnet-explorer.hsk.xyz',
      apiUrl: 'https://testnet-explorer.hsk.xyz/api',
    },
  },
  testnet: true,
})

// ─── Wallet connectors ─────────────────────────────────────────────────────
// MetaMask + injected wallets work without a WalletConnect project ID.
// WalletConnect wallet requires VITE_WALLETCONNECT_PROJECT_ID.
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? ''

const walletGroups = [
  {
    groupName: 'Popular',
    wallets: [
      metaMaskWallet,
      injectedWallet,
      coinbaseWallet,
      braveWallet,
      rabbyWallet,
      // Only add WalletConnect if a real project ID is configured
      ...(projectId ? [walletConnectWallet] : []),
    ],
  },
]

const connectors = connectorsForWallets(walletGroups, {
  appName: 'HashKey PayLink',
  projectId: projectId || 'not_configured',
})

// ─── Wagmi Config ──────────────────────────────────────────────────────────
export const wagmiConfig = createConfig({
  chains: [hashkeyTestnet],
  connectors,
  transports: {
    [hashkeyTestnet.id]: http('https://testnet.hsk.xyz'),
  },
})

export const EXPLORER_URL = hashkeyTestnet.blockExplorers.default.url
