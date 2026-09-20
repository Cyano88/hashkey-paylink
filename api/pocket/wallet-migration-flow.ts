import { activateVerifiedMigration } from './wallet-migration-activate-service.js'
﻿import type { Request, Response } from 'express'
import { formatUnits } from 'viem'
import { verifiedPrivyUser, readCircleLink, circleLinkKey } from '../privy-circle-link.js'
import { readDurableJson } from '../render-durable-store.js'
import { readPocketWalletUpdate } from './wallet-update-state.js'
import { migrationActivationComplete } from './wallet-update-status.js'
import { createPocketMigrationExecutor, prepareMigrationFeeQuote } from './wallet-migration-service.js'
import { migrationTransfersConfirmed } from './wallet-migration-execution.js'
import type { MigrationPlan } from './wallet-migration-plan.js'
import type { PocketMigrationSnapshot } from '../../src/pocket/lib/pocketMigrationFlow.js'
type Dependencies={
 verify:typeof verifiedPrivyUser;read(userId:string):Promise<MigrationPlan|undefined>;enabled():boolean
 completed(userId:string):Promise<boolean>;quote:typeof prepareMigrationFeeQuote;executor:typeof createPocketMigrationExecutor
 activate(plan:MigrationPlan,userToken:string):Promise<unknown>
}
export function migrationSnapshot(plan:MigrationPlan,enabled:boolean,completed=false):PocketMigrationSnapshot {
 return {enabled,revision:plan.revision,phase:completed?'completed':migrationTransfersConfirmed(plan)?'ready-to-activate':Object.keys(plan.transfers).length?'pending':'review',rows:plan.rows.map(row=>({network:row.network,amount:formatUnits(BigInt(row.units),6),state:row.units==='0'?'empty':plan.transfers[row.network]?.state==='confirmed'?'confirmed':plan.transfers[row.network]?'pending':'ready'}))}
}
const defaults:Dependencies={
 verify:verifiedPrivyUser,read:userId=>readDurableJson<MigrationPlan>('pocket:wallet-migration-plan:v1:'+userId),
 // Deliberately unavailable until the release audit covers live fee treatment,
 // outgoing-payment coordination and the old-wallet recovery UI.
 enabled:()=>false,
 completed:async userId=>{
  const record=await readPocketWalletUpdate(userId)
  const links=await Promise.all((['base','arbitrum','arc'] as const).map(n=>readCircleLink(circleLinkKey(userId,n,'payment'))))
  return migrationActivationComplete(userId,record,links)
 },
 quote:prepareMigrationFeeQuote,executor:createPocketMigrationExecutor,
 activate:activateVerifiedMigration,
}
export function createMigrationFlowHandler(overrides:Partial<Dependencies>={}) {
 const io={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed.'})
  try {
   const identity=await io.verify(req)
   const body=req.body
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['action','network','revision','userToken','feeQuoteId'].includes(key)))return res.status(400).json({ok:false,error:'Invalid migration request.'})
   const {action,network,revision,userToken,feeQuoteId}=body
   if(!['status','quote','start','resume','recover','reconcile','activate'].includes(action))return res.status(400).json({ok:false,error:'Invalid migration action.'})
   const plan=await io.read(identity.userId)
   if(!plan||plan.userId!==identity.userId)return res.status(409).json({ok:false,error:'Review your wallet balances first.'})
   const completed=await io.completed(identity.userId)
   if(action==='status'||completed)return res.json({ok:true,snapshot:migrationSnapshot(plan,io.enabled(),completed)})
   if(revision!==plan.revision)return res.status(409).json({ok:false,error:'Your migration review changed. Refresh it before continuing.'})
   if(typeof userToken!=='string'||!userToken||userToken.length>8000)return res.status(400).json({ok:false,error:'Reconnect your Pocket wallet.'})
   const row=plan.rows.find(row=>row.network===network)
   if(action!=='activate'&&!row)return res.status(400).json({ok:false,error:'Choose a valid migration network.'})
   if(action==='quote') {
    const quote=await io.quote(plan,row!,userToken)
    return res.json({ok:true,quote:{id:quote.id,revision:quote.revision,network:quote.network,amount:quote.amount,asset:quote.asset,expiresAt:quote.expiresAt,transferAmount:formatUnits(BigInt(row!.units),6),source:row!.source,target:row!.target}})
   }
   if((action==='start'||action==='resume'||action==='recover')&&!io.enabled())return res.status(503).json({ok:false,error:'Balance transfers are not available yet.'})
   if(action==='activate') {
    if(!io.enabled()||!migrationTransfersConfirmed(plan))return res.status(409).json({ok:false,error:'Wallet activation is not ready.'})
    await io.activate(plan,userToken)
   } else {
    const executor=io.executor({userId:identity.userId,userToken,approvalToken:String(req.headers['x-pocket-payment-approval']??''),feeQuoteId:typeof feeQuoteId==='string'?feeQuoteId:''})
    const context={userId:identity.userId,revision:plan.revision,network:row!.network}
    if(action==='start'||action==='resume'||action==='recover') {
     const result=await executor[action](context,plan)
     return res.json({ok:true,...result})
    }
    const result=await executor.reconcile(context,plan)
    const current=await io.read(identity.userId)
    if(!current||current.userId!==identity.userId)throw Error('Migration state is unavailable.')
    return res.json({ok:true,state:result.state,...((result.state==='approval_required'||result.state==='recovery_required')?{resume:{action:result.state==='recovery_required'?'recover':'resume',network:row!.network,amount:formatUnits(BigInt(row!.units),6),source:row!.source.address,target:row!.target.address}}:{}),snapshot:migrationSnapshot(current,io.enabled(),await io.completed(identity.userId))})
   }
   const current=await io.read(identity.userId)
   if(!current||current.userId!==identity.userId)throw Error('Migration state is unavailable.')
   return res.json({ok:true,snapshot:migrationSnapshot(current,io.enabled(),await io.completed(identity.userId))})
  } catch(error) {
   const status=Number((error as {status?:number}).status)||409
   return res.status(status>=400&&status<600?status:500).json({ok:false,error:status>=500?'Migration is temporarily unavailable. Check progress before trying again.':error instanceof Error?error.message:'Migration could not continue.'})
  }
 }
}
export default createMigrationFlowHandler()
