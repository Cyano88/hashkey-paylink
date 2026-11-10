import {createMarketplaceBankRuntime} from './bank-runtime.js'
import {createPublicClient,http} from 'viem'
import {base} from 'viem/chains'
import {readDurableJson,mutateDurableJson,hasRenderDurableStore} from '../render-durable-store.js'
import {marketplaceStorage} from './application.js'
import {createMarketplaceCollectionRuntime,createMarketplaceRefundRuntime,createMarketplaceWalletRuntime,readMarketplaceRuntimeConfig} from './runtime.js'
import {createMarketplaceGasQuotes} from './gas-quotes.js'
import {requireMarketplaceGasCoverage} from './gas-coverage.js'
import {createMarketplaceWebhooks,marketplaceWebhookTransport} from './webhooks.js'
import {createMarketplaceBackingCheck} from './backing.js'
import type {MarketplaceStore} from './repository.js'

export function marketplaceOperationalSnapshot(s:MarketplaceStore|undefined,now=Date.now()){
 const events=(s?.books||[]).flatMap(b=>[...(b.walletEvents||[]),...(b.refundEvents||[]),...(b.bankEvents||[])])
 const expiredPayoutQuotes=(s?.books||[]).reduce((n,b)=>n+(b.walletReservations||[]).filter(r=>r.quote&&r.quote.expiresAt<=now&&b.operations.some(o=>o.id===r.operationId&&o.status==='reserved')).length,0)
 return {expiredPayoutQuotes,checkedAt:now,books:s?.books.length||0,unknownOperations:(s?.books||[]).reduce((n,b)=>n+b.operations.filter(o=>o.status==='unknown').length,0),webhooksPending:events.filter(e=>['pending','delivering'].includes(e.delivery)).length,webhooksDead:events.filter(e=>e.delivery==='dead').length,oldestPendingWebhookAt:Math.min(now,...events.filter(e=>['pending','delivering'].includes(e.delivery)).map(e=>e.createdAt))}
}
/** Independent webhook drain: a paused payout must not block notification retries.
 * Activation excludes historical pilot events unless an operator explicitly approves replay. */
