import {createPublicClient,http} from 'viem'
import {base} from 'viem/chains'
import {readDurableJson} from '../render-durable-store.js'
import {readVerifiedHostedCheckoutRecord} from '../hosted-checkouts.js'
import {createMarketplaceCollectionRuntime,readMarketplaceRuntimeConfig} from './runtime.js'
import type {MarketplaceStore} from './repository.js'
import type {MarketplaceBook} from './accounting.js'

/** Accounting only: consumes existing server-bound checkouts. Never creates a
 * checkout, authorizes a release, signs, or starts an execution worker. */
export function createMarketplaceCollectionObserver(d:{read:()=>Promise<MarketplaceStore|undefined>;sync:(book:MarketplaceBook)=>Promise<unknown>}){
 let running=false,cursor=0
 return {async drain(limit=5){
  if(running)return {skipped:true,checked:0,failed:0}
  if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid collection observer batch size.')
  running=true
  try{
   const books=(await d.read())?.books.filter(b=>b.collectionCheckout&&!b.fundingEvidence)??[]
   if(!books.length){cursor=0;return {skipped:false,checked:0,failed:0}}
   const start=cursor%books.length,batch=Array.from({length:Math.min(limit,books.length)},(_,i)=>books[(start+i)%books.length]);cursor=(start+batch.length)%books.length
   let failed=0
   for(const book of batch){try{await d.sync(structuredClone(book))}catch{failed++}}
   return {skipped:false,checked:batch.length,failed}
  }finally{running=false}
 }}
}

let observer:ReturnType<typeof createMarketplaceCollectionObserver>|undefined
let timer:ReturnType<typeof setInterval>|undefined
export function startMarketplaceCollectionObserver(env:NodeJS.ProcessEnv=process.env){
 if(timer)return
 const settings=readMarketplaceRuntimeConfig(env)
 if(!settings.config.verificationReady||settings.blockers.some(b=>!['worker_disabled','project_allowlist_invalid_or_missing'].includes(b)))return
 // The verifier checks chain ID 8453. Hash-only block reads need no OP-specific
 // expanded transaction formatter.
 const chain=createPublicClient({transport:http(env.PRIVATE_RPC_URL||base.rpcUrls.default.http[0],{timeout:10000,retryCount:0})})
 observer=createMarketplaceCollectionObserver({read:()=>readDurableJson<MarketplaceStore>('hashpaylink:marketplace-accounting-foundation:v1'),sync:async book=>{
  const checkout=await readVerifiedHostedCheckoutRecord(book.collectionCheckout!.checkoutId,{allowExpiredForReconciliation:true})
  if(!checkout?.payment)return
  const runtime=createMarketplaceCollectionRuntime({env:{...env,MARKETPLACE_PROJECT_IDS:book.plan.projectId,MARKETPLACE_COLLECTIONS_ENABLED:'true'},chain})
  await runtime.syncCollection(book.plan.projectId,book.plan.paymentId)
 }})
 timer=setInterval(wakeMarketplaceCollectionObserver,30000);timer.unref()
 wakeMarketplaceCollectionObserver()
}
export function wakeMarketplaceCollectionObserver(){
 if(observer)void observer.drain().catch(()=>{console.warn('[marketplace] Collection observer unavailable; retrying on next tick.')})
}
