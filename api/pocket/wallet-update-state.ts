import type { MigrationPlan } from './wallet-migration-plan.js'
import { mutateDurableJson, readDurableJson } from '../render-durable-store.js'
import type { CircleLinkRecord } from '../privy-circle-link.js'
import type { PocketBalanceRow } from '../../src/pocket/lib/pocketSchemas.js'
import type { PocketWalletUpdateNotice } from '../../src/pocket/lib/pocketWalletUpdate.js'

type Network = 'base' | 'arbitrum' | 'arc'
export type PocketWalletUpdateRecord = {
  version: 2
  userId: string
  phase: 'prepared' | 'ready' | 'in_progress' | 'failed' | 'completed'
  sources: Partial<Record<Network, { walletId: string; address: string }>>
  targets?: Record<Network, { walletId: string; address: string }>
  // These fields are set only by a server-side migration verifier, never by the client.
  replacementVerifiedAt?: number
  executionVerifiedAt?: number
  completedAt?: number
}
const key = (userId: string) => 'pocket:wallet-update:v2:' + userId
export const readPocketWalletUpdate = (userId: string) => readDurableJson<PocketWalletUpdateRecord>(key(userId))

// A completed account is terminal, including deposits received after migration.
export function retainWalletUpdateCompletion(current: PocketWalletUpdateRecord | undefined, next: PocketWalletUpdateRecord) {
  if (current && current.userId !== next.userId) throw new Error('Wallet update owner mismatch.')
  if (current?.phase === 'completed' || current?.completedAt) return current
  return next
}

// Internal only. The transfer verifier must establish confirmation AND link activation.
// No HTTP endpoint accepts completion, timestamps or phases from a client.
export async function saveVerifiedPocketWalletUpdate(next: PocketWalletUpdateRecord, verify: () => Promise<boolean>) {
  if (!await verify()) throw new Error('Wallet update verification failed.')
  if (next.phase === 'completed' && !(Number.isFinite(next.completedAt) && next.completedAt! > 0)) throw new Error('Completion timestamp required.')
  return mutateDurableJson<PocketWalletUpdateRecord>(key(next.userId), current => retainWalletUpdateCompletion(current, next))
}

export function pocketWalletUpdateNotice(input: {
  userId: string
  record?: PocketWalletUpdateRecord
  migrationPlan?: MigrationPlan
  links: Partial<Record<Network, CircleLinkRecord>>
  rows: PocketBalanceRow[]
}): PocketWalletUpdateNotice {
  const { record, links, rows } = input
  if (record?.userId === input.userId && (record.phase === 'completed' || record.completedAt)) return 'hidden'
  const plan=input.migrationPlan
  // An owned saved migration is resumable even before execution verification,
  // after USDC reaches zero, or while a balance provider is unavailable.
  if(plan?.version===1 && plan.userId===input.userId && ['review','transferring'].includes(plan.phase) && Number.isFinite(plan.reviewedAt) && plan.reviewedAt>0 && plan.rows.length===3 && new Set(plan.rows.map(row=>row.network)).size===3) {
    const currentSources=plan.rows.every(row=>{
      if(row.network!=='base'&&row.network!=='arbitrum'&&row.network!=='arc')return false
      const link=links[row.network]
      return !!link && link.privyUserId===input.userId && link.chain===row.network && (link.purpose??'payment')==='payment' && link.circleWalletId===row.source.walletId && link.circleWalletAddress.toLowerCase()===row.source.address.toLowerCase()
    })
    if(currentSources)return 'resume'
  }

  if (!record || record.version !== 2 || record.userId !== input.userId || record.phase === 'completed' || record.completedAt) return 'hidden'
  if (!Number.isFinite(record.replacementVerifiedAt) || record.replacementVerifiedAt! <= 0 || !Number.isFinite(record.executionVerifiedAt) || record.executionVerifiedAt! <= 0 || !['ready', 'in_progress', 'failed'].includes(record.phase)) return 'hidden'
  const sources = Object.entries(record.sources ?? {}) as [Network, { walletId: string; address: string }][]
  if (!sources.length) return 'hidden'
  let funded = false
  for (const [network, source] of sources) {
    if (!['base', 'arbitrum', 'arc'].includes(network) || !source || typeof source.walletId !== 'string' || typeof source.address !== 'string') return 'hidden'
    const link = links[network]
    const row = rows.find(item => item.key === network)
    // Use only the server's balance read for the exact old wallet still linked.
    if (!link || link.privyUserId !== input.userId || link.chain !== network || link.circleWalletId !== source.walletId || link.circleWalletAddress.toLowerCase() !== source.address.toLowerCase()) return 'hidden'
    if (!row || row.status !== 'ok' || !Number.isFinite(row.balance) || row.balance < 0) return 'hidden'
    if (row.balance > 0) funded = true
  }
  if (!funded) return 'hidden'
  return record.phase === 'ready' ? 'available' : 'resume'
}