export async function drainMarketplaceWebhooks(projectIds:string[],startedAt:number,d={storage:marketplaceStorage,notify:marketplaceWebhookTransport}){
 const outbox=createMarketplaceWebhooks({...d.storage,notifyMarketplace:d.notify})
 let delivered=0
 const state=await d.storage.read()
 for(const projectId of projectIds){
  // Filter before limiting, so excluded historical events cannot starve new events.
  const candidates=(state?.books||[]).filter(b=>b.plan.projectId===projectId).flatMap(b=>[...(b.walletEvents||[]),...(b.refundEvents||[]),...(b.bankEvents||[])]).filter(e=>(e.createdAt>=startedAt||(e.replayApprovedAt||0)>=startedAt)&&(e.delivery==='pending'&&(e.nextAttemptAt||0)<=d.storage.now()||e.delivery==='delivering'&&(e.leaseUntil||Infinity)<=d.storage.now())).sort((a,b)=>a.createdAt-b.createdAt).slice(0,10)
  for(const event of candidates){try{if((await outbox.deliver(projectId,event.paymentId,event.id)).status==='delivered')delivered++}catch{/* Durable outbox retains delivery state. */}}
 }
 return {delivered}
}
let running=false,timer:ReturnType<typeof setInterval>|undefined,lastBackingAt=0
export async function runMarketplaceWorkers(env:NodeJS.ProcessEnv=process.env){
 if(running||!hasRenderDurableStore())return
 const settings=readMarketplaceRuntimeConfig(env)
 if(env.MARKETPLACE_BANK_WORKER_ENABLED!=='true'&&env.MARKETPLACE_MONITOR_ENABLED!=='true'&&env.MARKETPLACE_WEBHOOK_WORKER_ENABLED!=='true'&&env.MARKETPLACE_WALLET_WORKER_ENABLED!=='true'&&env.MARKETPLACE_REFUND_WORKER_ENABLED!=='true')return
 running=true
 try{
  const chain=createPublicClient({transport:http(env.PRIVATE_RPC_URL||base.rpcUrls.default.http[0],{timeout:10000,retryCount:0})}),errors:string[]=[]
  const backing=createMarketplaceBackingCheck({read:marketplaceStorage.read,chain,holding:{id:settings.holdingId,revision:settings.holdingRevision,address:settings.config.treasuryAddress,billsAddress:settings.billsAddress}})
  if(env.MARKETPLACE_WALLET_WORKER_ENABLED==='true'||env.MARKETPLACE_REFUND_WORKER_ENABLED==='true'){
   try{
    const gas=createMarketplaceGasQuotes({config:settings.config,maximumFeeUnits:env.MARKETPLACE_MAX_NETWORK_FEE_UNITS||'',providerSurchargeBps:Number(env.MARKETPLACE_PROVIDER_SURCHARGE_BPS??'NaN')})
    if(env.MARKETPLACE_WALLET_WORKER_ENABLED==='true'){try{
     const runtime=createMarketplaceWalletRuntime({env,chain,verifyFees:async transfer=>{
      if(!transfer.quote)throw Error('Accepted fee quote required.')
      const fresh=await gas.networkFee(transfer.recipient,transfer.amountUnits)
      if(fresh>BigInt(transfer.quote.networkFeeUnits))throw Error('Fee quote no longer covers execution.')
      const p=await requireMarketplaceGasCoverage(settings,transfer.projectId,fresh.toString(),chain)
      return {feePolicyId:p.id,expiresAt:Math.min(p.expiresAt,transfer.quote.expiresAt,Date.now()+30000),feesCoveredOutsideAllocation:true,additionalTokenDebitUnits:'0'}
     }})
     for(const projectId of settings.projectIds)await runtime.drain(projectId,5)
    }catch{errors.push('wallet_execution_deferred')}}
    if(env.MARKETPLACE_REFUND_WORKER_ENABLED==='true'){try{
     const collections=createMarketplaceCollectionRuntime({env,chain})
     const runtime=createMarketplaceRefundRuntime({env,adapters:{chain,verifyBacking:backing,resolveRefundCollection:collections.resolveRefundCollection,quoteRefundFees:async r=>{const q=await gas.refund(r);await requireMarketplaceGasCoverage(settings,r.collection.projectId,q.networkFeeUnits,chain);return q},authorizeRefund:async r=>{const fee=await gas.networkFee(r.collection.payerWallet,r.amountUnits);await requireMarketplaceGasCoverage(settings,r.collection.projectId,fee.toString(),chain);return true}}})
     for(const projectId of settings.projectIds)await runtime.drain(projectId,5)
    }catch{errors.push('refund_execution_deferred')}}
   }catch{errors.push('execution_deferred')}
  }
  if(env.MARKETPLACE_BANK_WORKER_ENABLED==='true'){try{const bank=createMarketplaceBankRuntime(env,chain);for(const projectId of settings.projectIds){if((await bank.drain(projectId)).deferred)errors.push('bank_payout_deferred')}}catch{errors.push('bank_execution_deferred')}}
  if(env.MARKETPLACE_WEBHOOK_WORKER_ENABLED==='true'){
   try{const activation=await mutateDurableJson<{startedAt:number}>('hashpaylink:marketplace-webhook-worker-activation:v1',s=>s||{startedAt:Date.now()});await drainMarketplaceWebhooks(settings.projectIds,activation.startedAt)}catch{errors.push('webhook_drain_deferred')}
  }
  const snapshot={...marketplaceOperationalSnapshot(await marketplaceStorage.read()),errors}
  if(env.MARKETPLACE_MONITOR_ENABLED==='true'&&Date.now()-lastBackingAt>60000){
   lastBackingAt=Date.now()
   try{const result=await backing();await mutateDurableJson('hashpaylink:marketplace-backing-monitor:v1',()=>({checkedAt:Date.now(),backed:result.backed,shortfallUnits:result.shortfallUnits,blockers:result.blockers}));if(!result.backed)errors.push('backing_check_blocked')}catch{errors.push('backing_check_unavailable')}
  }
  await mutateDurableJson('hashpaylink:marketplace-worker-health:v1',()=>snapshot)
  if(errors.length||snapshot.unknownOperations||snapshot.webhooksDead||snapshot.expiredPayoutQuotes)console.warn('[marketplace-health]',JSON.stringify(snapshot))
 }finally{running=false}
}
export function startMarketplaceWorkers(){if(timer)return;timer=setInterval(()=>void runMarketplaceWorkers().catch(()=>console.warn('[marketplace-health] worker_tick_failed')),30000);timer.unref()}
