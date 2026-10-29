import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {createCheckout,verifyWebhook,readOrderPayment} from '../examples/hosted-checkout/hashpaylink.mjs'
const id='chks_'+'a'.repeat(24),key='fixture-only-not-a-real-key'
const order={id:'order-1042',attemptKey:'order:order-1042:1',description:'Shop order 1042',amount:'1.50',returnUrl:'https://shop.example/orders/1042',acceptedAssets:['USDT'],acceptedNetworks:['xlayer'],checkoutId:id}
const calls=[];const create=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({ok:true,checkoutId:id,checkoutUrl:'/pay/c/'+id}),{status:200})}
assert.deepEqual(await createCheckout(order,key,create),{checkoutId:id,checkoutUrl:'https://app.hashpaylink.com/pay/c/'+id})
await createCheckout(order,key,create);assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key'])
assert.equal(JSON.parse(calls[0].options.body).paymentSelection,'stablecoins');assert(!JSON.parse(calls[0].options.body).recipient)
await assert.rejects(createCheckout(order,key,async()=>new Response(JSON.stringify({ok:false,error:'Not approved'}),{status:403})),/Not approved/)
await assert.rejects(createCheckout(order,key,async()=>new Response(JSON.stringify({ok:true,checkoutId:id,checkoutUrl:'https://other.example/pay/c/'+id}))),/Unexpected checkout/)
const now=Date.now(),timestamp=Math.floor(now/1000),secret='fixture-signing-secret',body=Buffer.from(JSON.stringify({id:'event-123',event:'payment.confirmed',data:{checkoutSessionId:id,checkoutId:'chkx_'+'b'.repeat(24)}}))
const signature='t='+timestamp+',v1='+createHmac('sha256',secret).update(timestamp+'.').update(body).digest('hex')
assert.equal(verifyWebhook(body,signature,secret,now).data.checkoutSessionId,id)
assert.throws(()=>verifyWebhook(Buffer.from(body+' '),signature,secret,now),/Invalid webhook/)
assert.throws(()=>verifyWebhook(body,signature,secret,now+301000),/Invalid webhook/)
assert.throws(()=>verifyWebhook(body,signature,'wrong',now),/Invalid webhook/)
const paid={ok:true,checkoutId:id,selectedCheckoutId:'chkx_'+'b'.repeat(24),status:'paid',asset:'USDT',network:'xlayer',payment:{status:'paid',amount:'1.5',receiptId:'fixture-receipt'}}
const fetchStatus=data=>async(url,options)=>{assert(url.includes(encodeURIComponent(id)));assert.equal(options.headers['X-API-Key'],key);return new Response(JSON.stringify(data))}
assert.equal((await readOrderPayment(order,key,fetchStatus(paid))).paid,true)
for(const change of [{asset:'USDC'},{network:'base'},{checkoutId:'other'},{payment:{amount:'1.500001'}},{payment:{amount:undefined}}])await assert.rejects(readOrderPayment(order,key,fetchStatus({...paid,...change})))
assert.deepEqual(await readOrderPayment(order,key,fetchStatus({...paid,status:'processing'})),{paid:false,status:'processing'})
console.log('PASS copyable builder helpers: exact create contract, stable retry key, error handling, trusted URL, raw signature/staleness, parent-child mapping, exact amount/asset/network and processing behavior. No real APIs called.')
