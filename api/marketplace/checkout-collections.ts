import {verifyPayerCheckoutTransfer} from '../merchant-checkout-fees.js'
import {getAddress} from 'viem'
import {readVerifiedHostedCheckoutRecord,type CheckoutRecord} from '../hosted-checkouts.js'
import {marketplaceAmountUnits} from '../../src/lib/marketplacePayments.js'
import {marketplaceReference} from './beneficiaries.js'
import type {MarketplaceStore} from './repository.js'
import type {MarketplaceCollectionSession} from './collections.js'

export type MarketplaceCheckoutBinding={checkoutId:string;projectId:string;paymentId:string;amountUnits:string;holdingId:string;holdingRevision:string;holdingAddress:string;checkoutIntegrity:string;createdAt:string;expiresAt:string;boundAt:number}
type Dependencies={enabled?:boolean;projectIds:string[];holding:{id:string;revision:string;address:string;billsAddress:string};read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;verifyHolding:()=>Promise<unknown>;verifyPayerFees?:typeof verifyPayerCheckoutTransfer;readCheckout?:(id:string)=>Promise<CheckoutRecord|null>}

/** Internal pre-payment association. Call after creating the fixed hosted checkout,
 * before returning its payment URL. This never changes a checkout recipient. */
export function createMarketplaceCheckoutCollections(input:Dependencies){
 const d={...input,verifyPayerFees:input.verifyPayerFees??verifyPayerCheckoutTransfer,projectIds:[...input.projectIds],holding:structuredClone(input.holding),readCheckout:input.readCheckout??((id:string)=>readVerifiedHostedCheckoutRecord(id,{allowExpiredForReconciliation:true}))}
 function gate(projectId:string){if(!d.enabled||!d.projectIds.includes(projectId))throw Error('Marketplace checkout collection is not enabled.')}
 function locate(s:MarketplaceStore|undefined,projectId:string,paymentId:string){const book=s?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId);if(!book)throw Error('Marketplace payment not found.');return book}
 function validate(record:CheckoutRecord|null,projectId:string,amountUnits:string){
  if(!record)throw Error('Verified hosted checkout is unavailable.')
  const address=getAddress(d.holding.address),bills=getAddress(d.holding.billsAddress)
  if(address==='0x0000000000000000000000000000000000000000'||bills==='0x0000000000000000000000000000000000000000'||address===bills)throw Error('Marketplace holding must be isolated from Bills.')
  const options=record.paymentOptions??[{network:record.network,recipient:record.recipient}]
  if(record.partnerId!==projectId||record.kind!=='usdc_request'||record.flexible||record.checkoutMode==='agentic'||record.environment!=='live'||record.network!=='base'||(record.asset??'USDC')!=='USDC'||record.settlement||record.providerFunding||record.cashPayer||record.feePayer!=='payer'||record.payment?.fees||options.length!==1||options[0].network!=='base'||getAddress(options[0].recipient)!==address||getAddress(record.recipient)!==address||marketplaceAmountUnits(record.amount)!==amountUnits)throw Error('Checkout is not an exact Base USDC marketplace collection.')
  if(!/^[a-f0-9]{64}$/.test(record.integrity)||!Number.isFinite(Date.parse(record.createdAt))||!Number.isFinite(Date.parse(record.expiresAt))||Date.parse(record.expiresAt)<=Date.parse(record.createdAt))throw Error('Invalid checkout integrity or lifetime.')
  return record
 }
 return {
  async bind(projectId:string,paymentId:string,checkoutId:string){
   gate(projectId);for(const id of [projectId,paymentId,d.holding.id,d.holding.revision])marketplaceReference(id)
   if(!/^chk_[a-zA-Z0-9]{8,40}$/.test(checkoutId))throw Error('Invalid hosted checkout id.')
   const before=locate(await d.read(),projectId,paymentId)
   if(before.plan.network!=='base'||before.plan.asset!=='USDC')throw Error('Marketplace checkout binding requires Base USDC.')
   const record=validate(await d.readCheckout(checkoutId),projectId,before.plan.amountUnits)
   if(record.id!==checkoutId)throw Error('Hosted checkout identity mismatch.')
   if(before.collectionCheckout){const previous=before.collectionCheckout;if(previous.checkoutId!==checkoutId||previous.checkoutIntegrity!==record.integrity||previous.projectId!==projectId||previous.paymentId!==paymentId||previous.amountUnits!==before.plan.amountUnits||previous.holdingId!==d.holding.id||previous.holdingRevision!==d.holding.revision||previous.holdingAddress!==getAddress(d.holding.address))throw Error('Checkout binding cannot be replaced.');return structuredClone(previous)}
   if(before.fundingEvidence||record.payment||record.paymentAttempts?.some(a=>a.status!=='pending'||a.transaction)||record.agenticAttempts?.length)throw Error('Checkout must be bound before payment starts.')
   await d.verifyHolding()
   const now=d.now()
   if(!Number.isSafeInteger(now)||now<Date.parse(record.createdAt)||now>=Date.parse(record.expiresAt))throw Error('Checkout is outside its binding window.')
   const latest=validate(await d.readCheckout(checkoutId),projectId,before.plan.amountUnits)
   if(latest.integrity!==record.integrity||latest.payment||latest.paymentAttempts?.some(a=>a.status!=='pending'||a.transaction))throw Error('Checkout changed during binding.')
   const binding:MarketplaceCheckoutBinding={checkoutId,projectId,paymentId,amountUnits:before.plan.amountUnits,holdingId:d.holding.id,holdingRevision:d.holding.revision,holdingAddress:getAddress(d.holding.address),checkoutIntegrity:record.integrity,createdAt:record.createdAt,expiresAt:record.expiresAt,boundAt:now}
   const saved=await d.mutate(s=>{
    const book=locate(s,projectId,paymentId)
    if(book.collectionCheckout){if(book.collectionCheckout.checkoutId!==checkoutId||book.collectionCheckout.checkoutIntegrity!==binding.checkoutIntegrity)throw Error('Checkout binding cannot be replaced.');return s}
    if(book.fundingEvidence||JSON.stringify(book.plan)!==JSON.stringify(before.plan))throw Error('Marketplace payment changed during binding.')
    if(s.books.some(b=>b.collectionCheckout?.checkoutId===checkoutId))throw Error('Hosted checkout is already bound.')
    book.collectionCheckout=binding;return s
   })
   return structuredClone(locate(saved,projectId,paymentId).collectionCheckout!)
  },
  async resolveSession({projectId,paymentId}:{projectId:string;paymentId:string}):Promise<MarketplaceCollectionSession|null>{
   gate(projectId)
   const book=locate(await d.read(),projectId,paymentId),binding=book.collectionCheckout
   if(!binding)return null
   const record=validate(await d.readCheckout(binding.checkoutId),projectId,book.plan.amountUnits),payment=record.payment
   if(record.id!==binding.checkoutId||record.integrity!==binding.checkoutIntegrity||binding.projectId!==projectId||binding.paymentId!==paymentId||binding.amountUnits!==book.plan.amountUnits||binding.holdingId!==d.holding.id||binding.holdingRevision!==d.holding.revision||binding.holdingAddress!==getAddress(d.holding.address)||binding.createdAt!==record.createdAt||binding.expiresAt!==record.expiresAt)throw Error('Marketplace checkout binding changed.')
   if(!payment)return null
   if(payment.status!=='paid'||payment.network!=='base'||payment.referenceType!=='evm_tx_hash'||!/^0x[0-9a-f]{64}$/i.test(payment.txHash)||marketplaceAmountUnits(payment.amount)!==binding.amountUnits||!Number.isFinite(Date.parse(payment.confirmedAt))||Date.parse(payment.confirmedAt)<binding.boundAt||Date.parse(payment.confirmedAt)>Date.parse(binding.expiresAt))throw Error('Checkout payment is not a matching collection.')
   await d.verifyHolding()
   const payerWallet=getAddress(payment.payer)
   const {payerFees}=await d.verifyPayerFees(record,{txHash:payment.txHash,payer:payerWallet,network:'base'})
   return {payerFees,sessionId:binding.checkoutId,projectId,paymentId,payerId:'wallet:base:'+payerWallet.toLowerCase(),payerWallet,holdingId:binding.holdingId,holdingRevision:binding.holdingRevision,holdingAddress:binding.holdingAddress,network:'base',asset:'USDC',amountUnits:binding.amountUnits,transactionHash:payment.txHash.toLowerCase(),issuedAt:Math.ceil(binding.boundAt/1000),expiresAt:Math.floor(Date.parse(binding.expiresAt)/1000)}
  },
 }
}
