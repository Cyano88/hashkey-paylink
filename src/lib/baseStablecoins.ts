export type BaseStablecoin = 'USDC' | 'USDT'
export const BASE_STABLECOINS = {
  USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
} as const
export function baseStablecoin(value: unknown): BaseStablecoin {
  if (value === undefined || value === null || value === '' || value === 'USDC') return 'USDC'
  if (value === 'USDT') return 'USDT'
  throw new Error('Unsupported payout asset.')
}
