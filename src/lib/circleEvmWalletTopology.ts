import { isAddress } from 'viem'

export type CircleEvmWalletRecord = {
  id: string
  address: `0x${string}`
  blockchain: string
  accountType?: string
  createDate?: string
  refId?: string
}

export type PocketProductionEvmChain = 'base' | 'arbitrum'
export type PocketProductionEvmTopologyStatus = 'empty' | 'single-network' | 'split' | 'unified'

export type PocketProductionEvmTopology = {
  status: PocketProductionEvmTopologyStatus
  canonicalAddress?: `0x${string}`
  wallets: Partial<Record<PocketProductionEvmChain, CircleEvmWalletRecord>>
  legacyWallets: CircleEvmWalletRecord[]
  migrationRequired: boolean
}

export const POCKET_CANONICAL_EVM_REF_ID = 'pocket:canonical-evm:v1'

export function linkedPocketEvmStatus(input: { base?: string; arbitrum?: string }) {
  const base = input.base?.trim()
  const arbitrum = input.arbitrum?.trim()
  if (!base && !arbitrum) return 'not-opened' as const
  if (!base || !arbitrum) return 'incomplete' as const
  return base.toLowerCase() === arbitrum.toLowerCase() ? 'unified' as const : 'migration-required' as const
}

function productionChain(blockchain: string): PocketProductionEvmChain | null {
  const normalized = blockchain.trim().toUpperCase()
  if (normalized === 'BASE') return 'base'
  if (['ARB', 'ARBITRUM', 'ARBITRUM-ONE', 'ARBITRUM_ONE', 'ARBITRUMONE'].includes(normalized)) return 'arbitrum'
  return null
}

function eligibleWallet(wallet: CircleEvmWalletRecord) {
  return isAddress(wallet.address)
    && (!wallet.accountType || wallet.accountType.trim().toUpperCase() === 'SCA')
    && productionChain(wallet.blockchain) !== null
}

function newestFirst(left: CircleEvmWalletRecord, right: CircleEvmWalletRecord) {
  const leftTime = Date.parse(left.createDate ?? '') || 0
  const rightTime = Date.parse(right.createDate ?? '') || 0
  return rightTime - leftTime
}

export function auditPocketProductionEvmWallets(input: CircleEvmWalletRecord[]): PocketProductionEvmTopology {
  const candidates = input.filter(eligibleWallet)
  const byChain = {
    base: candidates.filter(wallet => productionChain(wallet.blockchain) === 'base').sort(newestFirst),
    arbitrum: candidates.filter(wallet => productionChain(wallet.blockchain) === 'arbitrum').sort(newestFirst),
  }

  if (!byChain.base.length && !byChain.arbitrum.length) {
    return { status: 'empty', wallets: {}, legacyWallets: [], migrationRequired: false }
  }

  const arbitrumByAddress = new Map(byChain.arbitrum.map(wallet => [wallet.address.toLowerCase(), wallet]))
  const unifiedPairs = byChain.base.flatMap(base => {
    const arbitrum = arbitrumByAddress.get(base.address.toLowerCase())
    return arbitrum ? [{ base, arbitrum }] : []
  }).sort((left, right) => {
    const leftCanonical = left.base.refId === POCKET_CANONICAL_EVM_REF_ID || left.arbitrum.refId === POCKET_CANONICAL_EVM_REF_ID
    const rightCanonical = right.base.refId === POCKET_CANONICAL_EVM_REF_ID || right.arbitrum.refId === POCKET_CANONICAL_EVM_REF_ID
    if (leftCanonical !== rightCanonical) return leftCanonical ? -1 : 1
    return newestFirst(left.base, right.base)
  })

  const pair = unifiedPairs[0]
  if (pair) {
    const selectedIds = new Set([pair.base.id, pair.arbitrum.id])
    return {
      status: 'unified',
      canonicalAddress: pair.base.address,
      wallets: pair,
      legacyWallets: candidates.filter(wallet => !selectedIds.has(wallet.id)),
      migrationRequired: candidates.some(wallet => !selectedIds.has(wallet.id)),
    }
  }

  const hasBothNetworks = byChain.base.length > 0 && byChain.arbitrum.length > 0
  return {
    status: hasBothNetworks ? 'split' : 'single-network',
    wallets: {
      ...(byChain.base[0] ? { base: byChain.base[0] } : {}),
      ...(byChain.arbitrum[0] ? { arbitrum: byChain.arbitrum[0] } : {}),
    },
    legacyWallets: candidates,
    migrationRequired: true,
  }
}
