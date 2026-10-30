import {pocketApiUrl} from '../pocket/lib/pocketRoutes'
export async function prepareCheckoutReceiptContact(input:{checkoutId:string;network:string;payer:string;getAccessToken:()=>Promise<string|null>}){
 if(!/^chk[xb]?_[a-zA-Z0-9]{8,40}$/.test(input.checkoutId))return
 const token=await input.getAccessToken()
 if(!token)throw Error('Sign in again before paying.')
 const response=await fetch(pocketApiUrl('/api/receipt'),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({checkoutId:input.checkoutId,network:input.network,payer:input.payer}),signal:AbortSignal.timeout(20000)})
 const data=await response.json().catch(()=>null)
 if(!response.ok||!data?.ok)throw Error(data?.error||'Receipt setup could not complete. Try again.')
}
