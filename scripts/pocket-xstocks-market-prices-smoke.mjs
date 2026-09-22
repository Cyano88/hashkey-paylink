import assert from 'node:assert/strict'
import {parseStockMarketPrices,readStockMarketPrices} from '../api/pocket/xstocks-prices.ts'
const address='0xc845b2894dbddd03858fd2d643b4ef725fe0849d',now=Date.now()
const row={chainIndex:'196',tokenContractAddress:address,price:'228.5',time:String(now)}
assert.equal(parseStockMarketPrices([row],[address],now)[address].usd,228.5)
for(const bad of [{...row,chainIndex:'1'},{...row,time:String(now-60001)},{...row,time:String(now+6000)},{...row,price:'NaN'},{...row,price:'0'}])assert.equal(Object.keys(parseStockMarketPrices([bad],[address],now)).length,0)
const keys=['OKX_DEX_API_KEY','OKX_DEX_SECRET_KEY','OKX_DEX_PASSPHRASE'],old=keys.map(k=>process.env[k]);keys.forEach(k=>process.env[k]='fixture')
let calls=0
try{const fetcher=async(url,options)=>{calls++;assert.equal(options.method,'POST');assert.equal(url,'https://web3.okx.com/api/v6/dex/market/price');assert.equal(JSON.parse(options.body)[0].chainIndex,'196');assert.ok(options.headers['OK-ACCESS-SIGN']);return new Response(JSON.stringify({code:'0',data:[row]}))};const [a,b]=await Promise.all([readStockMarketPrices([address],fetcher),readStockMarketPrices([address],fetcher)]);assert.equal(calls,1);assert.equal(a[address].usd,228.5);assert.deepEqual(a,b);await readStockMarketPrices([address],fetcher);assert.equal(calls,1)}finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i])}
console.log('PASS OKX price chain/address/time validation, signed POST, shared request and cache reuse.')
