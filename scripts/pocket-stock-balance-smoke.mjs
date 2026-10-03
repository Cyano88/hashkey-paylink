import assert from 'node:assert/strict'
import {pocketStockBalanceValue} from '../src/pocket/lib/pocketStockBalanceValue.ts'
import {stockAssets,stockUsdc,stockGasPriceAddress} from '../src/pocket/lib/pocketXStocksWallet.ts'
const asset=stockAssets.find(a=>a.symbol==='NVDAx')
const snapshot={complete:true,cash:500000000n,gas:200000000000000000n,holdings:[{asset,units:5000000000000000000n,decimals:18}]}
const prices={[asset.address.toLowerCase()]:{usd:146},[stockUsdc.address.toLowerCase()]:{usd:1},[stockGasPriceAddress]:{usd:100}}
assert.deepEqual(pocketStockBalanceValue(snapshot,prices),{cash:500,gas:.2,investments:730,total:1250})
assert.equal(pocketStockBalanceValue(snapshot,{...prices,[stockGasPriceAddress]:undefined}).total,null)
assert.equal(pocketStockBalanceValue(snapshot,{...prices,[asset.address.toLowerCase()]:undefined}).investments,null)
assert.equal(pocketStockBalanceValue({...snapshot,cash:null},prices).total,null)
assert.equal(pocketStockBalanceValue({...snapshot,complete:false},prices).total,null)
assert.deepEqual(pocketStockBalanceValue({...snapshot,cash:0n,gas:0n,holdings:[]},{}),{cash:0,gas:0,investments:0,total:0})
assert.deepEqual(pocketStockBalanceValue(null,prices),{cash:null,gas:null,investments:null,total:null})
assert.equal(pocketStockBalanceValue(snapshot,{...prices,[stockUsdc.address.toLowerCase()]:{usd:.99}}).total,1245)
console.log('PASS total includes USDC, stocks and OKB; missing values remain unknown; known zero balances need no prices; USDC uses its quoted value.')

const {default:priceHandler}=await import('../api/pocket/xstocks-prices.ts')
const originalFetch=globalThis.fetch,keys=['OKX_DEX_API_KEY','OKX_DEX_SECRET_KEY','OKX_DEX_PASSPHRASE'],old=keys.map(k=>process.env[k]);keys.forEach(k=>process.env[k]='fixture')
try{
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://web3.okx.com/api/v6/dex/market/price');assert.deepEqual(JSON.parse(options.body),[{chainIndex:'196',tokenContractAddress:stockGasPriceAddress}]);return Response.json({code:'0',data:[{chainIndex:'196',tokenContractAddress:stockGasPriceAddress,price:'100',time:String(Date.now())}]})}
 let status=200,body;const res={setHeader(){},status(n){status=n;return this},json(b){body=b}}
 await priceHandler({method:'POST',body:{addresses:[stockGasPriceAddress]}},res)
 assert.equal(status,200);assert.equal(body.quotes[stockGasPriceAddress].usd,100)
 await priceHandler({method:'POST',body:{addresses:['0x'+'1'.repeat(40)]}},res);assert.equal(status,400)
 console.log('PASS native OKB price route uses the X Layer native-token identifier and rejects unsupported assets.')
}finally{globalThis.fetch=originalFetch;keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i])}
