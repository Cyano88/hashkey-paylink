import type { PocketBridgeNetwork } from '../api/pocketBridgeClient'

export type PocketBridgeProgress = 'submitted' | 'arriving' | 'completed' | 'failed' | 'needs_attention'
export type PocketPendingBridge = {
  id: string
  source: PocketBridgeNetwork
  destination: PocketBridgeNetwork
  amount: string
  walletAddress?: string
  txHash?: string
  challengeId?: string
  createdAt: number
  progress?: PocketBridgeProgress
  destinationTxHash?: string
  historySynced?: boolean
  sourceConfirmed?: boolean
}
const networks = new Set(['base', 'arbitrum', 'arc', 'solana', 'ethereum', 'polygon'])
const states = new Set(['submitted', 'arriving', 'completed', 'failed', 'needs_attention'])
export const POCKET_BRIDGES_UPDATED = 'pocket:bridges-updated'
export function parsePocketPendingBridge(value: unknown): PocketPendingBridge {
  const item = value as PocketPendingBridge
  if (!item || typeof item.id !== 'string' || !item.id || !networks.has(item.source) || !networks.has(item.destination) || item.source === item.destination || typeof item.amount !== 'string' || !/^\d+(\.\d{1,6})?$/.test(item.amount) || !Number.isFinite(item.createdAt) || (item.progress !== undefined && !states.has(item.progress))) throw new Error('Bridge details could not be read. Contact Pocket support before repeating this transfer.')
  for (const key of ['txHash', 'challengeId', 'walletAddress', 'destinationTxHash'] as const) {
    if (item[key] !== undefined && (typeof item[key] !== 'string' || item[key]!.length > 256)) throw new Error('Bridge details are invalid.')
  }
  return item
}
export function pocketBridgeStorageKey(owner: string) {
  if (!owner) throw new Error('Sign in before opening a bridge.')
  return 'pocket:bridge:mainnet:v1:' + encodeURIComponent(owner)
}
// Compatibility reader for the earlier single-pending-transfer store.
export function readPendingPocketBridge(owner: string, storage: Pick<Storage, 'getItem'>): PocketPendingBridge | null {
  const raw = storage.getItem(pocketBridgeStorageKey(owner))
  return raw ? parsePocketPendingBridge(JSON.parse(raw)) : null
}
export function savePendingPocketBridge(owner: string, value: PocketPendingBridge | null, storage: Pick<Storage, 'setItem' | 'removeItem'>) {
  const key = pocketBridgeStorageKey(owner)
  if (value) storage.setItem(key, JSON.stringify(parsePocketPendingBridge(value)))
  else storage.removeItem(key)
}
export function readPocketBridgeTransfers(owner: string, storage: Pick<Storage, 'getItem'>): PocketPendingBridge[] {
  const raw = storage.getItem(pocketBridgeStorageKey(owner).replace(':v1:', ':v2:'))
  const parsed: unknown = raw ? JSON.parse(raw) : []
  if (!Array.isArray(parsed)) throw new Error('Bridge history could not be read. Contact support before repeating a transfer.')
  const records = parsed.map(parsePocketPendingBridge)
  const legacy = readPendingPocketBridge(owner, storage)
  if (legacy && !records.some(record => samePocketBridge(record, legacy))) records.push(legacy)
  return records
}
export function samePocketBridge(a: PocketPendingBridge, b: PocketPendingBridge) {
  return a.id === b.id || Boolean(a.txHash && b.txHash && a.source === b.source && a.txHash === b.txHash)
}
export function savePocketBridgeTransfer(owner: string, value: PocketPendingBridge, storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const next = parsePocketPendingBridge(value)
  const records = readPocketBridgeTransfers(owner, storage)
  const index = records.findIndex(record => samePocketBridge(record, next))
  if (index < 0) records.push(next)
  else {
    const old = records[index]
    const progress = old.progress === 'completed' || old.progress === 'failed' ? old.progress : next.progress ?? old.progress
    records[index] = { ...old, ...next, id: old.id, progress: old.sourceConfirmed && progress === 'submitted' ? old.progress : progress }
  }
  storage.setItem(pocketBridgeStorageKey(owner).replace(':v1:', ':v2:'), JSON.stringify(records))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(POCKET_BRIDGES_UPDATED))
}
export function ambiguousMatchingBridge(records: PocketPendingBridge[], source: PocketBridgeNetwork, destination: PocketBridgeNetwork, amount: string) {
  const units = (value: string) => {
    if (!/^\d+(\.\d{1,6})?$/.test(value)) return null
    const [whole, fraction = ''] = value.split('.')
    return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  }
  const requested = units(amount)
  return records.find(record => !record.txHash && record.progress !== 'failed' && record.progress !== 'completed' && record.source === source && record.destination === destination && requested !== null && units(record.amount) === requested)
}
export function bridgeProgressFromProvider(status: string, sourceConfirmed = false): PocketBridgeProgress {
  if (status === 'confirmed' || status === 'complete') return 'completed'
  // A forwarding failure does not mean the source burn failed. Never invite
  // another debit merely because the destination relay needs attention.
  if (['failed', 'failure', 'rejected', 'expired', 'cancelled', 'canceled'].includes(status)) return 'needs_attention'
  return sourceConfirmed || status === 'attested' ? 'arriving' : 'submitted'
}
export function bridgeProgressLabel(progress: PocketBridgeProgress) {
  return progress === 'needs_attention' ? 'Needs attention' : progress === 'arriving' ? 'Arriving' : progress === 'completed' ? 'Completed' : progress === 'failed' ? 'Failed' : 'Submitted'
}
