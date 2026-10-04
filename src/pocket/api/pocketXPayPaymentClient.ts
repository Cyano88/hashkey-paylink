import {pocketApiUrl} from '../lib/pocketRoutes'
import type {XPayDestination} from '../lib/pocketUnifiedXPay'
import type {PocketNetwork} from '../lib/pocketSchemas'

export async function readPocketXPayPayment({checkoutId,destination,network,signal,fetcher=fetch}:{checkoutId:string;destination:Pick<XPayDestination,'id'|'kind'|'revision'>;network:PocketNetwork;signal?:AbortSignal;fetcher?:typeof fetch}){
 const read=async(path:string)=>{const r=await fetcher(pocketApiUrl(path),{cache:'no-store',signal});const data=await r.json();if(!r.ok||!data.ok)throw Error(typeof data.error==='string'?data.error:'Payment unavailable. Try again.');return data}
 const terminal=await read('/api/pocket/xpay?id='+encodeURIComponent(checkoutId))
 const current=terminal.checkout?.destinations?.find((d:XPayDestination)=>d.id===destination.id)
 if(terminal.checkout?.id!==checkoutId||!current||current.kind!==destination.kind||current.revision!==destination.revision||current.kind==='xstocks'||(current.kind==='bank'?network!=='base':!current.networks?.includes(network)))throw Error('Payment options changed. Reopen XPay.')
 const code=new URL('https://app.hashpaylink.com/pos/ng');code.searchParams.set('merchant_id',destination.id);code.searchParams.set('n',network);code.searchParams.set('xpay_checkout_id',checkoutId)
 const data=await read('/api/ng-pos?view=pocket-scan&merchant_id='+encodeURIComponent(destination.id)+'&code='+encodeURIComponent(code.href))
 if(typeof data.paymentUrl!=='string'||!data.paymentUrl.startsWith('/pay?'))throw Error('Payment details are unavailable.')
 const params=new URLSearchParams(data.paymentUrl.slice(5))
 if(params.get('merchant')!==destination.id||params.get('src')!=='ngpos'||params.get('n')!==network||params.get('settlement')!==(current.kind==='bank'?'instant_fiat':'keep_crypto'))throw Error('Payment details changed. Reopen XPay.')
 params.set('xpay_checkout_id',checkoutId)
 return {params:params.toString(),merchant:terminal.checkout.name as string}
}
