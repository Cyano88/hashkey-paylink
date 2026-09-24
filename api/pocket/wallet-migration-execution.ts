import { formatUnits } from 'viem'
import { mutateDurableJson } from '../render-durable-store.js'
import { paymentExecutionRepository, type PaymentExecutionRepository } from './payment-execution-intents.js'
import { reserveMigrationTransfer, type MigrationPlan } from './wallet-migration-plan.js'

type Network = MigrationPlan['rows'][number]['network']
type Row = MigrationPlan['rows'][number]
type Transfer = NonNullable<MigrationPlan['transfers'][Network]>
type Context = { userId: string; revision: string; network: Network }
type Preconditions = {
  // Returned by a server verifier for the exact revision, never accepted from HTTP input.
  revision: string; checkedAt: number; ownershipVerified: boolean; noPendingOperations: boolean
  assetsAccountedFor: boolean; feeApproved: boolean; sourceUnits: string
}
export type MigrationExecutionDependencies = {
  mutate(userId: string, fn: (current: MigrationPlan | undefined) => MigrationPlan): Promise<MigrationPlan>
  ledger: Pick<PaymentExecutionRepository, 'create' | 'update' | 'get'>
  preflight(plan: MigrationPlan, row: Row): Promise<Preconditions>
  approve(context: Context): Promise<boolean>
  challengeFingerprint?(row: Row, idempotencyKey: string): string
  createChallenge(row: Row, idempotencyKey: string): Promise<{ challengeId: string }>
  verifyReceipt(row: Row, transfer: Transfer): Promise<{ transactionHash: string; confirmedAt: number } | null>
  inspectChallenge?(row: Row, challengeId: string): Promise<'approval_required'|'pending'|'needs_review'|'expired'>
  verifyExpiry?(plan: MigrationPlan, row: Row, transfer: Transfer, createdAt: number): Promise<{ revision: string; checkedAt: number; providerExpired: boolean; ownershipVerified: boolean; noPendingOperations: boolean; sourceUnits: string }>
  invalidateFeeQuote?(userId: string, network: Network): Promise<void>
  now(): number
}

export const migrationExecutionStorage = {
  mutate: (userId: string, fn: (current: MigrationPlan | undefined) => MigrationPlan) => mutateDurableJson<MigrationPlan>('pocket:wallet-migration-plan:v1:' + userId, fn),
  ledger: paymentExecutionRepository,
  now: Date.now,
}

function owned(current: MigrationPlan | undefined, context: Context) {
  if (!current || current.userId !== context.userId || current.revision !== context.revision) throw new Error('Migration review changed.')
  const row = current.rows.find(row => row.network === context.network)
  if (!row) throw new Error('Migration network is unavailable.')
  return { plan: current, row }
}

