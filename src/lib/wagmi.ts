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

// ─── Wagmi Config — Base + Arc + Arbitrum + HashKey ──────────────────────────
export const wagmiConfig = createConfig({
  chains: [base, arcChain, arbitrum, hashkeyMainnet],
  connectors,
  transports: {
    [base.id]:           http(),
    [arcChain.id]:       http('https://rpc.testnet.arc.network'),
    [arbitrum.id]:       http('https://arb1.arbitrum.io/rpc'),
    [hashkeyMainnet.id]: http('https://mainnet.hsk.xyz'),
  },
})
