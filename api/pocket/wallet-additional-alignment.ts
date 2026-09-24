import { createHash } from 'node:crypto'
import type { CircleEvmWalletRecord } from '../../src/lib/circleEvmWalletTopology.js'
import { EVM_REPLACEMENT_PREFIX } from '../../src/lib/circleEvmReplacement.js'

export const additionalNetworks = ['ethereum', 'polygon'] as const
export type AdditionalNetwork = typeof additionalNetworks[number]
export const additionalBlockchain = { ethereum: 'ETH', polygon: 'MATIC' } as const
export const additionalPlanKey = (userId: string, network: AdditionalNetwork) => 'pocket:additional-migration:v1:' + userId + ':' + network
export const additionalArchiveKey = (userId: string, network: AdditionalNetwork) => 'pocket:additional-legacy:v1:' + userId + ':' + network
const valid = (wallet: CircleEvmWalletRecord) => wallet.accountType === 'SCA' && wallet.state === 'LIVE' && /^0x[\da-f]{40}$/i.test(wallet.address)

/** Infer only a bounded next creation slot; activation always requires an actual address match. */
export function additionalAlignmentPlan(anchor: CircleEvmWalletRecord, inventory: CircleEvmWalletRecord[], network: AdditionalNetwork) {
  if (!additionalNetworks.includes(network) || !valid(anchor) || anchor.blockchain !== 'BASE') throw Error('Reconnect your current Pocket Base wallet.')
  if (inventory.length >= 50 || new Set(inventory.map(w => w.id)).size !== inventory.length || !inventory.some(w => w.id === anchor.id && w.address.toLowerCase() === anchor.address.toLowerCase())) throw Error('Wallet history must be verified before alignment.')
  const targets = inventory.filter(w => w.blockchain === additionalBlockchain[network])
  const matching = targets.filter(w => valid(w) && w.address.toLowerCase() === anchor.address.toLowerCase())
  if (matching.length > 1) throw Error('Wallet alignment returned duplicate addresses.')
  if (matching.length === 1) return { wallet: matching[0] }
  const bases = inventory.filter(w => w.blockchain === 'BASE')
  if (anchor.scaCore !== 'circle_6900_singleowner_v4' || [...bases, ...targets].some(w => !valid(w))) throw Error('Update your existing EVM wallets before adding this network.')
  if (bases.some(w => !Number.isFinite(Date.parse(w.createDate ?? '')))) throw Error('Wallet creation history is unavailable.')
  const before = bases.filter(w => Date.parse(w.createDate!) <= Date.parse(anchor.createDate!)).length
  // Never keep manufacturing wallets after the expected index failed to match.
  if (!before || targets.length >= before || before - targets.length > 3) throw Error('Circle wallet alignment needs review. Your current wallets are unchanged.')
  const slot = targets.length + 1
  const refId = EVM_REPLACEMENT_PREFIX + 'additional:' + anchor.id + ':' + network + ':' + slot
  const hash = createHash('sha256').update(refId).digest('hex')
  const idempotencyKey = hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32)
  return { request: { idempotencyKey, accountType: 'SCA' as const, scaConfiguration: { scaCore: anchor.scaCore }, blockchains: [additionalBlockchain[network]], metadata: [{ name: 'Pocket ' + network, refId }] } }
}
