import assert from 'node:assert/strict'
import {readFallbackNetworkPrices} from '../api/payment-network-price-fallback.ts'
import {readNativeUsdcRate} from '../api/payment-network-fees.ts'
process.env.OKX_DEX_API_KEY='fixture';process.env.OKX_DEX_SECRET_KEY='fixture';process.env.OKX_DEX_PASSPHRASE='fixture'
const now=2_100_000_000_000
const rows=()=>[{chainIndex:'1',tokenContractAddress:'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',price:'3000',time:String(now)}, {chainIndex:'1',tokenContractAddress:'0xdac17f958d2ee523a2206206994597c13d831ec7',price:'0.99',time:String(now)}]
const response=data=>async()=>Response.json({code:'0',data})
assert.deepEqual(await readFallbackNetworkPrices('ethereum','USDT',response(rows()),()=>now),{native:3000,stable:0.99,oldestPriceAt:now})
for(const change of [r=>r[0].time=String(now-180000),r=>r[0].time=String(now+5001),r=>r[0].price='0',r=>r[0].chainIndex='137',r=>r.push({...r[0]}),r=>r.pop()]){
 const data=rows();change(data)
 await assert.rejects(readFallbackNetworkPrices('ethereum','USDT',response(data),()=>now),/unavailable/)
}
let calls=0
const fetcher=async(url,options)=>{
 calls++
 if(String(url).includes('coingecko'))return new Response('',{status:429})
 assert.equal(options.method,'POST');assert.equal(options.redirect,'error')
 assert.equal(JSON.parse(options.body)[1].tokenContractAddress,rows()[1].tokenContractAddress)
 return Response.json({code:'0',data:rows()})
}
assert.equal(await readNativeUsdcRate('ethereum',fetcher,()=>now,'USDT'),BigInt(Math.ceil(3000/0.99*1e8)))
assert.equal(await readNativeUsdcRate('ethereum',fetcher,()=>now+1000,'USDT'),BigInt(Math.ceil(3000/0.99*1e8)))
assert.equal(calls,2)
await assert.rejects(readNativeUsdcRate('ethereum',fetcher,()=>now+180001,'USDT'),/unavailable/)
console.log('PASS: fresh fallback, depegged stablecoin conversion, bounded cache; stale/future/zero/duplicate/missing/wrong-chain prices rejected.')
process.exit(0)
