import { stockApiResponse, stockRead, invalidateStockReads } from './pocketStockRead'
import { pocketApiUrl } from '../lib/pocketRoutes'
import type { XPayMerchant, XPayPayment } from '../lib/pocketXPay'
export async function xpayRequest(getToken:()=>Promise<string|null>,body:Record<string,unknown>,approval?:{token:string;authorization:string}):Promise<{merchant:XPayMerchant|null;merchants?:XPayMerchant[];payment:XPayPayment;payments?:XPayPayment[]}>{
 const token=approval?.authorization?.replace(/^Bearer\s+/i,'')||await getToken();if(!token)throw Error('Sign in to Pocket again.')
 const request=async()=>{const response=await fetch(pocketApiUrl('/api/pocket/xstocks/xpay'),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(approval?{'X-Pocket-Payment-Approval':approval.token}:{})},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)})
 return stockApiResponse(response)}
 if(body.action==='status')return request()
 if(body.action==='mine'||body.action==='merchant')return stockRead(token,'xpay:'+JSON.stringify(body),request)
 try{return await request()}finally{invalidateStockReads(token)}
}
