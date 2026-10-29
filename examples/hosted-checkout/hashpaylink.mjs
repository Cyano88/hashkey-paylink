// Node.js server only. Never import this file into a browser or mobile bundle.
import {createHmac,timingSafeEqual} from 'node:crypto'
const origin='https://app.hashpaylink.com'

async function api(path,apiKey,options={},fetcher=fetch){
 const response=await fetcher(origin+path,{...options,headers:{'X-API-Key':apiKey,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)})
 const data=await response.json()
 if(!response.ok||data.ok===false)throw Object.assign(Error(data.error||'Hash PayLink request failed'),{status:response.status})
 return data
}

export async function createCheckout(order,apiKey,fetcher=fetch){
 // These values come from YOUR saved order, never prices supplied by the browser.
 const data=await api('/api/v2/checkouts',apiKey,{method:'POST',headers:{'Idempotency-Key':order.attemptKey},body:JSON.stringify({kind:'service',checkoutMode:'human',paymentSelection:'stablecoins',title:order.description,amount:order.amount,returnUrl:order.returnUrl,expiresInMinutes:15})},fetcher)
 const url=new URL(data.checkoutUrl,origin)
 if(url.origin!==origin||!/^\/pay\/c\/chks_[a-f0-9]{24}$/.test(url.pathname)||data.checkoutId!==url.pathname.split('/').pop())throw Error('Unexpected checkout response')
 return {checkoutId:data.checkoutId,checkoutUrl:url.toString()}
}

export function verifyWebhook(rawBody,signature,secret,now=Date.now()){
 if(!Buffer.isBuffer(rawBody)||!secret)throw Error('Raw body and webhook secret required')
 const match=typeof signature==='string'&&/^t=(\d{10}),v1=([a-f0-9]{64})$/.exec(signature)
 if(!match||Math.abs(now/1000-Number(match[1]))>300)throw Error('Invalid webhook signature')
 const expected=createHmac('sha256',secret).update(match[1]+'.').update(rawBody).digest()
 if(!timingSafeEqual(expected,Buffer.from(match[2],'hex')))throw Error('Invalid webhook signature')
 const event=JSON.parse(rawBody.toString('utf8'))
 if(typeof event.id!=='string'||!event.id||event.id.length>180||typeof event.event!=='string')throw Error('Invalid webhook event')
 return event
}

// Stablecoin selection accepts at most six decimal places. Compare exact units.
const units=value=>{if(!/^\d+(\.\d{1,6})?$/.test(String(value)))throw Error('Invalid amount');const[a,b='']=String(value).split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'))}
export async function readOrderPayment(order,apiKey,fetcher=fetch){
 const status=await api('/api/v2/checkouts?purpose=status&id='+encodeURIComponent(order.checkoutId),apiKey,{},fetcher)
 if(status.checkoutId!==order.checkoutId)throw Error('Checkout does not match the order')
 if(status.status!=='paid')return {paid:false,status:status.status}
 const asset=status.asset||status.checkout?.asset
 const network=status.network||status.payment?.network||status.checkout?.network
 const amount=status.payment?.amount??status.checkout?.amount??status.amount
 if(units(amount)!==units(order.amount)||!order.acceptedAssets.includes(asset)||!order.acceptedNetworks.includes(network))throw Error('Payment does not match the order')
 return {paid:true,status:'paid',asset,network,amount,receiptId:status.payment?.receiptId||null,transactionHash:status.payment?.txHash||null}
}
