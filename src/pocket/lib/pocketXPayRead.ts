import {notifyPocketKycRequirement} from './pocketKycAccess'
import type {XPayCheckout,XPayDestination} from './pocketUnifiedXPay'
type Mine={standaloneIds?:string[];checkouts:XPayCheckout[];destinations:XPayDestination[]}
let cached:{owner:string;data:Mine}|undefined
export function readXPayMineCache(owner?:string){return owner&&cached?.owner===owner?cached.data:undefined}
export function cacheXPayMine(owner:string|undefined,data:Mine){if(owner)cached={owner,data}}
export function clearXPayMineCache(owner?:string){if(!owner||cached?.owner===owner)cached=undefined}
// Only callers performing reads may opt into retry; never replay payment mutations.
export async function readXPayJson(url:string,init:RequestInit={},retry=false){
 for(let attempt=0;;attempt++){
  try{
   const r=await fetch(url,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})
   const body=await r.json().catch(()=>null)
   if(!r.ok||!body?.ok)notifyPocketKycRequirement(body)
   if(!r.ok||!body?.ok)throw Object.assign(Error(body?.error||(r.status===404?'This QR is no longer available.':'XPay is temporarily unavailable. Please try again.')),{retryable:[408,502,503,504].includes(r.status)})
   return body
  }catch(e){
   const error=e as Error&{retryable?:boolean}
   if(init.signal?.aborted||!retry||attempt>=1||!(error.retryable||error.name==='TypeError'||error.name==='TimeoutError'))throw e
   await new Promise(resolve=>setTimeout(resolve,600))
  }
 }
}
