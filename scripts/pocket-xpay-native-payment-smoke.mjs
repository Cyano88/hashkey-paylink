import assert from 'node:assert/strict'
import {build} from 'esbuild'
const b=await build({entryPoints:['src/pocket/api/pocketXPayPaymentClient.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'routes',setup(b){b.onResolve({filter:/pocketRoutes$/},()=>({path:'routes',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const pocketApiUrl=p=>p'}))}}]})
const {readPocketXPayPayment}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
async function check(network,kind='stablecoins',mutate=()=>{}){const destination={id:'merchant',kind,revision:'r1',networks:[network]};const terminal={ok:true,checkout:{id:'terminal',name:'Test shop',destinations:[destination]}};const params=new URLSearchParams({src:'ngpos',merchant:'merchant',n:network,settlement:kind==='bank'?'instant_fiat':'keep_crypto',f:'1',e:'0x1111111111111111111111111111111111111111'});const payment={ok:true,paymentUrl:'/pay?'+params};mutate(terminal,payment);const calls=[];const result=await readPocketXPayPayment({checkoutId:'terminal',destination:{...destination,revision:'r1'},network,fetcher:async url=>{calls.push(url);return new Response(JSON.stringify(calls.length===1?terminal:payment))}});assert.equal(calls.length,2);assert.equal(new URLSearchParams(result.params).get('xpay_checkout_id'),'terminal');assert.equal(result.merchant,'Test shop')}
for(const network of ['base','arbitrum','arc','ethereum','polygon','solana'])await check(network)
await check('base','bank')
await assert.rejects(check('arbitrum','bank'),/changed/)
await assert.rejects(check('base','stablecoins',t=>t.checkout.id='other'),/changed/)
await assert.rejects(check('base','stablecoins',t=>t.checkout.destinations[0].revision='r2'),/changed/)
await assert.rejects(check('base','stablecoins',(t,p)=>p.paymentUrl=p.paymentUrl.replace('merchant=merchant','merchant=other')),/changed/)
await assert.rejects(check('base','stablecoins',(t,p)=>p.paymentUrl=p.paymentUrl.replace('n=base','n=arbitrum')),/changed/)
console.log('PASS native merchant resolution: six networks, bank Base, stale terminal/revision and mismatched merchant/network rejected')
