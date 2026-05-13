export type ChainKey = 'base' | 'arbitrum' | 'solana' | 'starknet' | 'arc' | 'hashkey'

export const PLATFORM_FEE_BPS = 20

export const EVM_TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753' as const
export const SOLANA_TREASURY_OWNER = 'Gs7RTc4iW5HE7r1s9AC2UwgEhb4uJ5vxZ9idFHh6x73J' as const
export const STARK_TREASURY = '0x0483AB5539B281c08777F1C8337Beeba05c2610feDcbA191B989E35eDc2767C3' as const
/** @deprecated use EVM_TREASURY. */
export const PLATFORM_TREASURY = EVM_TREASURY

export const CHAIN_META = {
  base: {
    key: 'base',
    label: 'Base',
    asset: 'USDC',
    decimals: 6,
    chainId: 8453,
    accentColor: '#0052FF',
    explorerUrl: 'https://basescan.org',
    mode: 'smart-wallet/direct',
  },
  arbitrum: {
    key: 'arbitrum',
    label: 'Arbitrum',
    asset: 'USDC',
    decimals: 6,
    chainId: 42161,
    accentColor: '#12AAFF',
    explorerUrl: 'https://arbiscan.io',
    mode: 'smart-wallet/direct',
  },
  solana: {
    key: 'solana',
    label: 'Solana',
    asset: 'USDC',
    decimals: 6,
    accentColor: '#14F195',
    explorerUrl: 'https://solscan.io',
    mode: 'email/direct',
  },
  starknet: {
    key: 'starknet',
    label: 'Starknet',
    asset: 'USDC',
    decimals: 6,
    accentColor: '#8B5CF6',
    explorerUrl: 'https://starkscan.co',
    mode: 'smart-wallet',
  },
  arc: {
    key: 'arc',
    label: 'Arc Testnet',
    asset: 'USDC',
    decimals: 6,
    chainId: 5042002,
    accentColor: '#7C3AED',
    explorerUrl: 'https://testnet.arcscan.app',
    mode: 'direct/testnet',
    isTestnet: true,
  },
  hashkey: {
    key: 'hashkey',
    label: 'HashKey',
    asset: 'HSK',
    decimals: 18,
    chainId: 177,
    accentColor: '#C9A227',
    explorerUrl: 'https://explorer.hsk.xyz',
    mode: 'native',
  },
} as const satisfies Record<ChainKey, {
  key: ChainKey
  label: string
  asset: string
  decimals: number
  chainId?: number
  accentColor: string
  explorerUrl: string
  mode: string
  isTestnet?: boolean
}>

export const SUPPORTED_NETWORKS = Object.keys(CHAIN_META) as ChainKey[]
