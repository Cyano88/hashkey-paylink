import { createPocketBillsStore } from './bills-store.js'
import { readVtpassPhase0Config } from '../vtpass-config.js'
import { paymentExecutionRepository } from './payment-execution-intents.js'
import { pocketRequestRepository } from './request-store.js'
import type { PocketFundingReference } from '../../src/pocket/lib/pocketPaymentFunding.js'
import type { PocketActivityRow } from '../../src/pocket/models/pocketActivity.js'
export async function resolvePocketFundingPayment(owner: string, value: unknown): Promise<{key:string;payment:PocketActivityRow}|null> {
 if(value==null)return null
 const ref=value as PocketFundingReference
 if(!ref || typeof ref.id!=='string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(ref.id))throw Object.assign(new Error('Payment funding reference is invalid.'),{status:400})
 const base={txHash:'',chain:'base',payer:'Pocket wallet',direction:'out' as const,paycrestStatus:'processing',ts:Date.now()}
 if(ref.kind==='bills'){
  const bill=await createPocketBillsStore({config:readVtpassPhase0Config()}).getOwnedIntent(owner,ref.id)
  return {key:'bills:'+bill.id,payment:{...base,eventId:'pocket-bill:'+bill.id,source:'bills',merchantId:bill.id,memo:bill.serviceName,activityLabel:bill.serviceName,amount:bill.amountUsdc,amountNgn:bill.international?.deliveryAmount||bill.amountNgn,fiatCurrency:bill.international?.deliveryCurrency||'NGN',billCategory:bill.category,billProvider:bill.serviceName,billTarget:bill.phone,settlementType:'bill_payment',ts:bill.createdAt}}
 }
 if(ref.kind==='bank-withdraw'){
  const intent=(await paymentExecutionRepository.listOwned(owner,['bank_payout'])).find(item=>item.resourceId===ref.id)
  if(!intent)throw Object.assign(new Error('Payment funding reference was not found.'),{status:404})
  return {key:'bank-withdraw:'+ref.id,payment:{...base,eventId:'pocket-bank-payout:'+intent.id,source:'bank-withdraw',providerReference:ref.id,memo:'Bank transfer',activityLabel:intent.metadata.accountName||'Bank transfer',amount:intent.amount,amountNgn:intent.metadata.amountNgn,fiatCurrency:intent.metadata.fiatCurrency==='UGX'?'UGX':'NGN',recipient:intent.metadata.accountName,settlementType:'instant_fiat',ts:intent.createdAt}}
 }
 if(ref.kind==='request'){
  const request=await pocketRequestRepository.getFor(owner,ref.id)
  if(request.recipientId!==owner)throw Object.assign(new Error('Only the payer can fund this request.'),{status:403})
  return {key:'request:'+request.eventId,payment:{...base,eventId:request.eventId,source:'request',memo:request.title,activityLabel:'Request payment',amount:request.amount,recipient:request.senderName,chain:request.network==='multi'?'base':request.network,ts:request.createdAt}}
 }
 throw Object.assign(new Error('Payment funding type is invalid.'),{status:400})
}
