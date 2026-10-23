import { migrationAssetsAccountedFor } from './wallet-migration-scope.js'
import {holdMigrationWallets,withMigrationOperation,releaseUnstartedMigration} from './wallet-migration-guard.js'
import { readLegacyPaymentWallets } from './wallet-migration-history.js'
import { randomUUID } from 'node:crypto'
import { parseUnits } from 'viem'
import { readDurableJson, writeDurableJson, mutateDurableJson, deleteDurableJson } from '../render-durable-store.js'
import { circleLinkKey, readCircleLink } from '../privy-circle-link.js'
import { readFreshMigrationUsdcUnits } from '../evm-balance.js'
import { consumePocketPaymentApproval } from './payment-security.js'
import { paymentExecutionRepository } from './payment-execution-intents.js'
import { createMigrationExecutor, migrationExecutionStorage } from './wallet-migration-execution.js'
import { createMigrationProvider, migrationChallengeFingerprint } from './wallet-migration-provider.js'
import { verifyMigrationReceipt } from './wallet-migration-receipt.js'
import type { MigrationPlan } from './wallet-migration-plan.js'
type Row = MigrationPlan['rows'][number]
export type MigrationFeeQuote = { id:string; userId:string; revision:string; network:Row['network']; units:string; sourceId:string; targetId:string; amount:string; asset:'USDC'|'ETH'; expiresAt:number }
const quoteKey=(owner:string,network:Row['network'])=>'pocket:migration-fee:v1:'+owner+':'+network
export function feeQuoteMatches(quote: MigrationFeeQuote | undefined, plan: MigrationPlan, row: Row, fee: {amount:string;asset:string}, now=Date.now()) {
  if (!quote || quote.userId!==plan.userId || quote.revision!==plan.revision || quote.network!==row.network || quote.units!==row.units || quote.sourceId!==row.source.walletId || quote.targetId!==row.target.walletId || !Number.isFinite(quote.expiresAt) || quote.expiresAt<=now || quote.asset!==fee.asset) return false
  if (!/^\d+(?:\.\d{1,18})?$/.test(quote.amount) || !/^\d+(?:\.\d{1,18})?$/.test(fee.amount)) return false
  return parseUnits(fee.amount,18)<=parseUnits(quote.amount,18)
}
export async function prepareMigrationFeeQuote(plan: MigrationPlan, row: Row, userToken: string) {
  if(!plan.rows.includes(row) || plan.transfers[row.network]) throw new Error('Reconcile the existing migration before reviewing a new fee.')
  const fee=await createMigrationProvider(userToken).estimate(row)
  const quote:MigrationFeeQuote={id:randomUUID(),userId:plan.userId,revision:plan.revision,network:row.network,units:row.units,sourceId:row.source.walletId,targetId:row.target.walletId,amount:fee.amount,asset:fee.asset,expiresAt:Date.now()+60_000}
  await writeDurableJson(quoteKey(plan.userId,row.network),quote)
  return quote
}
// Called only after the HTTP layer verifies Privy. The supplied approval is a
// one-use Pocket security token, not a client boolean or a Circle session token.
export function createPocketMigrationExecutor(input:{ userId:string; userToken:string; approvalToken:string; feeQuoteId:string; legacyRecovery?:boolean }) {
  const provider=createMigrationProvider(input.userToken)
  const executor=createMigrationExecutor({
    ...migrationExecutionStorage,
    ...(input.legacyRecovery ? {mutate:(userId:string,fn:(current:MigrationPlan|undefined)=>MigrationPlan)=>mutateDurableJson<MigrationPlan>('pocket:wallet-recovery-plan:v1:'+userId,fn)} : {}),
    approve: context=>context.userId===input.userId ? consumePocketPaymentApproval(input.approvalToken,input.userId) : Promise.resolve(false),
    preflight: async(plan,row)=>{
      const checkedAt=Date.now()
      if(plan.userId!==input.userId) throw new Error('Migration owner mismatch.')
      const link=await readCircleLink(circleLinkKey(input.userId,row.network,'payment'))
      const expectedLink=input.legacyRecovery?row.target:row.source
      if(!link || link.privyUserId!==input.userId || link.chain!==row.network || (link.purpose??'payment')!=='payment' || link.circleWalletId!==expectedLink.walletId || link.circleWalletAddress.toLowerCase()!==expectedLink.address.toLowerCase()) throw new Error('Current migration wallet changed.')
      if(input.legacyRecovery) {
        const legacy=await readLegacyPaymentWallets(input.userId)
        if(!legacy.some(wallet=>wallet.network===row.network&&wallet.walletId===row.source.walletId&&wallet.walletAddress.toLowerCase()===row.source.address.toLowerCase())) throw new Error('Previous wallet ownership could not be verified.')
      }
      const [inventory,noPending,units,fee,quote,intents]=await Promise.all([
        provider.inventory(row),provider.noPending(row),readFreshMigrationUsdcUnits(row.network,row.source.address as `0x${string}`),provider.estimate(row),
        readDurableJson<MigrationFeeQuote>(quoteKey(input.userId,row.network)),
        paymentExecutionRepository.listOwned(input.userId,undefined,['prepared','authorized','submitted','processing','needs_review']),
      ])
      const assetsAccountedFor=await migrationAssetsAccountedFor(plan,inventory)
      if(!assetsAccountedFor)throw new Error('Migration inventory could not be verified. Try again.')
      const otherPending=intents.some(intent=>intent.metadata.migrationRevision!==plan.revision && (intent.sourceNetwork===row.network || intent.settlementNetwork===row.network))
      return {revision:plan.revision,checkedAt,ownershipVerified:true,noPendingOperations:noPending&&!otherPending,assetsAccountedFor,feeApproved:quote?.id===input.feeQuoteId && feeQuoteMatches(quote,plan,row,fee),sourceUnits:units.toString()}
    },
    challengeFingerprint:migrationChallengeFingerprint,
    createChallenge:(row,id)=>provider.createChallenge(row,id),
    inspectChallenge:(row,id)=>provider.inspectChallenge(row,id),
    invalidateFeeQuote:(userId,network)=>deleteDurableJson(quoteKey(userId,network)),
    verifyExpiry:async(plan,row,transfer,createdAt)=>{
      const checkedAt=Date.now()
      if(plan.userId!==input.userId || !Number.isFinite(createdAt) || createdAt<=0 || createdAt>checkedAt)throw new Error('Migration expiry review owner or time does not match.')
      const link=await readCircleLink(circleLinkKey(input.userId,row.network,'payment'))
      const expected=input.legacyRecovery?row.target:row.source
      const ownershipVerified=!!link && link.privyUserId===input.userId && link.chain===row.network && (link.purpose??'payment')==='payment' && link.circleWalletId===expected.walletId && link.circleWalletAddress.toLowerCase()===expected.address.toLowerCase()
      const [state,noActivity,units]=await Promise.all([provider.inspectChallenge(row,transfer.challengeId!),provider.noPending(row,createdAt-60_000),readFreshMigrationUsdcUnits(row.network,row.source.address as Parameters<typeof readFreshMigrationUsdcUnits>[1])])
      return {revision:plan.revision,checkedAt,providerExpired:state==='expired',ownershipVerified,noPendingOperations:noActivity,sourceUnits:units.toString()}
    },
    verifyReceipt:(row,transfer)=>verifyMigrationReceipt(row,transfer,{resolveChallenge:id=>provider.resolveChallenge(row,id)}),
  })
  return {...executor,reconcile:async(context:Parameters<typeof executor.reconcile>[0],_snapshot:MigrationPlan)=>withMigrationOperation(input.userId,async()=>{
    const current=await readDurableJson<MigrationPlan>((input.legacyRecovery?'pocket:wallet-recovery-plan:v1:':'pocket:wallet-migration-plan:v1:')+input.userId)
    if(!current || current.userId!==input.userId || context.userId!==input.userId || current.revision!==context.revision)throw new Error('Migration review changed.')
    if(!current.transfers[context.network])return {state:'review_required' as const}
    return executor.reconcile(context,current)
  }),start:async(context:Parameters<typeof executor.start>[0],plan:MigrationPlan)=>{
    if(input.legacyRecovery)return executor.start(context,plan)
    return withMigrationOperation(input.userId,async()=>{
      await holdMigrationWallets(plan)
      try{return await executor.start(context,plan)}
      finally{await releaseUnstartedMigration(plan)}
    })
  }}
}
