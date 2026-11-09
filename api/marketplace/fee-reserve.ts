import {createHash} from 'node:crypto'
import type {MarketplaceStore} from './repository.js'
import {marketplaceReference} from './beneficiaries.js'
import {applyMarketplaceCommand} from './accounting.js'
export type RefundFeeQuote={quoteId:string;projectId:string;paymentId:string;refundId:string;amountUnits:string;networkFeeUnits:string;expiresAt:number}
export type FeeAccount={projectId:string;available:string;reserved:string;accrued:string;funded:string;credits:Array<{key:string;paymentId:string;allocationId:string;units:string;credentialId:string}>;reservations:Array<{quote:RefundFeeQuote;state:'reserved'|'accrued'|'released'}>}
const units=(v:string)=>{if(typeof v!=='string'||!/^(0|[1-9]\d{0,23})$/.test(v))throw Error('Invalid fee reserve units.');return BigInt(v)}
export function feeReserveObligations(s:MarketplaceStore){
 let total=0n
 const accounts=s.feeAccounts??[]
 if(new Set(accounts.map(a=>a.projectId)).size!==accounts.length)throw Error('Duplicate fee reserve account.')
 for(const a of accounts){
  const balance=units(a.available)+units(a.reserved)+units(a.accrued)
  const funded=s.books.filter(b=>b.plan.projectId===a.projectId).reduce((n,b)=>n+b.balances.reduce((n,v)=>n+units(v.feesFunded??'0'),0n),0n)
  if(balance!==units(a.funded)||funded!==balance)throw Error('Fee reserve conservation failed.')
  total+=balance
 }
 for(const b of s.books)if(b.balances.some(v=>units(v.feesFunded??'0')>0n)&&!accounts.some(a=>a.projectId===b.plan.projectId))throw Error('Fee reserve account missing.')
 return total
}
export function reserveRefundFee(s:MarketplaceStore,q:RefundFeeQuote,now:number){
 for(const k of ['quoteId','projectId','paymentId','refundId'] as const)marketplaceReference(q[k])
 if(!Number.isSafeInteger(q.expiresAt)||q.expiresAt<=now+5000||q.expiresAt>now+300000||units(q.amountUnits)<=0n||units(q.networkFeeUnits)<=0n)throw Error('Refund fee quote expired or invalid.')
 const account=s.feeAccounts?.find(a=>a.projectId===q.projectId)
 if(!account)throw Error('Marketplace refund fee reserve requires funding.')
 if(account.reservations.some(r=>r.quote.refundId===q.refundId&&r.quote.paymentId===q.paymentId)||s.feeAccounts?.some(a=>a.reservations.some(r=>r.quote.quoteId===q.quoteId)))throw Error('Refund fee quote already reserved.')
 const fee=units(q.networkFeeUnits)
 if(units(account.available)<fee)throw Error('Marketplace refund fee reserve is insufficient.')
 account.available=(units(account.available)-fee).toString();account.reserved=(units(account.reserved)+fee).toString()
 account.reservations.push({quote:{quoteId:q.quoteId,projectId:q.projectId,paymentId:q.paymentId,refundId:q.refundId,amountUnits:q.amountUnits,networkFeeUnits:q.networkFeeUnits,expiresAt:q.expiresAt},state:'reserved'})
 feeReserveObligations(s)
}
export function settleRefundFee(s:MarketplaceStore,projectId:string,paymentId:string,refundId:string,success:boolean){
 const account=s.feeAccounts?.find(a=>a.projectId===projectId),r=account?.reservations.find(r=>r.quote.paymentId===paymentId&&r.quote.refundId===refundId)
 if(!account||!r||r.state!=='reserved')throw Error('Refund fee reservation is unavailable.')
 const fee=units(r.quote.networkFeeUnits)
 account.reserved=(units(account.reserved)-fee).toString()
 const field=success?'accrued':'available';account[field]=(units(account[field])+fee).toString();r.state=success?'accrued':'released'
 feeReserveObligations(s)
}
/** Explicit developer instruction; released platform commission only. */
export function createMarketplaceFeeReserve(d:{read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>}){
 return {async fund(projectId:string,paymentId:string,allocationId:string,key:string,amountUnits:string,credentialId:string){
  for(const id of [projectId,paymentId,allocationId,key,credentialId])marketplaceReference(id)
  if(units(amountUnits)<=0n)throw Error('Fee reserve funding must be positive.')
  const saved=await d.mutate(s=>{
   const book=s.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
   if(!book||book.plan.asset!=='USDC'||book.plan.allocations.find(a=>a.id===allocationId)?.role!=='platform')throw Error('Only released Base USDC platform commission can fund fees.')
   s.feeAccounts??=[]
   let account=s.feeAccounts.find(a=>a.projectId===projectId)
   if(!account){account={projectId,available:'0',reserved:'0',accrued:'0',funded:'0',credits:[],reservations:[]};s.feeAccounts.push(account)}
   const credit={key,paymentId,allocationId,units:amountUnits,credentialId},prior=account.credits.find(c=>c.key===key)
   if(prior){if(JSON.stringify(prior)!==JSON.stringify(credit))throw Error('Fee funding idempotency conflict.');return s}
   const next=applyMarketplaceCommand(book,projectId,'fee-budget:'+createHash('sha256').update(key).digest('hex'),{type:'fund_fees',allocationId,amountUnits})
   s.books[s.books.indexOf(book)]=next
   account.available=(units(account.available)+units(amountUnits)).toString();account.funded=(units(account.funded)+units(amountUnits)).toString();account.credits.push(credit)
   feeReserveObligations(s);return s
  })
  const a=saved.feeAccounts!.find(a=>a.projectId===projectId)!
  return {available:a.available,reserved:a.reserved,accrued:a.accrued,asset:'USDC'}
 },async balance(projectId:string){marketplaceReference(projectId);const s=await d.read();if(s)feeReserveObligations(s);const a=s?.feeAccounts?.find(a=>a.projectId===projectId);return {available:a?.available??'0',reserved:a?.reserved??'0',accrued:a?.accrued??'0',asset:'USDC'}}}
}
