import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbiItem} from 'viem'
const mocks={
 './xstocks-swap-provider.js':'export const quoteStockSwap=async()=>{}',
 './xstocks-prices.js':'export const readStockMarketPrices=async()=>({})',
 './xstocks-notifications-store.js':'export const stockNoticeClient={}'
}
await build({entryPoints:['api/pocket/xpay-stock-funding.ts'],outfile:'.codex-temp/xpay-funding-test.mjs',bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const {verifyXPayStockSwap,stockUnitsForFunding}=await import('../.codex-temp/xpay-funding-test.mjs')
const source='0x'+'1'.repeat(40),router='0x'+'2'.repeat(40),token='0x'+'3'.repeat(40),usdc='0xB6CEceAB302E2E4948951eE7843FC24E92933061'
assert.equal(stockUnitsForFunding(1000000n,'200',18),5030000000000000n)
assert.throws(()=>stockUnitsForFunding(0n,'200',18));assert.throws(()=>stockUnitsForFunding(100n,'0',18))
const quote={owner:source,tx:{to:router,data:'0x1234',value:'0'},tokenIn:{address:token},tokenOut:{address:usdc},decimalsOut:6,amountUnits:'500',minimumOutUnits:'1000000'}
const tx={from:source,to:router,input:'0x1234',value:0n},event=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')
const log=(address,from,to,amount)=>({address,topics:encodeEventTopics({abi:[event],eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[amount])})
const logs=[log(token,source,router,500n),log(usdc,router,source,1000001n)]
assert.equal(verifyXPayStockSwap(quote,tx,{status:'success',logs},1000000n).state,'confirmed')
assert.equal(verifyXPayStockSwap(quote,tx,{status:'reverted',logs:[]},1000000n).state,'failed')
for(const patch of [{from:router},{to:token},{input:'0x5678'},{value:1n}])assert.throws(()=>verifyXPayStockSwap(quote,{...tx,...patch},{status:'reverted',logs},1000000n))
assert.throws(()=>verifyXPayStockSwap(quote,tx,{status:'success',logs:logs.slice(1)},1000000n))
assert.throws(()=>verifyXPayStockSwap(quote,tx,{status:'success',logs:[...logs,log(usdc,source,router,2n)]},1000000n))
assert.throws(()=>verifyXPayStockSwap(quote,tx,{status:'success',logs:[...logs,log(token,source,router,1n)]},1000000n))
assert.throws(()=>verifyXPayStockSwap({...quote,tokenOut:{address:token}},tx,{status:'success',logs},1000000n))
console.log('PASS stock funding proof: integer estimate, exact approved transaction, native USDC net arrival, input spending cap, and no retry for an unrelated reverted hash.')
