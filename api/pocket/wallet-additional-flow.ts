import type {Request,Response} from 'express'
import {createHash,randomUUID} from 'node:crypto'
import {createMigrationFlowHandler} from './wallet-migration-flow.js'
import {createPocketMigrationExecutor} from './wallet-migration-service.js'
import {readAdditionalMigration,activateAdditionalMigration} from './wallet-additional-migration.js'
import {additionalNetworks,type AdditionalNetwork} from './wallet-additional-alignment.js'
import {circleLinkKey,readCircleLink,verifiedPrivyUser} from '../privy-circle-link.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {readFreshMigrationUsdcUnits} from '../evm-balance.js'
import {readLegacyPaymentWallets} from './wallet-migration-history.js'
import {migrationTransfersConfirmed} from './wallet-migration-execution.js'
import {createMigrationProvider} from './wallet-migration-provider.js'
import {retainLegacyRecovery} from './wallet-migration-recovery.js'
import type {MigrationPlan} from './wallet-migration-plan.js'
export default async function handler(req:Request,res:Response) {
 res.setHeader('Cache-Control','no-store')
 const network=req.query.network as AdditionalNetwork,recovery=req.query.recovery==='true'
 if(!additionalNetworks.includes(network))return res.status(400).json({ok:false,error:'Choose Ethereum or Polygon.'})
 const recoveryKey=(userId:string)=>'pocket:additional-recovery:v1:'+userId+':'+network
 const read=(userId:string)=>recovery?readDurableJson<MigrationPlan>(recoveryKey(userId)):readAdditionalMigration(userId,network)
 if(recovery&&req.body?.action==='review') {
  try {
   if(req.method!=='POST'||Object.keys(req.body).some(k=>!['action','network','userToken'].includes(k))||req.body.network!==network||typeof req.body.userToken!=='string'||!req.body.userToken||req.body.userToken.length>8000)return res.status(400).json({ok:false,error:'Reconnect your Pocket wallet.'})
   const {userId}=await verifiedPrivyUser(req),existing=await read(userId)
   if(existing&&Object.keys(existing.transfers).length&&!migrationTransfersConfirmed(existing))return res.json({ok:true,pending:true})
   const legacy=await readLegacyPaymentWallets(userId),source=legacy.find(w=>w.network===network),link=await readCircleLink(circleLinkKey(userId,network))
   if(!source||!link||link.privyUserId!==userId||(link.purpose??'payment')!=='payment'||source.walletId===link.circleWalletId)throw Error('Previous wallet ownership is unavailable.')
   const units=await readFreshMigrationUsdcUnits(network,source.walletAddress as Parameters<typeof readFreshMigrationUsdcUnits>[1])
   if(units===0n)return res.json({ok:true,empty:true})
   const row={network,source:{walletId:source.walletId,address:source.walletAddress},target:{walletId:link.circleWalletId,address:link.circleWalletAddress},units:units.toString()},attemptId=randomUUID()
   const plan:MigrationPlan={version:1,scope:'additional-recovery',userId,attemptId,revision:createHash('sha256').update(JSON.stringify({userId,attemptId,row})).digest('hex'),phase:'review',reviewedAt:Date.now(),rows:[row],transfers:{}}
   await createMigrationProvider(req.body.userToken).own(row)
   await mutateDurableJson<MigrationPlan>(recoveryKey(userId),current=>retainLegacyRecovery(current,plan))
   return res.json({ok:true})
  }catch(error){return res.status(Number((error as {status?:number}).status)||409).json({ok:false,error:error instanceof Error?error.message:'Previous wallet review is unavailable.'})}
 }
 return createMigrationFlowHandler({
  read,
  completed:async userId=>{
   const plan=await read(userId),link=await readCircleLink(circleLinkKey(userId,network))
   return !!plan&&plan.userId===userId&&plan.scope===(recovery?'additional-recovery':'additional')&&(recovery?migrationTransfersConfirmed(plan):plan.phase==='confirmed')&&plan.rows.length===1&&plan.rows[0].network===network&&!!link&&link.circleWalletId===plan.rows[0].target.walletId&&link.circleWalletAddress.toLowerCase()===plan.rows[0].target.address.toLowerCase()
  },
  executor:input=>createPocketMigrationExecutor({...input,additionalNetwork:network,legacyRecovery:recovery}),
  activate:recovery?async()=>{throw Error('Recovery does not replace wallet links.')}:activateAdditionalMigration,
 })(req,res)
}