// Internal service only: no HTTP route until all production verifiers and activation
// are connected. A signed challenge or provider acceptance is not a receipt.
export function createMigrationExecutor(io: MigrationExecutionDependencies) {
  return {
    async start(context: Context, snapshot: MigrationPlan) {
      const { row } = owned(snapshot, context)
      if (snapshot.transfers[context.network]) return { state: 'reconcile' as const }
      const check = await io.preflight(snapshot, row)
      const age = io.now() - check.checkedAt
      if (check.revision !== snapshot.revision || !Number.isFinite(age) || age < 0 || age > 30_000 || !check.ownershipVerified || !check.noPendingOperations || !check.assetsAccountedFor || !check.feeApproved || check.sourceUnits !== row.units) throw new Error('Migration preflight needs a fresh review.')
      if (!await io.approve(context)) throw new Error('Approve the migration with Pocket payment security.')
      if (io.now() - check.checkedAt > 30_000) throw new Error('Migration preflight expired during approval.')
      let claimed = false
      const reserved = await io.mutate(context.userId, current => {
        const { plan } = owned(current, context)
        if (plan.transfers[context.network]) return plan
        claimed = true
        return reserveMigrationTransfer(plan, context.userId, context.revision, context.network)
      })
      if (!claimed) return { state: 'reconcile' as const }
      const transfer = reserved.transfers[context.network]!
      // The reservation survives any later failure. A retry never creates a new challenge.
      const { intent } = await io.ledger.create({
        ownerId: context.userId, idempotencyKey: transfer.idempotencyKey, kind: 'wallet_transfer',
        amount: formatUnits(BigInt(row.units), 6), sourceNetwork: row.network, settlementNetwork: row.network,
        destinationType: 'wallet_migration', metadata: { migrationRevision: context.revision, sourceWalletId: row.source.walletId, destinationWalletId: row.target.walletId, recipient: row.target.address },
      })
      await io.ledger.update({ ownerId: context.userId, intentId: intent.id, state: 'authorized', expectedState: 'prepared' })
      await io.mutate(context.userId, current => {
        const { plan } = owned(current, context)
        const entry = plan.transfers[context.network]
        if (!entry || entry.idempotencyKey !== transfer.idempotencyKey) throw new Error('Migration reservation changed.')
        return { ...plan, transfers: { ...plan.transfers, [context.network]: { ...entry, executionId: intent.id, requestFingerprint:io.challengeFingerprint?.(row,transfer.idempotencyKey) } } }
      })
      const challenge = await io.createChallenge(row, transfer.idempotencyKey)
      if (!challenge.challengeId) throw new Error('Migration challenge is pending reconciliation.')
      await io.mutate(context.userId, current => {
        const { plan } = owned(current, context)
        const entry = plan.transfers[context.network]
        if (!entry || entry.executionId !== intent.id || entry.state !== 'reserved') throw new Error('Migration reservation changed.')
        return { ...plan, transfers: { ...plan.transfers, [context.network]: { ...entry, challengeId: challenge.challengeId } } }
      })
      // Still only authorized: the user has not yet signed the Circle challenge.
      return { state: 'approval' as const, challengeId: challenge.challengeId }
    },
    async recover(context: Context, snapshot: MigrationPlan) {
      const { row }=owned(snapshot,context)
      const transfer=snapshot.transfers[context.network]
      if(!transfer?.executionId || transfer.challengeId || transfer.state!=='reserved' || transfer.transactionHash || !transfer.requestFingerprint || !io.challengeFingerprint || io.challengeFingerprint(row,transfer.idempotencyKey)!==transfer.requestFingerprint) return {state:'needs_review' as const}
      const intent=await io.ledger.get(context.userId,transfer.executionId)
      if(!intent || intent.state!=='authorized' || intent.transactionHash || intent.idempotencyKey!==transfer.idempotencyKey || intent.metadata.migrationRevision!==context.revision) return {state:'needs_review' as const}
      if(!await io.approve(context)) throw new Error('Approve the migration with Pocket payment security.')
      let claimed=false
      await io.mutate(context.userId,current=>{
        const {plan}=owned(current,context), entry=plan.transfers[context.network]
        if(!entry || entry.challengeId || entry.state!=='reserved' || entry.transactionHash || entry.executionId!==transfer.executionId || entry.idempotencyKey!==transfer.idempotencyKey || entry.requestFingerprint!==transfer.requestFingerprint || (entry.recoveryAfter??0)>io.now()) return plan
        claimed=true
        return {...plan,transfers:{...plan.transfers,[context.network]:{...entry,recoveryAfter:io.now()+60_000}}}
      })
      if(!claimed)return {state:'pending' as const}
      // Identical request and key only. Recovery never signs or allocates a replacement.
      const challenge=await io.createChallenge(row,transfer.idempotencyKey)
      if(!challenge.challengeId)throw new Error('Migration challenge is pending reconciliation.')
      await io.mutate(context.userId,current=>{
        const {plan}=owned(current,context),entry=plan.transfers[context.network]
        if(!entry || entry.executionId!==transfer.executionId || entry.idempotencyKey!==transfer.idempotencyKey || entry.requestFingerprint!==transfer.requestFingerprint || entry.state!=='reserved' || entry.transactionHash || (entry.challengeId && entry.challengeId!==challenge.challengeId)) throw new Error('Migration reservation changed.')
        return {...plan,transfers:{...plan.transfers,[context.network]:{...entry,challengeId:challenge.challengeId}}}
      })
      return {state:'reconcile' as const}
    },
    async resume(context: Context, snapshot: MigrationPlan) {
      const { row } = owned(snapshot, context)
      const transfer = snapshot.transfers[context.network]
      if (!transfer?.executionId || !transfer.challengeId || transfer.state==='confirmed' || transfer.transactionHash || !io.inspectChallenge) return {state:'needs_review' as const}
      const intent = await io.ledger.get(context.userId, transfer.executionId)
      if (!intent || intent.state!=='authorized' || intent.transactionHash || intent.idempotencyKey!==transfer.idempotencyKey || intent.metadata.migrationRevision!==context.revision) return {state:'needs_review' as const}
      if (!await io.approve(context)) throw new Error('Approve the migration with Pocket payment security.')
      const state=await io.inspectChallenge(row,transfer.challengeId)
      if(state!=='approval_required') return {state}
      // Re-read the durable reservation after approval; never allocate or create a challenge here.
      let unchanged=false
      await io.mutate(context.userId,current=>{
        const {plan}=owned(current,context), entry=plan.transfers[context.network]
        unchanged=!!entry && entry.state==='reserved' && !entry.transactionHash && entry.executionId===transfer.executionId && entry.idempotencyKey===transfer.idempotencyKey && entry.challengeId===transfer.challengeId
        return plan
      })
      return unchanged?{state:'approval' as const,challengeId:transfer.challengeId}:{state:'pending' as const}
    },
    async reconcile(context: Context, snapshot: MigrationPlan) {
      const { row } = owned(snapshot, context)
      const transfer = snapshot.transfers[context.network]
      if (!transfer?.executionId) return { state: 'needs_review' as const }
      const intent = await io.ledger.get(context.userId, transfer.executionId)
      if (!intent || intent.idempotencyKey !== transfer.idempotencyKey || intent.metadata.migrationRevision !== context.revision) throw new Error('Migration ledger binding mismatch.')
      if(!transfer.challengeId)return {state:intent.state==='authorized' && !intent.transactionHash && transfer.state==='reserved' && !transfer.transactionHash && transfer.requestFingerprint && io.challengeFingerprint?.(row,transfer.idempotencyKey)===transfer.requestFingerprint ? 'recovery_required' as const : 'needs_review' as const}
      const proof = await io.verifyReceipt(row, transfer)
      if (!proof) {
        const previouslyExpired=intent.state==='expired' && intent.failureCode==='MIGRATION_APPROVAL_EXPIRED'
        const state=(intent.state==='authorized'||previouslyExpired) && !intent.transactionHash && !transfer.transactionHash && io.inspectChallenge ? await io.inspectChallenge(row,transfer.challengeId) : 'pending' as const
        if(state!=='expired')return {state}
        if(transfer.state!=='reserved' || transfer.units!==row.units || !transfer.requestFingerprint || !io.challengeFingerprint || io.challengeFingerprint(row,transfer.idempotencyKey)!==transfer.requestFingerprint || !io.verifyExpiry || !io.invalidateFeeQuote)throw new Error('The expired approval needs a verified transfer review before it can be retired.')
        const check=await io.verifyExpiry(snapshot,row,transfer,intent.createdAt), age=io.now()-check.checkedAt
        if(check.revision!==context.revision || !Number.isFinite(age) || age<0 || age>30_000 || !check.providerExpired || !check.ownershipVerified || !check.noPendingOperations || check.sourceUnits!==row.units)throw new Error('The approval expired, but transfer activity or the balance still needs reconciliation. No replacement transfer has been created.')
        // Invalidate the old fee before releasing the reservation. A subsequent
        // start still requires a new quote, fresh preflight and user approval.
        await io.invalidateFeeQuote(context.userId,context.network)
        const expired=previouslyExpired?intent:await io.ledger.update({ownerId:context.userId,intentId:intent.id,state:'expired',expectedState:'authorized',failureCode:'MIGRATION_APPROVAL_EXPIRED'})
        if(expired.state!=='expired' || expired.failureCode!=='MIGRATION_APPROVAL_EXPIRED' || expired.transactionHash)throw new Error('Migration ledger changed during expiry review.')
        await io.mutate(context.userId,current=>{
          const {plan}=owned(current,context), entry=plan.transfers[context.network]
          if(!entry || entry.executionId!==transfer.executionId || entry.challengeId!==transfer.challengeId || entry.idempotencyKey!==transfer.idempotencyKey || entry.requestFingerprint!==transfer.requestFingerprint || entry.state!=='reserved' || entry.transactionHash)throw new Error('Migration reservation changed during expiry review.')
          const transfers={...plan.transfers};delete transfers[context.network]
          return {...plan,phase:Object.keys(transfers).length?'transferring':'review',transfers,expiredTransfers:[...(plan.expiredTransfers??[]),{network:context.network,idempotencyKey:entry.idempotencyKey,executionId:entry.executionId!,challengeId:entry.challengeId!,requestFingerprint:entry.requestFingerprint!,units:entry.units,expiredAt:io.now()}]}
        })
        return {state:'review_required' as const}
      }
      if (!/^0x[0-9a-f]{64}$/i.test(proof.transactionHash) || !Number.isFinite(proof.confirmedAt) || proof.confirmedAt < Math.floor(intent.createdAt / 1000) * 1000 || proof.confirmedAt > io.now()) throw new Error('Invalid migration receipt.')
      if ((transfer.transactionHash && transfer.transactionHash.toLowerCase() !== proof.transactionHash.toLowerCase()) || (intent.transactionHash && intent.transactionHash.toLowerCase() !== proof.transactionHash.toLowerCase())) throw new Error('Migration receipt changed.')
      if (intent.state === 'authorized') await io.ledger.update({ ownerId: context.userId, intentId: intent.id, state: 'submitted', expectedState: 'authorized', transactionHash: proof.transactionHash })
      await io.ledger.update({ ownerId: context.userId, intentId: intent.id, state: 'completed', transactionHash: proof.transactionHash })
      await io.mutate(context.userId, current => {
        const { plan } = owned(current, context)
        const entry = plan.transfers[context.network]
        if (!entry || entry.executionId !== intent.id || entry.idempotencyKey !== transfer.idempotencyKey) throw new Error('Migration reservation changed.')
        if (entry.transactionHash && entry.transactionHash.toLowerCase() !== proof.transactionHash.toLowerCase()) throw new Error('Migration receipt changed.')
        return { ...plan, transfers: { ...plan.transfers, [context.network]: { ...entry, state: 'confirmed', transactionHash: proof.transactionHash, confirmedAt: proof.confirmedAt } } }
      })
      return { state: 'confirmed' as const }
    },
  }
}

// Activation additionally requires fresh zero balances/asset checks and one database
// transaction for all links plus completion. This predicate alone never activates.
export function migrationTransfersConfirmed(plan: MigrationPlan) {
  const additional = plan.scope === 'additional' || plan.scope === 'additional-recovery'
  const shape = additional ? plan.rows.length === 1 && ['ethereum','polygon'].includes(plan.rows[0].network) : plan.rows.length === 3 && ['base','arbitrum','arc'].every(n=>plan.rows.some(r=>r.network===n))
  return shape && new Set(plan.rows.map(row => row.network)).size === plan.rows.length && plan.rows.every(row => {
    if (row.units === '0') return true
    const transfer = plan.transfers[row.network]
    return Boolean(transfer && transfer.units === row.units && transfer.state === 'confirmed' && transfer.executionId && transfer.challengeId && /^0x[0-9a-f]{64}$/i.test(transfer.transactionHash ?? '') && Number.isFinite(transfer.confirmedAt) && transfer.confirmedAt! > 0)
  })
}
