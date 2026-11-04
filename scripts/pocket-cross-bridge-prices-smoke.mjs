import assert from 'node:assert/strict'
import {readCrossBridgePrices} from '../api/pocket/cross-bridge-prices.ts'
import {crossBridgeAssets,CROSS_BRIDGE_ROLLOUT_NETWORKS} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {now} from './fixtures/cross-bridge.mjs'
const credentials={key:'test-key',secret:'test-secret',passphrase:'test-pass'}
let count=0
for(const network of CROSS_BRIDGE_ROLLOUT_NETWORKS)for(const asset of crossBridgeAssets(network)){
 const options={now:()=>now,credentials,fetcher:async(url,init)=>{
  assert.equal(url,'https://web3.okx.com/api/v6/dex/market/price');assert.equal(init.redirect,'error')
  const requested=JSON.parse(init.body);assert.equal(requested.length,asset.native?1:2)
  return {ok:true,json:async()=>({code:'0',data:requested.map(row=>({...row,price:'1.123456789',time:String(now)}))})}
 }}
 const result=await readCrossBridgePrices(network,asset.symbol,options)
 assert.equal(result.gasPrice.scaled8,112345679n);assert.equal(result.assetPrice.scaled8,112345678n);assert.equal(result.assetPrice.observedAt,now);count++
}
for(const mutate of [rows=>rows.pop(),rows=>rows.push(rows[0]),rows=>rows[0].chainIndex='999',rows=>rows[0].tokenContractAddress='bad',rows=>rows[0].time=String(now-30000),rows=>rows[0].time=String(now+5001),rows=>rows[0].price='0',rows=>rows[0].price='1e3',rows=>rows[1].price='0.000000001']){
 await assert.rejects(()=>readCrossBridgePrices('base','USDC',{now:()=>now,credentials,fetcher:async(url,init)=>{const rows=JSON.parse(init.body).map(row=>({...row,price:'1.0',time:String(now)}));mutate(rows);return {ok:true,json:async()=>({code:'0',data:rows})}}}))
}
await assert.rejects(()=>readCrossBridgePrices('arc','USDC',{credentials}))
// Live OKX prices carry more than 30 fractional digits; preserve conservative
// integer rounding without rejecting valid provider precision.
const precise=await readCrossBridgePrices('base','USDC',{now:()=>now,credentials,fetcher:async(url,init)=>({ok:true,json:async()=>({code:'0',data:JSON.parse(init.body).map(row=>({...row,time:String(now),price:'0.9998466920823136210628920754652084'}))})})})
assert.equal(precise.gasPrice.scaled8,99984670n)
assert.equal(precise.assetPrice.scaled8,99984669n)
await assert.rejects(()=>readCrossBridgePrices('base','USDC',{now:()=>now,credentials,fetcher:async(url,init)=>({ok:true,json:async()=>({code:'0',data:JSON.parse(init.body).map(row=>({...row,time:String(now),price:'1.'+'1'.repeat(65)}))})})}))
await assert.rejects(()=>readCrossBridgePrices('base','USDC',{credentials:{}}))
console.log(`PASS fresh, identity-bound prices for ${count} source assets; adverse decimal rounding, native deduplication, missing/duplicate/wrong-chain/stale/future/malformed/zero data rejected. HTTP fixtures only.`)
