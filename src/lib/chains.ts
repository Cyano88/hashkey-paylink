import { defineChain } from 'viem'
import { base } from 'viem/chains'

export type ChainKey = 'base' | 'arc' | 'solana' | 'arbitrum'

// ─── Platform fee engine ─────────────────────────────────────────────────────
/** 0.2% platform fee in basis points (20 bps). Collected by Hash PayLink settlement flows. */
export const PLATFORM_FEE_BPS = 20
/** EVM treasury — receives the platform fee on supported EVM USDC networks. */
export const EVM_TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753' as `0x${string}`
/** Multicall3 — canonical address on all EVM chains; used for atomic permit+split */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`
/** @deprecated — use EVM_TREASURY */
export const PLATFORM_TREASURY = EVM_TREASURY

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
    // Glow: Blue #0052FF
    glowStyle: '0 0 52px -8px rgba(0,82,255,0.25), 0 0 0 1px rgba(0,82,255,0.12)',
    accentColor: '#0052FF',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
    toggleActive: 'bg-[#0052FF] text-white shadow-sm',
    headerBg: 'from-blue-50 to-sky-50',
    dotColor: 'bg-[#0052FF]',
    engineLabel: 'Smart Wallet · Gas Sponsored',
  },
  arc: {
    key: 'arc' as const,
    label: 'Arc',
    asset: 'USDC',
    decimals: 6,
    chainId: 5042002,
    // Arc native USDC precompile — symbol=USDC, decimals=6
    // Ref: https://docs.arc.network/arc/references/contract-addresses
    tokenAddress: '0x3600000000000000000000000000000000000000' as `0x${string}`,
    explorerUrl: 'https://testnet.arcscan.app',
    explorerName: 'Arcscan',
    // Glow: Deep Teal #008080
    glowStyle: '0 0 52px -8px rgba(0,128,128,0.30), 0 0 0 1px rgba(0,128,128,0.14)',
    accentColor: '#008080',
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-700',
    badgeBorder: 'border-teal-200',
    toggleActive: 'bg-[#008080] text-white shadow-sm',
    headerBg: 'from-teal-50 to-cyan-50',
    dotColor: 'bg-[#008080]',
    engineLabel: 'Arc Testnet · Native USDC Gas',
    isTestnet: true,
  },
  solana: {
    key:          'solana' as const,
    label:        'Solana',
    asset:        'USDC',
    decimals:     6,
    tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    explorerUrl:  'https://solscan.io',
    explorerName: 'Solscan',
    // Glow: Cyber Green #14F195
    glowStyle:    '0 0 52px -8px rgba(20,241,149,0.28), 0 0 0 1px rgba(20,241,149,0.14)',
    accentColor:  '#14F195',
    badgeBg:      'bg-green-50',
    badgeText:    'text-green-700',
    badgeBorder:  'border-green-200',
    toggleActive: 'bg-[#14F195] text-gray-900 shadow-sm',
    headerBg:     'from-green-50 to-emerald-50',
    dotColor:     'bg-[#14F195]',
    engineLabel:  'Smart Wallet · Gas Sponsored',
  },
  arbitrum: {
    key:          'arbitrum' as const,
    label:        'Arbitrum',
    asset:        'USDC',
    decimals:     6,
    chainId:      42161,
    // Circle native USDC on Arbitrum One. Do not use bridged USDC.e here.
    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
    explorerUrl:  'https://arbiscan.io',
    explorerName: 'Arbiscan',
    // Glow: Arbitrum brand blue
    glowStyle:    '0 0 52px -8px rgba(40,160,240,0.28), 0 0 0 1px rgba(40,160,240,0.14)',
    accentColor:  '#28A0F0',
    badgeBg:      'bg-sky-50',
    badgeText:    'text-sky-700',
    badgeBorder:  'border-sky-200',
    toggleActive: 'bg-[#28A0F0] text-white shadow-sm',
    headerBg:     'from-sky-50 to-blue-50',
    dotColor:     'bg-[#28A0F0]',
    engineLabel:  'Smart Wallet · Gas Sponsored',
  },
} as const
