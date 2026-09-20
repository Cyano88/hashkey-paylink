import { createHash, randomUUID } from 'node:crypto'
import { isAddress } from 'viem'
import { mutateDurableJson } from '../render-durable-store.js'
import type { CircleLinkRecord } from '../privy-circle-link.js'
import { inspectEvmReplacement } from '../../src/lib/circleEvmReplacement.js'
import type { CircleEvmWalletRecord } from '../../src/lib/circleEvmWalletTopology.js'

export const migrationNetworks = ['base', 'arbitrum', 'arc'] as const
type Network = typeof migrationNetworks[number]
type Wallet = { walletId: string; address: string }
export type MigrationPlan = {
  version: 1; userId: string; attemptId: string; revision: string; reviewedAt: number
  phase: 'review' | 'transferring' | 'confirmed'
  rows: Array<{ network: Network; source: Wallet; target: Wallet; units: string }>
  transfers: Partial<Record<Network, { idempotencyKey: string; units: string; state: 'reserved' | 'submitted' | 'confirmed'; requestFingerprint?: string; recoveryAfter?: number; executionId?: string; challengeId?: string; transactionHash?: string; submittedAt?: number; confirmedAt?: number }>>
}

// Only server-read links, Circle-owned candidates and exact USDC units belong here.
// This record is not execution readiness or proof of completed migration.
export function buildMigrationPlan(input: {
  userId: string; attemptId: string; wallets: CircleEvmWalletRecord[]
  links: Record<Network, CircleLinkRecord | null>; units: Record<Network, bigint>; now?: number
}): MigrationPlan {
  if (!input.userId) throw new Error('Migration owner is required.')
  const candidates = inspectEvmReplacement(input.wallets, input.attemptId)
  if (candidates.status !== 'matching') throw new Error('Replacement wallets must match.')
  const rows = migrationNetworks.map(network => {
    const link = input.links[network]
    const target = candidates.wallets[network]
    if (!link || link.privyUserId !== input.userId || link.chain !== network || (link.purpose ?? 'payment') !== 'payment' || !link.circleWalletId || !isAddress(link.circleWalletAddress)) throw new Error('Reconnect each current payment wallet before migration.')
    if (link.circleWalletId === target.id || link.circleWalletAddress.toLowerCase() === target.address.toLowerCase()) throw new Error('Replacement is already an active wallet.')
    const units = input.units[network]
    if (typeof units !== 'bigint' || units < 0n || units >= 2n ** 256n) throw new Error('Exact migration balance is unavailable.')
    return { network, source: { walletId: link.circleWalletId, address: link.circleWalletAddress.toLowerCase() }, target: { walletId: target.id, address: target.address.toLowerCase() }, units: units.toString() }
  })
  const attemptId = input.attemptId.toLowerCase()
  const revision = createHash('sha256').update(JSON.stringify({ userId: input.userId, attemptId, rows })).digest('hex')
  return { version: 1, userId: input.userId, attemptId, revision, reviewedAt: input.now ?? Date.now(), phase: 'review', rows, transfers: {} }
}

export function retainMigrationPlan(current: MigrationPlan | undefined, next: MigrationPlan): MigrationPlan {
  if (!current) return next
  if (current.userId !== next.userId) throw new Error('Migration owner mismatch.')
  if (current.revision === next.revision) return current
  // A timeout is not a failed transfer. Never replace any reserved operation.
  if (current.phase !== 'review' || Object.keys(current.transfers).length) throw new Error('An existing migration must be reconciled before preparing another.')
  return next
}

export const saveMigrationPlan = (plan: MigrationPlan) => mutateDurableJson<MigrationPlan>(
  'pocket:wallet-migration-plan:v1:' + plan.userId, current => retainMigrationPlan(current, plan),
)

// Internal primitive for the executor. Persist the reservation BEFORE contacting Circle.
// The caller must separately verify fresh balances, fees, approval and pending activity.
export function reserveMigrationTransfer(plan: MigrationPlan, userId: string, revision: string, network: Network, newId = randomUUID): MigrationPlan {
  if (plan.userId !== userId || plan.revision !== revision) throw new Error('Migration review changed.')
  const row = plan.rows.find(row => row.network === network)
  if (!row || BigInt(row.units) <= 0n) throw new Error('No balance to migrate on this network.')
  if (plan.transfers[network]) return plan
  if (plan.phase === 'confirmed') throw new Error('Migration transfers are already confirmed.')
  return { ...plan, phase: 'transferring', transfers: { ...plan.transfers, [network]: { idempotencyKey: newId(), units: row.units, state: 'reserved' } } }
}
export function existingMigrationReview(plan:MigrationPlan|undefined,userId:string,attemptId:string,wallets:CircleEvmWalletRecord[]) {
 if(!plan || !Object.keys(plan.transfers).length)return null
 const candidates=inspectEvmReplacement(wallets,attemptId)
 if(plan.userId!==userId || plan.attemptId!==attemptId.toLowerCase() || candidates.status!=='matching' || !plan.rows.every(row=>candidates.wallets[row.network].id===row.target.walletId && candidates.wallets[row.network].address.toLowerCase()===row.target.address.toLowerCase()))throw Error('Existing migration wallet review does not match.')
 return {phase:'review' as const,transferAvailable:false,rows:plan.rows.map(row=>({network:row.network,balance:Number(BigInt(row.units))/1_000_000,amountUnits:row.units,status:'ok' as const}))}
}
