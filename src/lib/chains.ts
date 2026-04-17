import { defineChain } from 'viem'
import { base } from 'viem/chains'

export type ChainKey = 'base' | 'starknet' | 'hashkey'

// ─── HashKey Mainnet (Chain 177) ────────────────────────────────────────────
export const hashkeyMainnet = defineChain({
  id: 177,
  name: 'HashKey Chain',
  nativeCurrency: { decimals: 18, name: 'HashKey', symbol: 'HSK' },
  rpcUrls: {
    default: { http: ['https://mainnet.hsk.xyz'] },
    public: { http: ['https://mainnet.hsk.xyz'] },
  },
  blockExplorers: {
    default: {
      name: 'HashKey Explorer',
      url: 'https://explorer.hsk.xyz',
      apiUrl: 'https://explorer.hsk.xyz/api',
    },
  },
})

export { base as baseMainnet }

// ─── Per-chain metadata ──────────────────────────────────────────────────────
export const CHAIN_META = {
  base: {
    key: 'base' as const,
    label: 'Base',
    asset: 'USDC',
    decimals: 6,
    chainId: base.id, // 8453
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    explorerUrl: 'https://basescan.org',
    explorerName: 'Basescan',
    // Glow: Blue
    glowStyle: '0 0 52px -8px rgba(0,82,255,0.25), 0 0 0 1px rgba(0,82,255,0.12)',
    accentColor: '#0052FF',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
    toggleActive: 'bg-[#0052FF] text-white shadow-sm',
    headerBg: 'from-blue-50 to-sky-50',
    dotColor: 'bg-blue-500',
    engineLabel: 'EIP-7702 · Gas Sponsored',
  },
  starknet: {
    key: 'starknet' as const,
    label: 'Starknet',
    asset: 'USDC',
    decimals: 6,
    // Native USDC on Starknet Mainnet (Circle)
    tokenAddress: '0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb',
    explorerUrl: 'https://starkscan.co',
    explorerName: 'Starkscan',
    // Glow: Purple
    glowStyle: '0 0 52px -8px rgba(139,92,246,0.25), 0 0 0 1px rgba(139,92,246,0.12)',
    accentColor: '#8B5CF6',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-200',
    toggleActive: 'bg-[#8B5CF6] text-white shadow-sm',
    headerBg: 'from-purple-50 to-violet-50',
    dotColor: 'bg-purple-500',
    engineLabel: 'AVNU Paymaster · Gas Sponsored',
  },
  hashkey: {
    key: 'hashkey' as const,
    label: 'HashKey',
    asset: 'HSK',
    decimals: 18,
    chainId: 177,
    explorerUrl: 'https://explorer.hsk.xyz',
    explorerName: 'HashKey Explorer',
    // Glow: Gold
    glowStyle: '0 0 52px -8px rgba(201,162,39,0.28), 0 0 0 1px rgba(201,162,39,0.15)',
    accentColor: '#C9A227',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-200',
    toggleActive: 'bg-[#C9A227] text-white shadow-sm',
    headerBg: 'from-amber-50 to-yellow-50',
    dotColor: 'bg-amber-400',
    engineLabel: 'Native HSK · Chain 177',
  },
} as const
