import type {BankQuoteRequests} from './bank-quote-service.js'
import {marketplaceBankReadiness} from './bank-readiness.js'
import type {MarketplaceStore} from './repository.js'
import {marketplaceSellerBalances} from './accounting.js'
export function marketplacePortalBalances(store:MarketplaceStore|undefined,projectId:string,sellerFilter='',quotes?:BankQuoteRequests){
 const books=(store?.books??[]).filter(b=>b.plan.projectId===projectId)
 const ids=[...new Set(books.flatMap(b=>b.plan.allocations.map(a=>a.sellerId)))].sort().filter(id=>!sellerFilter||id===sellerFilter)
 const sellers=ids.slice(0,100).map(sellerId=>({sellerId,balances:marketplaceSellerBalances(books,projectId,sellerId).filter(b=>books.some(book=>book.plan.asset===b.asset&&book.plan.allocations.some(a=>a.sellerId===sellerId)))}))
 const totals=(['USDC','USDT'] as const).map(asset=>{const units={pending:0n,available:0n,reserved:0n,paid:0n,refunded:0n};for(const b of books.filter(b=>b.plan.asset===asset))for(const v of b.balances){if(sellerFilter&&!b.plan.allocations.some(a=>a.id===v.allocationId&&a.sellerId===sellerFilter))continue;for(const k of Object.keys(units) as Array<keyof typeof units>)units[k]+=BigInt(v[k])}return {asset,units:Object.fromEntries(Object.entries(units).map(([k,v])=>[k,v.toString()]))}}).filter(t=>t.asset==='USDC'||Object.values(t.units).some(v=>v!=='0'))
 const withdrawals=books.flatMap(b=>b.operations.filter(o=>o.kind==='payout').flatMap(o=>{const a=b.plan.allocations.find(a=>a.id===o.allocationId);if(!a||sellerFilter&&a.sellerId!==sellerFilter)return [];return [{paymentId:b.plan.paymentId,operationId:o.id,sellerId:a.sellerId,role:a.role,asset:b.plan.asset,units:o.units,status:o.status,cancelled:!!b.payoutCancellations?.some(c=>c.operationId===o.id)}]})).slice(-100).reverse()
 const quoteFailures=(quotes?.requests??[]).filter(r=>r.projectId===projectId&&r.sellerId&&(!sellerFilter||r.sellerId===sellerFilter)&&r.failure).sort((a,b)=>(b.failedAt??0)-(a.failedAt??0)).slice(0,10).map(r=>({sellerId:r.sellerId!,operationId:r.operationId,failedAt:r.failedAt??null,code:r.failure!.code,message:r.failure!.message,details:r.failure!.details}))
 return {quoteFailures,bankWithdrawals:marketplaceBankReadiness(),totals,sellers,withdrawals,sellersTruncated:ids.length>100,withdrawalLimit:100,asOf:new Date().toISOString()}
}
