import { defineChain } from 'viem'
import { base as baseMainnet } from 'viem/chains'

export type ChainKey = 'base' | 'starknet' | 'hashkey' | 'arc'

export const PLATFORM_FEE_BPS = 20
/** EVM treasury — receives 0.2% fee on Base, HashKey, Arc */
export const EVM_TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753' as `0x${string}`
/** Starknet treasury — receives 0.2% fee on Starknet */
export const STARK_TREASURY = '0x0483AB5539B281c08777F1C8337Beeba05c2610feDcbA191B989E35eDc2767C3'
/** Multicall3 — canonical address on all EVM chains; used for atomic permit+split */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`
/** @deprecated — use EVM_TREASURY or STARK_TREASURY */
export const PLATFORM_TREASURY = EVM_TREASURY

export const hashkeyMainnet = defineChain({
  id: 177,
  name: 'HashKey Chain',
  nativeCurrency: { decimals: 18, name: 'HashKey', symbol: 'HSK' },
  rpcUrls: {
    default: { http: ['https://mainnet.hsk.xyz'] },
    public:  { http: ['https://mainnet.hsk.xyz'] },
  },
  blockExplorers: {
    default: { name: 'HashKey Explorer', url: 'https://explorer.hsk.xyz', apiUrl: 'https://explorer.hsk.xyz/api' },
  },
})

// Arc Testnet (Chain ID 5042002) — swap for mainnet values when Arc mainnet launches
export const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
    public:  { http: ['https://rpc.testnet.arc.network', 'https://arc-testnet.drpc.org'] },
  },
  blockExplorers: {
    default: { name: 'Arcscan', url: 'https://testnet.arcscan.app', apiUrl: 'https://testnet.arcscan.app/api' },
  },
  testnet: true,
})

export const CHAIN_META = {
  base: {
    key: 'base' as const, label: 'Base', asset: 'USDC', decimals: 6, chainId: baseMainnet.id,
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    explorerUrl: 'https://basescan.org', explorerName: 'Basescan',
    glowStyle: '0 0 52px -8px rgba(0,82,255,0.25), 0 0 0 1px rgba(0,82,255,0.12)',
    accentColor: '#0052FF', badgeBg: 'bg-blue-50', badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200', toggleActive: 'bg-[#0052FF] text-white shadow-sm',
    headerBg: 'from-blue-50 to-sky-50', dotColor: 'bg-blue-500',
    engineLabel: 'EIP-7702 · Gas Sponsored',
  },
  starknet: {
    key: 'starknet' as const, label: 'Starknet', asset: 'USDC', decimals: 6,
    tokenAddress: '0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb',
    explorerUrl: 'https://starkscan.co', explorerName: 'Starkscan',
    glowStyle: '0 0 52px -8px rgba(139,92,246,0.25), 0 0 0 1px rgba(139,92,246,0.12)',
    accentColor: '#8B5CF6', badgeBg: 'bg-purple-50', badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-200', toggleActive: 'bg-[#8B5CF6] text-white shadow-sm',
    headerBg: 'from-purple-50 to-violet-50', dotColor: 'bg-purple-500',
    engineLabel: 'AVNU Paymaster · Gas Sponsored',
  },
  hashkey: {
    key: 'hashkey' as const, label: 'HashKey', asset: 'HSK', decimals: 18, chainId: 177,
    explorerUrl: 'https://explorer.hsk.xyz', explorerName: 'HashKey Explorer',
    glowStyle: '0 0 52px -8px rgba(201,162,39,0.28), 0 0 0 1px rgba(201,162,39,0.15)',
    accentColor: '#C9A227', badgeBg: 'bg-amber-50', badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-200', toggleActive: 'bg-[#C9A227] text-white shadow-sm',
    headerBg: 'from-amber-50 to-yellow-50', dotColor: 'bg-amber-400',
    engineLabel: 'HashKey Mainnet · Native HSK',
  },
  arc: {
    key: 'arc' as const, label: 'Arc', asset: 'USDC', decimals: 6, chainId: 5042002,
    // Update tokenAddress to mainnet Circle USDC when Arc mainnet launches
    // Ref: https://docs.arc.network/arc/references/contract-addresses
    tokenAddress: '0x3600000000000000000000000000000000000000' as `0x${string}`,
    explorerUrl: 'https://testnet.arcscan.app', explorerName: 'Arcscan',
    glowStyle: '0 0 52px -8px rgba(124,58,237,0.30), 0 0 0 1px rgba(124,58,237,0.14)',
    accentColor: '#7C3AED', badgeBg: 'bg-violet-50', badgeText: 'text-violet-700',
    badgeBorder: 'border-violet-200', toggleActive: 'bg-[#7C3AED] text-white shadow-sm',
    headerBg: 'from-violet-50 to-purple-50', dotColor: 'bg-violet-500',
    engineLabel: 'Arc Testnet · Native USDC Gas',
    isTestnet: true,
  },
} as const
