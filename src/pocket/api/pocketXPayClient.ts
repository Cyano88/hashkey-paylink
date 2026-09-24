import { pocketApiUrl } from '../lib/pocketRoutes'
import type { XPayMerchant, XPayPayment } from '../lib/pocketXPay'
export async function xpayRequest(getToken:()=>Promise<string|null>,body:Record<string,unknown>,approval?:{token:string;authorization:string}):Promise<{merchant:XPayMerchant|null;merchants?:XPayMerchant[];payment:XPayPayment;payments?:XPayPayment[]}>{
 const token=approval?.authorization?.replace(/^Bearer\s+/i,'')||await getToken();if(!token)throw Error('Sign in to Pocket again.')
 const response=await fetch(pocketApiUrl('/api/pocket/xstocks/xpay'),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(approval?{'X-Pocket-Payment-Approval':approval.token}:{})},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)})
 const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'XPay is unavailable.');return data
}
