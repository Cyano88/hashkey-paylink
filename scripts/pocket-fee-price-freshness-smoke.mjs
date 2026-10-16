import assert from 'node:assert/strict'
import {readStockMarketPrices} from '../api/pocket/xstocks-prices.ts'
process.env.OKX_DEX_API_KEY='fixture';process.env.OKX_DEX_SECRET_KEY='fixture';process.env.OKX_DEX_PASSPHRASE='fixture'
const original=Date.now;let now=1700000000000,calls=0;Date.now=()=>now
const token='0x779ded0c9e1022225f8e0630b35a9b54be713736'
const fetcher=async()=>{calls++;return {ok:true,json:async()=>({code:'0',data:[{chainIndex:'196',tokenContractAddress:token,price:'1',time:String(now)}]})}}
try{
 await readStockMarketPrices([token],fetcher);assert.equal(calls,1)
 now+=15000;await readStockMarketPrices([token],fetcher);assert.equal(calls,1,'ordinary balance display preserves cache')
 const prices=await readStockMarketPrices([token],fetcher,10000);assert.equal(calls,2,'transaction quote refreshes old prices before the normal 30 second cache interval');assert.equal(prices[token].fetchedAt,now)
 await readStockMarketPrices([token],fetcher,10000);assert.equal(calls,2,'fresh transaction price does not cause repeated provider requests')
 console.log('PASS transaction price freshness refresh and existing display cache preserved.')
}finally{Date.now=original}
