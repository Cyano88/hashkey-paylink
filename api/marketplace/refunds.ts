import {createHash} from 'node:crypto'
import {getAddress} from 'viem'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {marketplaceAmountUnits,type MarketplaceAsset} from '../../src/lib/marketplacePayments.js'
import {marketplaceReference} from './beneficiaries.js'
import {applyMarketplaceCommand,type MarketplaceBook} from './accounting.js'
import type {MarketplaceStore} from './repository.js'
import type {BankQuoteAuthorization} from './bank-quotes.js'

/** Trusted original collection/session verification, not tx.from or a body-supplied destination. */
export type RefundCollection={projectId:string;paymentId:string;fundingEvidenceId:string;route:'wallet';network:'base';asset:MarketplaceAsset;tokenAddress:string;amountUnits:string;payerId:string;payerWallet:string;holdingId:string;holdingRevision:string;holdingAddress:string}
export type RefundReservation={key:string;requestHash:string;refundId:string;amountUnits:string;collection:RefundCollection;allocations:Array<{allocationId:string;operationId:string;amountUnits:string}>;authorization:BankQuoteAuthorization}
type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(store:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;resolveRefundCollection?:(input:{projectId:string;paymentId:string;fundingEvidenceId:string})=>Promise<RefundCollection|null>}
function locate(store:MarketplaceStore|undefined,projectId:string,paymentId:string){const book=store?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId);if(!book)throw Error('Marketplace payment not found.');return book}
function collection(input:RefundCollection,book:MarketplaceBook):RefundCollection{
 for(const key of ['projectId','paymentId','fundingEvidenceId','payerId','holdingId','holdingRevision'] as const)marketplaceReference(input[key])
 if(input.projectId!==book.plan.projectId||input.paymentId!==book.plan.paymentId||input.fundingEvidenceId!==book.fundingEvidence||input.route!=='wallet'||input.network!=='base'||input.asset!==book.plan.asset||input.amountUnits!==book.plan.amountUnits)throw Error('Refund collection does not match the original payment.')
 const tokenAddress=getAddress(input.tokenAddress),payerWallet=getAddress(input.payerWallet),holdingAddress=getAddress(input.holdingAddress)
 if(tokenAddress!==getAddress(BASE_STABLECOINS[book.plan.asset].address)||payerWallet==='0x0000000000000000000000000000000000000000'||holdingAddress==='0x0000000000000000000000000000000000000000'||payerWallet===holdingAddress)throw Error('Refund destination or token is invalid.')
 return {projectId:input.projectId,paymentId:input.paymentId,fundingEvidenceId:input.fundingEvidenceId,route:'wallet',network:'base',asset:input.asset,tokenAddress,amountUnits:input.amountUnits,payerId:input.payerId,payerWallet,holdingId:input.holdingId,holdingRevision:input.holdingRevision,holdingAddress}
}
function response(book:MarketplaceBook,reservation:RefundReservation){return {reservation:structuredClone(reservation),operations:reservation.allocations.map(a=>structuredClone(book.operations.find(o=>o.id===a.operationId)!))}}
export function createMarketplaceRefunds(dependencies:Dependencies){
 const d=dependencies
 return {
  async reserve(projectId:string,paymentId:string,key:string,input:{refundId:string;allocations:Array<{allocationId:string;amount:string}>},authorization:BankQuoteAuthorization){
   for(const id of [projectId,paymentId,key,input.refundId])marketplaceReference(id)
   if(!Array.isArray(input.allocations)||input.allocations.length<1||input.allocations.length>100)throw Error('Provide between 1 and 100 refund allocations.')
   const allocations=input.allocations.map(a=>({allocationId:marketplaceReference(a.allocationId),amountUnits:marketplaceAmountUnits(a.amount)})).sort((a,b)=>a.allocationId<b.allocationId?-1:a.allocationId>b.allocationId?1:0)
   if(new Set(allocations.map(a=>a.allocationId)).size!==allocations.length)throw Error('Duplicate refund allocation.')
   const request={refundId:input.refundId,allocations,authorization:{credentialId:marketplaceReference(authorization.credentialId),businessReference:marketplaceReference(authorization.businessReference)}}
   const requestHash=createHash('sha256').update(JSON.stringify(request)).digest('hex')
   const replay=(book:MarketplaceBook)=>{const previous=book.refundReservations?.find(r=>r.key===key);if(previous){if(previous.requestHash!==requestHash)throw Error('Idempotency key was used for a different refund.');return previous}if(book.journal.some(j=>j.key===key))throw Error('Idempotency key was used for a different request.')}
   const before=locate(await d.read(),projectId,paymentId),previous=replay(before)
   if(previous)return response(before,previous)
   if(!before.fundingEvidence)throw Error('Refund requires verified collection.')
   if(!d.resolveRefundCollection)throw Error('Original refund collection verification is not configured.')
   const resolved=await d.resolveRefundCollection({projectId,paymentId,fundingEvidenceId:before.fundingEvidence})
   if(!resolved)throw Error('Original refund collection is unavailable.')
   const origin=collection(structuredClone(resolved),before)
   const store=await d.mutate(s=>{
    const book=locate(s,projectId,paymentId)
    if(replay(book))return s
    collection(origin,book)
    if(book.refundCollection&&JSON.stringify(book.refundCollection)!==JSON.stringify(origin))throw Error('Original refund destination binding changed.')
    if(book.refundReservations?.some(r=>r.refundId===request.refundId))throw Error('Refund reference already exists.')
    let next=structuredClone(book)
    const bound=allocations.map((a,index)=>{
     const digest=createHash('sha256').update(JSON.stringify([projectId,paymentId,request.refundId,a.allocationId])).digest('hex'),operationId='refund_'+digest
     next=applyMarketplaceCommand(next,projectId,index===0?key:'refund-part:'+digest,{type:'reserve',operationId,allocationId:a.allocationId,kind:'refund',amountUnits:a.amountUnits})
     return {...a,operationId}
    })
    const amountUnits=allocations.reduce((sum,a)=>sum+BigInt(a.amountUnits),0n).toString()
    next.refundCollection=structuredClone(origin)
    next.refundReservations=[...(next.refundReservations||[]),{key,requestHash,refundId:request.refundId,amountUnits,collection:structuredClone(origin),allocations:bound,authorization:request.authorization}]
    s.books[s.books.indexOf(book)]=next;return s
   })
   const book=locate(store,projectId,paymentId)
   return response(book,book.refundReservations!.find(r=>r.key===key)!)
  },
  async get(projectId:string,paymentId:string,refundId:string){
   for(const id of [projectId,paymentId,refundId])marketplaceReference(id)
   const book=locate(await d.read(),projectId,paymentId),refund=book.refundReservations?.find(r=>r.refundId===refundId)
   return refund?response(book,refund):null
  },
 }
}
