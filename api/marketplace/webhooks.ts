import {randomUUID} from 'node:crypto'
import {dispatchDeveloperWebhook,type DeveloperWebhookDispatchResult} from '../developer-projects.js'
import {marketplaceReference} from './beneficiaries.js'
import type {MarketplaceStore} from './repository.js'
import type {MarketplaceBankEvent} from './bank-reconciliation.js'
import type {MarketplaceWalletEvent} from './wallet-reconciliation.js'
import type {MarketplaceRefundEvent} from './refund-execution.js'
type PayoutEvent=MarketplaceBankEvent|MarketplaceWalletEvent|MarketplaceRefundEvent

// Explicit opt-in adapter; never installed by the repository defaults.
// Reuses signed requests, project-owned URLs/secrets and public-HTTPS/DNS protections.
export const marketplaceWebhookTransport=dispatchDeveloperWebhook
export type MarketplaceDeliveryAttempt={token:string;startedAt:number;finishedAt?:number;result?:'delivered'|'failed'|'skipped';responseStatus?:number}
export type MarketplaceDeliveryState={attempts?:number;nextAttemptAt?:number;leaseUntil?:number;claimToken?:string;deliveredAt?:number;deliveryAttempts?:MarketplaceDeliveryAttempt[]}
type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(store:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;notifyMarketplace?:typeof dispatchDeveloperWebhook}
const delays=[30_000,120_000,600_000,1_800_000,3_600_000,7_200_000,21_600_000]
const maxAttempts=8,leaseMs=60_000
function locate(store:MarketplaceStore,projectId:string,paymentId:string,eventId:string){
 const book=store.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
 const event=[...(book?.bankEvents||[]),...(book?.walletEvents||[]),...(book?.refundEvents||[])].find(e=>e.id===eventId&&e.projectId===projectId&&e.paymentId===paymentId)
 if(!event)throw Error('Marketplace payout event not found.')
 return event
}
function due(event:PayoutEvent,now:number){return event.delivery==='pending'&&(event.nextAttemptAt??0)<=now||event.delivery==='delivering'&&(event.leaseUntil??Infinity)<=now}
function payload(event:PayoutEvent){const common={...('refundNetworkFee' in event&&event.refundNetworkFee?{refundNetworkFee:event.refundNetworkFee}:{}),...('fees' in event&&event.fees?{fees:event.fees}:{}),...('refundId' in event?{refundId:event.refundId}:{}),projectId:event.projectId,paymentId:event.paymentId,operationId:event.operationId,asset:event.asset,currency:event.currency,debitUnits:event.debitUnits};return event.currency==='NGN'?{...common,ngnPaidMinor:event.ngnPaidMinor}:{...common,network:event.network,recipientAmountUnits:event.recipientAmountUnits}}
/** At-least-once delivery. Consumers must deduplicate event IDs and verify signatures on the raw body. */
export function createMarketplaceWebhooks(dependencies:Dependencies){
 const d=dependencies
 return {
  async pending(projectId:string,limit=20){
   marketplaceReference(projectId)
   if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Use a webhook batch size between 1 and 100.')
   return ((await d.read())?.books||[]).filter(b=>b.plan.projectId===projectId).flatMap(b=>[...(b.bankEvents||[]),...(b.walletEvents||[]),...(b.refundEvents||[])]).filter(e=>e.projectId===projectId&&due(e,d.now())).sort((a,b)=>a.createdAt-b.createdAt).slice(0,limit).map(e=>({paymentId:e.paymentId,eventId:e.id}))
  },
  async deliver(projectId:string,paymentId:string,eventId:string){
   for(const id of [projectId,paymentId,eventId])marketplaceReference(id)
   if(!d.notifyMarketplace)throw Error('Marketplace webhook delivery is not configured.')
   const token=randomUUID()
   const claimed=await d.mutate(s=>{
    const event=locate(s,projectId,paymentId,eventId),now=d.now()
    if(!due(event,now))return s
    if((event.attempts??0)>=maxAttempts){event.delivery='dead';delete event.claimToken;delete event.leaseUntil;return s}
    event.delivery='delivering';event.attempts=(event.attempts??0)+1;event.claimToken=token;event.leaseUntil=now+leaseMs
    event.deliveryAttempts=[...(event.deliveryAttempts||[]),{token,startedAt:now}];return s
   })
   const event=structuredClone(locate(claimed,projectId,paymentId,eventId))
   if(event.claimToken!==token)return {eventId,status:event.delivery,attempted:false}
   let outcome:DeveloperWebhookDispatchResult|undefined
   try{outcome=await d.notifyMarketplace(event.projectId,event.type,payload(event),{eventId:event.id,createdAt:new Date(event.createdAt).toISOString()})}catch{/* Never persist raw errors: transports may include URLs, secrets or response bodies. */}
   const delivered=outcome?.status==='sent'&&outcome.eventId===event.id&&Number.isInteger(outcome.responseStatus)&&outcome.responseStatus>=200&&outcome.responseStatus<300
   const saved=await d.mutate(s=>{
    const current=locate(s,projectId,paymentId,eventId)
    // A late response from an expired/replaced worker cannot overwrite the current attempt.
    if(current.delivery!=='delivering'||current.claimToken!==token)return s
    const now=d.now(),attempt=current.deliveryAttempts!.find(a=>a.token===token)!
    attempt.finishedAt=now;attempt.result=delivered?'delivered':outcome?.status==='skipped'?'skipped':'failed'
    if(outcome?.status==='sent'&&Number.isInteger(outcome.responseStatus)&&outcome.responseStatus>=100&&outcome.responseStatus<=599)attempt.responseStatus=outcome.responseStatus
    current.delivery=delivered?'delivered':current.attempts!>=maxAttempts?'dead':'pending'
    if(delivered)current.deliveredAt=now
    else if(current.delivery==='pending')current.nextAttemptAt=now+delays[current.attempts!-1]
    delete current.claimToken;delete current.leaseUntil;return s
   })
   return {eventId,status:locate(saved,projectId,paymentId,eventId).delivery,attempted:true}
  },
 }
}
