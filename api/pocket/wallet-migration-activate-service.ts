import { verifyMigrationReceipt, verifyMigrationActivationReceipts } from './wallet-migration-receipt.js'
import { migrationAssetsAccountedFor } from './wallet-migration-scope.js'
import { activateMigration } from './wallet-migration-activation.js'
import { createMigrationProvider } from './wallet-migration-provider.js'
import { readFreshMigrationUsdcUnits } from '../evm-balance.js'
import { paymentExecutionRepository } from './payment-execution-intents.js'
import { holdMigrationWallets, withMigrationOperation, releaseUnstartedMigration } from './wallet-migration-guard.js'
import type { MigrationPlan } from './wallet-migration-plan.js'
export async function activateVerifiedMigration(plan:MigrationPlan,userToken:string) {
 return withMigrationOperation(plan.userId,async()=>{
  await holdMigrationWallets(plan)
  try {
   return await activateMigration(plan,{verify:async current=>{
    const checkedAt=Date.now(),provider=createMigrationProvider(userToken)
    const [checks,intents,receiptsCurrent]=await Promise.all([
     Promise.all(current.rows.map(async row=>{
      const [units,inventory,pending]=await Promise.all([readFreshMigrationUsdcUnits(row.network,row.source.address as `0x${string}`),provider.inventory(row),provider.noPending(row,undefined,current.transfers[row.network]?.transactionHash)])
      return {empty:units===0n,accounted:await migrationAssetsAccountedFor(current,inventory),noPending:pending}
     })),
     paymentExecutionRepository.listOwned(current.userId,undefined,['prepared','authorized','submitted','processing','needs_review']),
     verifyMigrationActivationReceipts(current,(row,transfer)=>verifyMigrationReceipt(row,transfer,{resolveChallenge:id=>provider.resolveChallenge(row,id)})),
    ])
    if (!receiptsCurrent) throw new Error('Migration receipts changed or are still awaiting confirmation. Check progress before activation.')
    return {revision:current.revision,checkedAt,oldBalancesEmpty:checks.every(c=>c.empty),assetsAccountedFor:checks.every(c=>c.accounted),noPendingOperations:checks.every(c=>c.noPending)&&!intents.some(i=>current.rows.some(r=>i.sourceNetwork===r.network||i.settlementNetwork===r.network)),legacyAccessReady:true}
   }})
  } catch(error){await releaseUnstartedMigration(plan);throw error}
 })
}
