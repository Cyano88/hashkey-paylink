/** Celo assets used for Pocket receiving and balance display. */
export const POCKET_CELO = {
  chainId: 42220,
  network: 'celo',
  assets: {
    USDC: { symbol: 'USDC', address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', decimals: 6, native: false },
    USDT: { symbol: 'USDT', address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e', decimals: 6, native: false },
    cNGN: { symbol: 'cNGN', address: '0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f', decimals: 6, native: false },
    CELO: { symbol: 'CELO', address: '0x0000000000000000000000000000000000000000', decimals: 18, native: true },
  },
} as const

export type PocketCeloAsset = keyof typeof POCKET_CELO.assets
