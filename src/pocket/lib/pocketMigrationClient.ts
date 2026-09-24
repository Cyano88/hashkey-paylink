import { pocketApiUrl } from './pocketRoutes'
import { takePocketPaymentApproval } from './pocketPaymentApproval'
export async function pocketMigrationRequest<T>(accessToken:string,body:Record<string,unknown>,options:{payment?:boolean;signal?:AbortSignal;recovery?:boolean;additionalNetwork?:"ethereum"|"polygon"}={}) {
 const approval=options.payment?takePocketPaymentApproval():null
 if(approval&&approval.authorization!==`Bearer ${accessToken}`)throw new Error('Your sign-in changed. Approve this transfer again.')
 if(options.payment&&!approval)throw new Error('Approve this transfer with your Pocket PIN or phone unlock.')
 const response=await fetch(pocketApiUrl(options.additionalNetwork?'/api/pocket/wallet-update/additional?network='+options.additionalNetwork+(options.recovery?'&recovery=true':''):options.recovery?'/api/pocket/wallet-update/recovery':'/api/pocket/wallet-update/flow'),{
  method:'POST',cache:'no-store',signal:options.signal,
  headers:{'content-type':'application/json',authorization:approval?.authorization??`Bearer ${accessToken}`,...(approval?{'x-pocket-payment-approval':approval.token}:{})},body:JSON.stringify(body),
 })
 const result=await response.json().catch(()=>null)
 if(!response.ok||!result?.ok)throw new Error(typeof result?.error==='string'?result.error:'Migration is unavailable. Check progress before trying again.')
 return result as T
}
