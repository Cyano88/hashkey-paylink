import type { CirclePocketWallets } from '../models/pocketWallet'
import type { PocketWalletUpdateNotice } from './pocketWalletUpdate'

/** Preparation is discoverable before a funded migration is ready for review. */
export function pocketWalletPreparationNotice(notice: PocketWalletUpdateNotice, wallets: CirclePocketWallets): PocketWalletUpdateNotice | 'prepare' {
  if (notice !== 'hidden') return notice
  const addresses = (['base', 'arbitrum', 'arc', 'ethereum', 'polygon'] as const).map(network => wallets[network]?.address?.trim().toLowerCase())
  return addresses.slice(0,3).every(Boolean) && new Set(addresses.filter(Boolean)).size > 1 ? 'prepare' : 'hidden'
}