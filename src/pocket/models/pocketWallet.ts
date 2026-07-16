import type { UnifiedBalanceChainKey } from '../../lib/unifiedBalance'

export type CirclePocketWallet = {
  address: string
  walletId?: string
  blockchain?: string
  updatedAt?: number
}

export type CirclePocketWallets = Partial<Record<UnifiedBalanceChainKey, CirclePocketWallet>>
