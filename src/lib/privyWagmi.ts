import { createConfig } from '@privy-io/wagmi'
import { http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { base, arbitrum, polygon } from 'viem/chains'
import { arcChain } from './chains'

const RPC_URLS = {
  base:     import.meta.env.VITE_RPC_URL_BASE    ?? import.meta.env.VITE_RPC_URL,
  arc:      import.meta.env.VITE_RPC_URL_ARC     ?? 'https://rpc.testnet.arc.network',
  arbitrum: import.meta.env.VITE_RPC_URL_ARB     ?? 'https://arb1.arbitrum.io/rpc',
  polygon:  import.meta.env.VITE_RPC_URL_POLYGON ?? 'https://polygon-rpc.com',
} as const

export const privyWagmiConfig = createConfig({
  chains: [base, arcChain, arbitrum, polygon],
  connectors: [injected()],
  transports: {
    [base.id]:           http(RPC_URLS.base),
    [arcChain.id]:       http(RPC_URLS.arc),
    [arbitrum.id]:       http(RPC_URLS.arbitrum),
    [polygon.id]:        http(RPC_URLS.polygon),
  },
})
