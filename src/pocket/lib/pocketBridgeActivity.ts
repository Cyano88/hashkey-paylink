import type { PocketActivityRow } from '../models/pocketActivity'
import { bridgeProgressLabel, type PocketPendingBridge, type PocketBridgeProgress } from './pocketPendingBridge'

export function bridgeFromActivityRow(row: PocketActivityRow): PocketPendingBridge | null {
  if (row.bridge) return row.bridge
  if (row.source !== 'wallet-bridge' && row.settlementType !== 'wallet_bridge') return null
  const networks = ['base', 'arbitrum', 'arc', 'solana']
  if (!networks.includes(row.chain) || !networks.includes(row.destination || row.recipient || '')) return null
  const status = String(row.paycrestStatus).toLowerCase()
  const progress: PocketBridgeProgress = status === 'completed' ? 'completed' : status === 'failed' || status === 'needs_review' ? 'needs_attention' : 'submitted'
  return { id: row.eventId, source: row.chain as PocketPendingBridge['source'], destination: (row.destination || row.recipient) as PocketPendingBridge['destination'], amount: row.amount, createdAt: row.ts, txHash: row.txHash || undefined, destinationTxHash: row.destinationTxHash, sourceConfirmed: progress === 'completed', progress }
}
export function mergePocketBridgeActivity(rows: PocketActivityRow[], transfers: PocketPendingBridge[]): PocketActivityRow[] {
  const merged = rows.map(row => { const bridge = bridgeFromActivityRow(row); return bridge ? { ...row, bridge, paycrestStatus: bridgeProgressLabel(bridge.progress || 'submitted') } : row })
  for (const transfer of transfers) {
    const index = merged.findIndex(row => row.source === 'wallet-bridge' && (row.eventId === transfer.id || Boolean(transfer.txHash && row.txHash === transfer.txHash && row.chain === transfer.source)))
    const existing = index < 0 ? undefined : merged[index]
    const bridge = { ...transfer, progress: existing?.bridge?.progress === 'completed' ? 'completed' as const : transfer.progress || (transfer.txHash ? 'submitted' as const : 'needs_attention' as const) }
    const row: PocketActivityRow = {
      ...existing, eventId: transfer.id, txHash: transfer.txHash || '', chain: transfer.source, payer: 'Pocket wallet',
      memo: `${transfer.source} to ${transfer.destination}`, amount: transfer.amount, ts: transfer.createdAt,
      source: 'wallet-bridge', settlementType: 'wallet_bridge', activityLabel: 'USDC bridge', contextLabel: `${transfer.source} to ${transfer.destination}`,
      direction: 'out', destination: transfer.destination, supportReference: transfer.txHash || transfer.challengeId || transfer.id,
      paycrestStatus: bridgeProgressLabel(bridge.progress), bridge,
    }
    if (index < 0) merged.push(row)
    else merged[index] = row
  }
  const bridgeHashes = new Set(merged.filter(row => row.bridge && row.txHash).map(row => row.chain + ':' + row.txHash))
  return merged.filter(row => row.source !== 'wallet-withdrawal' || !bridgeHashes.has(row.chain + ':' + row.txHash))
}
