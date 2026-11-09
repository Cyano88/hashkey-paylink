import {createHash} from 'node:crypto'
import {encodeFunctionData,getAddress,parseAbi} from 'viem'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {marketplaceAmountUnits,type MarketplaceAsset} from '../../src/lib/marketplacePayments.js'
import {marketplaceReference} from './beneficiaries.js'
import {applyMarketplaceCommand} from './accounting.js'
import type {MarketplaceStore} from './repository.js'
import type {BankQuoteAuthorization} from './bank-quotes.js'
import {validateMarketplaceWalletQuote,type MarketplaceWalletQuote} from './wallet-quotes.js'

export type WalletPayoutReservation={quote?:MarketplaceWalletQuote;key:string;requestHash:string;operationId:string;allocationId:string;beneficiaryId:string;sellerId:string;network:'base';asset:MarketplaceAsset;tokenAddress:string;recipient:string;amountUnits:string;authorization:BankQuoteAuthorization}
type Dependencies={now:()=>number;resolveWalletQuote?:(input:{projectId:string;paymentId:string;quoteId:string})=>Promise<MarketplaceWalletQuote|null>;read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(store:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>}
const transferAbi=parseAbi(['function transfer(address to,uint256 amount) returns(bool)'])
function locate(store:MarketplaceStore|undefined,projectId:string,paymentId:string){
 marketplaceReference(projectId);marketplaceReference(paymentId)
 const book=store?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
 if(!book)throw Error('Marketplace payment not found.')
 return book
}
function beneficiary(store:MarketplaceStore,book:ReturnType<typeof locate>,allocationId:string){
 const allocation=book.plan.allocations.find(a=>a.id===allocationId)
 if(book.plan.network!=='base'||!['USDC','USDT'].includes(book.plan.asset)||!allocation||allocation.settlement!==(book.plan.asset==='USDC'?'wallet_usdc':'wallet_usdt'))throw Error('Payout requires same-asset Base wallet settlement.')
 const snapshot=book.beneficiarySnapshots?.find(b=>b.beneficiaryId===allocation.beneficiaryId)
 const current=store.walletBeneficiaries?.find(b=>b.projectId===book.plan.projectId&&b.beneficiaryId===allocation.beneficiaryId)
 if(snapshot?.kind!=='wallet'||!current||current.status!=='active'||snapshot.projectId!==book.plan.projectId||snapshot.sellerId!==allocation.sellerId||current.sellerId!==allocation.sellerId||snapshot.asset!==book.plan.asset||current.asset!==book.plan.asset||snapshot.network!=='base'||current.network!=='base'||getAddress(snapshot.address)!==getAddress(current.address))throw Error('Wallet payout beneficiary is no longer eligible.')
 return snapshot
}
/** Internal same-asset reservation and unsigned token-call preparation. No custody, fees, signing or broadcast. */
export function createMarketplaceWalletPayouts(dependencies:Dependencies){
 const d=dependencies
 return {
  async preview(projectId:string,paymentId:string,quoteId:string){
   for(const id of [projectId,paymentId,quoteId])marketplaceReference(id)
   if(!d.resolveWalletQuote)throw Error('Marketplace wallet quote verification is not configured.')
   const resolved=await d.resolveWalletQuote({projectId,paymentId,quoteId})
   if(!resolved)throw Error('Marketplace wallet quote not found.')
   const quote=validateMarketplaceWalletQuote(resolved,d.now()),s=await d.read(),book=locate(s,projectId,paymentId),snapshot=beneficiary(s!,book,quote.allocationId)
   if(quote.projectId!==projectId||quote.paymentId!==paymentId||quote.quoteId!==quoteId||book.plan.asset!=='USDC'||snapshot.beneficiaryId!==quote.beneficiaryId||getAddress(snapshot.address)!==quote.recipient)throw Error('Wallet quote binding mismatch.')
   if(!book.fundingEvidence||BigInt(book.balances.find(b=>b.allocationId===quote.allocationId)?.available??'0')<BigInt(quote.debitUnits))throw Error('Insufficient released funds for wallet quote.')
   return validateMarketplaceWalletQuote(quote,d.now())
  },
  async reserveQuoted(projectId:string,paymentId:string,key:string,quoteId:string,authorization:BankQuoteAuthorization){
   for(const id of [projectId,paymentId,key,quoteId])marketplaceReference(id)
   const actor={credentialId:marketplaceReference(authorization.credentialId),businessReference:marketplaceReference(authorization.businessReference)}
   const requestHash=createHash('sha256').update(JSON.stringify({quoteId,authorization:actor})).digest('hex')
   const replay=(s:MarketplaceStore|undefined)=>{const book=locate(s,projectId,paymentId),r=book.walletReservations?.find(r=>r.key===key);if(r){if(r.requestHash!==requestHash)throw Error('Idempotency key was used for a different wallet payout.');return {reservation:r,operation:book.operations.find(o=>o.id===r.operationId)!}}}
   const prior=replay(await d.read());if(prior)return structuredClone(prior)
   if(!d.resolveWalletQuote)throw Error('Marketplace wallet quote verification is not configured.')
   const resolved=await d.resolveWalletQuote({projectId,paymentId,quoteId})
   if(!resolved)throw Error('Marketplace wallet quote not found.')
   const quote=validateMarketplaceWalletQuote(resolved,d.now())
   if(quote.projectId!==projectId||quote.paymentId!==paymentId||quote.quoteId!==quoteId)throw Error('Wallet quote binding mismatch.')
   const saved=await d.mutate(s=>{
    if(replay(s))return s
    const book=locate(s,projectId,paymentId),snapshot=beneficiary(s,book,quote.allocationId)
    validateMarketplaceWalletQuote(quote,d.now())
    if(book.plan.asset!=='USDC'||snapshot.beneficiaryId!==quote.beneficiaryId||getAddress(snapshot.address)!==quote.recipient)throw Error('Wallet quote destination changed.')
    if(s.books.some(b=>b.walletReservations?.some(r=>r.quote?.quoteId===quoteId)))throw Error('Wallet quote already reserved.')
    const next=applyMarketplaceCommand(book,projectId,key,{type:'reserve',operationId:quote.operationId,allocationId:quote.allocationId,kind:'payout',amountUnits:quote.debitUnits})
    next.walletReservations=[...(book.walletReservations||[]),{key,requestHash,operationId:quote.operationId,allocationId:quote.allocationId,beneficiaryId:snapshot.beneficiaryId,sellerId:snapshot.sellerId,network:'base',asset:'USDC',tokenAddress:getAddress(BASE_STABLECOINS.USDC.address),recipient:quote.recipient,amountUnits:quote.recipientUnits,authorization:actor,quote}]
    s.books[s.books.indexOf(book)]=next;return s
   })
   return structuredClone(replay(saved)!)
  },
  async reserve(projectId:string,paymentId:string,key:string,input:{operationId:string;allocationId:string;amount:string},authorization:BankQuoteAuthorization){
   for(const id of [projectId,paymentId,key,input.operationId,input.allocationId])marketplaceReference(id)
   const request={operationId:input.operationId,allocationId:input.allocationId,amountUnits:marketplaceAmountUnits(input.amount),authorization:{credentialId:marketplaceReference(authorization.credentialId),businessReference:marketplaceReference(authorization.businessReference)}}
   const requestHash=createHash('sha256').update(JSON.stringify(request)).digest('hex')
   const store=await d.mutate(s=>{
    const book=locate(s,projectId,paymentId)
    const existing=book.walletReservations?.find(r=>r.key===key)
    if(existing){if(existing.requestHash!==requestHash)throw Error('Idempotency key was used for a different wallet payout.');return s}
    if(book.journal.some(j=>j.key===key))throw Error('Idempotency key was used for a different request.')
    const snapshot=beneficiary(s,book,request.allocationId)
    const next=applyMarketplaceCommand(book,projectId,key,{type:'reserve',operationId:request.operationId,allocationId:request.allocationId,kind:'payout',amountUnits:request.amountUnits})
    next.walletReservations=[...(book.walletReservations||[]),{key,requestHash,operationId:request.operationId,allocationId:request.allocationId,beneficiaryId:snapshot.beneficiaryId,sellerId:snapshot.sellerId,network:'base',asset:book.plan.asset,tokenAddress:getAddress(BASE_STABLECOINS[book.plan.asset].address),recipient:getAddress(snapshot.address),amountUnits:request.amountUnits,authorization:request.authorization}]
    s.books[s.books.indexOf(book)]=next;return s
   })
   const book=locate(store,projectId,paymentId),reservation=book.walletReservations!.find(r=>r.key===key)!
   return structuredClone({reservation,operation:book.operations.find(o=>o.id===reservation.operationId)!})
  },
  async prepareTransfer(projectId:string,paymentId:string,operationId:string){
   return prepareMarketplaceWalletTransfer(await d.read(),projectId,paymentId,operationId,d.now())
  },
 }
}

/** Pure preparation against one store snapshot; also used under the execution lock. */
export function prepareMarketplaceWalletTransfer(store:MarketplaceStore|undefined,projectId:string,paymentId:string,operationId:string,now?:number){
   marketplaceReference(operationId)
   const book=locate(store,projectId,paymentId)
   const reservation=book.walletReservations?.find(r=>r.operationId===operationId),operation=book.operations.find(o=>o.id===operationId)
   if(!reservation||!operation||operation.status!=='reserved'||operation.kind!=='payout')throw Error('Wallet payout is unavailable or requires reconciliation.')
   const snapshot=beneficiary(store!,book,reservation.allocationId)
   const tokenAddress=getAddress(BASE_STABLECOINS[book.plan.asset].address),recipient=getAddress(snapshot.address)
   const quote=reservation.quote?validateMarketplaceWalletQuote(reservation.quote,now):undefined
   if(quote&&(quote.projectId!==projectId||quote.paymentId!==paymentId||quote.operationId!==operationId||quote.allocationId!==reservation.allocationId||quote.beneficiaryId!==reservation.beneficiaryId||quote.recipient!==recipient||quote.recipientUnits!==reservation.amountUnits||reservation.asset!=='USDC'))throw Error('Wallet payout quote binding changed.')
   if(reservation.asset!==book.plan.asset||reservation.network!=='base'||getAddress(reservation.tokenAddress)!==tokenAddress||getAddress(reservation.recipient)!==recipient||reservation.beneficiaryId!==snapshot.beneficiaryId||reservation.sellerId!==snapshot.sellerId||(quote?.debitUnits??reservation.amountUnits)!==operation.units||reservation.allocationId!==operation.allocationId)throw Error('Wallet payout reservation binding changed.')
   // This is only the ERC-20 call. The eventual holding adapter must authorize/wrap it and pay gas.
   return {...(quote?{quote}:{}),projectId,paymentId,operationId,chainId:8453 as const,asset:reservation.asset,recipient,amountUnits:reservation.amountUnits,to:tokenAddress,value:'0',data:encodeFunctionData({abi:transferAbi,functionName:'transfer',args:[recipient,BigInt(reservation.amountUnits)]}),requiresExecutionAuthorization:true as const}
}
