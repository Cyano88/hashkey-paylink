import {notifyPocketKycRequirement} from './pocketKycAccess'
import type {XPayCheckout,XPayDestination} from './pocketUnifiedXPay'
type Mine={hostedNetworks?:string[];standaloneIds?:string[];checkouts:XPayCheckout[];destinations:XPayDestination[]}
let cached:{owner:string;data:Mine}|undefined
export function readXPayMineCache(owner?:string){return owner&&cached?.owner===owner?cached.data:undefined}
export function cacheXPayMine(owner:string|undefined,data:Mine){if(owner)cached={owner,data}}
export function clearXPayMineCache(owner?:string){if(!owner||cached?.owner===owner)cached=undefined}
// Only callers performing reads may opt into retry; never replay payment mutations.
export async function readXPayJson(url:string,init:RequestInit={},retry=false,timeoutMs=15000){
 for(let attempt=0;;attempt++){
  try{
   const r=await fetch(url,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs)})
   const body=await r.json().catch(()=>null)
   if(!r.ok||!body?.ok)notifyPocketKycRequirement(body)
   if(!r.ok||!body?.ok)throw Object.assign(Error(body?.error||(r.status===404?'This QR is no longer available.':'XPay is temporarily unavailable. Please try again.')),{retryable:!body||[408,502,503,504].includes(r.status)})
   return body
  }catch(e){
   const error=e as Error&{retryable?:boolean}
   if(init.signal?.aborted||!retry||attempt>=1||!(error.retryable||error.name==='TypeError'||error.name==='TimeoutError'))throw e
   await new Promise(resolve=>setTimeout(resolve,600))
  }
 }
}

/** A lost response must never automatically replay a settings mutation. */
export async function saveXPayCoinWithRecovery(input:{checkout:XPayCheckout;asset:string;networks:string[];send:()=>Promise<{checkout:XPayCheckout}>;read:()=>Promise<{checkouts:XPayCheckout[]}>}){
 try{return await input.send()}catch(error){
  const e=error as Error&{retryable?:boolean}
  if(!e.retryable&&!['AbortError','TimeoutError','TypeError'].includes(e.name))throw error
  const current=await input.read().catch(()=>undefined)
  const checkout=current?.checkouts.find(c=>c.id===input.checkout.id&&(c.version||0)>(input.checkout.version||0))
  const networks=checkout?.acceptance?[...new Set(checkout.acceptance.routes.filter(r=>r.asset===input.asset&&checkout.destinations.some(d=>d.id===r.destinationId&&d.kind==='stablecoins')).map(r=>r.network))].sort():undefined
  if(checkout&&networks&&JSON.stringify(networks)===JSON.stringify([...input.networks].sort()))return {checkout}
  throw Error('We could not confirm your changes. Reopen this terminal before trying again.')
 }
}
