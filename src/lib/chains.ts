import { defineChain } from 'viem'
import { base } from 'viem/chains'

export type ChainKey = 'base' | 'starknet' | 'hashkey' | 'arc'

// ─── Platform fee engine ─────────────────────────────────────────────────────
/** 0.5 % platform fee in basis points (50 bps). Collected via FeeRouter on settlement. */
export const PLATFORM_FEE_BPS = 50
/** Treasury address — replace with your deployed FeeRouter before mainnet use */
export const PLATFORM_TREASURY = '0xFEEf3e28e0A7F27b0c1f7f68A0cC65b3b3A6f5D' as `0x${string}`

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

// ─── Arc Chain (Economic OS) ─────────────────────────────────────────────────
//
// STATUS: TESTNET (Chain ID 5042002, public since Oct 2025)
//
// TO UPGRADE TO MAINNET when Arc goes live:
//   1. Update id, rpcUrls, blockExplorers below (swap testnet → mainnet values)
//   2. Update CHAIN_META.arc.tokenAddress to the mainnet Circle USDC deployment
//   3. Update CHAIN_META.arc.explorerUrl / explorerName
//   4. Update wagmi.ts transport to the mainnet RPC
//
// Arc uses USDC as its native gas token (not ETH).
// nativeCurrency.decimals = 18 (gas accounting), ERC-20 USDC uses 6 decimals.
//
export const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
    public:  { http: ['https://rpc.testnet.arc.network', 'https://arc-testnet.drpc.org'] },
  },
  blockExplorers: {
    default: {
      name: 'Arcscan',
      url: 'https://testnet.arcscan.app',
      apiUrl: 'https://testnet.arcscan.app/api',
    },
  },
  testnet: true,
})

// ─── Mainnet values — uncomment + swap in above when Arc mainnet launches ─────
// export const arcChain = defineChain({
//   id: /* Arc Mainnet Chain ID — TBA */,
//   name: 'Arc',
//   nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
//   rpcUrls: {
//     default: { http: ['https://rpc.arc.network'] },
//     public:  { http: ['https://rpc.arc.network'] },
//   },
//   blockExplorers: {
//     default: { name: 'Arcscan', url: 'https://arcscan.app', apiUrl: 'https://arcscan.app/api' },
//   },
// })

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
    engineLabel: 'HashKey Mainnet · Native HSK',
  },
  arc: {
    key: 'arc' as const,
    label: 'Arc',
    asset: 'USDC',
    decimals: 6,
    chainId: 5042002,
    // Circle USDC on Arc Testnet — update to mainnet address when Arc launches
    // Ref: https://docs.arc.network/arc/references/contract-addresses
    tokenAddress: '0x0000000000000000000000000000000000000001' as `0x${string}`,
    explorerUrl: 'https://testnet.arcscan.app',
    explorerName: 'Arcscan',
    // Glow: Violet (Arc brand)
    glowStyle: '0 0 52px -8px rgba(124,58,237,0.30), 0 0 0 1px rgba(124,58,237,0.14)',
    accentColor: '#7C3AED',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
    badgeBorder: 'border-violet-200',
    toggleActive: 'bg-[#7C3AED] text-white shadow-sm',
    headerBg: 'from-violet-50 to-purple-50',
    dotColor: 'bg-violet-500',
    engineLabel: 'Arc Testnet · Native USDC Gas',
    isTestnet: true,
  },
} as const
