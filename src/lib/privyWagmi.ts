import { createConfig } from '@privy-io/wagmi'
import { backendEvmTransport } from './backendEvmTransport'
import { injected } from 'wagmi/connectors'
import { base, arbitrum, polygon } from 'viem/chains'
import { arcChain } from './chains'

export const privyWagmiConfig = createConfig({
  chains: [base, arcChain, arbitrum, polygon],
  batch: { multicall: false },
  pollingInterval: 15_000,
  connectors: [injected()],
  transports: {
    [base.id]:           backendEvmTransport('base'),
    [arcChain.id]:       backendEvmTransport('arc'),
    [arbitrum.id]:       backendEvmTransport('arbitrum'),
    [polygon.id]:        backendEvmTransport('polygon'),
  },
})
