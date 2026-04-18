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
import { base } from 'viem/chains'
import { hashkeyMainnet, arcChain } from './chains'

export { hashkeyMainnet, arcChain, base as baseMainnet }

// ─── Wallet connectors ─────────────────────────────────────────────────────
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? ''

const walletGroups = [
  {
    groupName: 'Popular',
    wallets: [
      metaMaskWallet,
      injectedWallet,
      coinbaseWallet, // Coinbase Smart Wallet → handles EIP-7702 delegation
      braveWallet,
      rabbyWallet,
      ...(projectId ? [walletConnectWallet] : []),
    ],
  },
]

const connectors = connectorsForWallets(walletGroups, {
  appName: 'Hash PayLink',
  projectId: projectId || 'not_configured',
})

// ─── Wagmi Config — Base + HashKey + Arc ────────────────────────────────────
export const wagmiConfig = createConfig({
  chains: [base, hashkeyMainnet, arcChain],
  connectors,
  transports: {
    [base.id]:          http(),
    [hashkeyMainnet.id]: http('https://mainnet.hsk.xyz'),
    [arcChain.id]:       http('https://rpc.testnet.arc.network'),
  },
})
