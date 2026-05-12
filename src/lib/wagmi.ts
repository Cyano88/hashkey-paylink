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
import { base, arbitrum } from 'viem/chains'
import { hashkeyMainnet, arcChain } from './chains'

export { hashkeyMainnet, arcChain, base as baseMainnet, arbitrum as arbitrumMainnet }

// ─── Wallet connectors ─────────────────────────────────────────────────────
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? ''

const walletGroups = [
  {
    groupName: 'Popular',
    wallets: [
      coinbaseWallet, // Coinbase Smart Wallet/Base Account -> sponsored Base path
      metaMaskWallet,
      rabbyWallet,
      injectedWallet,
      braveWallet,
      ...(projectId ? [walletConnectWallet] : []),
    ],
  },
]

const connectors = connectorsForWallets(walletGroups, {
  appName: 'Hash PayLink',
  projectId: projectId || 'not_configured',
})

const RPC_URLS = {
  base:     import.meta.env.VITE_RPC_URL_BASE    ?? import.meta.env.VITE_RPC_URL,
  arc:      import.meta.env.VITE_RPC_URL_ARC     ?? 'https://rpc.testnet.arc.network',
  arbitrum: import.meta.env.VITE_RPC_URL_ARB     ?? 'https://arb1.arbitrum.io/rpc',
  hashkey:  import.meta.env.VITE_RPC_URL_HASHKEY ?? 'https://mainnet.hsk.xyz',
} as const

// ─── Wagmi Config — Base + Arc + Arbitrum + HashKey ──────────────────────────
export const wagmiConfig = createConfig({
  chains: [base, arcChain, arbitrum, hashkeyMainnet],
  connectors,
  transports: {
    [base.id]:           http(RPC_URLS.base),
    [arcChain.id]:       http(RPC_URLS.arc),
    [arbitrum.id]:       http(RPC_URLS.arbitrum),
    [hashkeyMainnet.id]: http(RPC_URLS.hashkey),
  },
})
