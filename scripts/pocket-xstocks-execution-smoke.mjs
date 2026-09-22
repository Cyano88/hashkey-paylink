import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { encodeFunctionData, getAddress, parseUnits } from 'viem'
import { stockAmountUnits, stockAssets, stockClient, stockUsdc, readStockHoldings } from '../src/pocket/lib/pocketXStocksWallet.ts'
import { validateStockSwap, readStockSwapFee, OKX_XLAYER_ROUTER, OKX_XLAYER_SPENDER } from '../src/pocket/lib/pocketXStocksSwap.ts'
import { sealStockQuote, openStockQuote, okxGet } from '../api/pocket/xstocks-swap-provider.ts'

const abi=JSON.parse(readFileSync('src/pocket/lib/pocketOkxRouterAbi.json','utf8'))
const owner=getAddress('0x1111111111111111111111111111111111111111')
const tokenOut=stockAssets.find(a=>a.symbol==='NVDAx')
const base={fromToken:BigInt(stockUsdc.address),toToken:getAddress(tokenOut.address),fromTokenAmount:1_000_000n,minReturnAmount:995_000_000_000_000n,deadLine:BigInt(Math.floor(Date.now()/1000)+600)}
const encode=(b=base,receiver=owner)=>encodeFunctionData({abi,functionName:'uniswapV3SwapToWithBaseRequest',args:[1n,receiver,b,[1n]]})
const q={id:'fixture',chainId:196,owner,tokenIn:stockUsdc,tokenOut,amount:'1',amountUnits:'1000000',decimalsIn:6,decimalsOut:18,expectedOut:'0.001',minimumOut:'0.000995',minimumOutUnits:String(base.minReturnAmount),expiresAt:Date.now()+45000,gasFee:'0.00001',priceImpact:'0.1',approvalRequired:true,spender:getAddress(OKX_XLAYER_SPENDER),tx:{from:owner,to:getAddress(OKX_XLAYER_ROUTER),data:encode(),value:'0'}}
validateStockSwap(q,owner)
for(const bad of [
 {...q,chainId:1}, {...q,owner:'0x2222222222222222222222222222222222222222'}, {...q,expiresAt:Date.now()-1},
 {...q,tx:{...q.tx,to:owner}}, {...q,tx:{...q.tx,value:'1'}}, {...q,tx:{...q.tx,data:encode({...base,fromTokenAmount:2n})}},
 {...q,tx:{...q.tx,data:encode({...base,toToken:owner})}}, {...q,tx:{...q.tx,data:encode({...base,minReturnAmount:1n})}},
 {...q,tx:{...q.tx,data:encode(base,'0x2222222222222222222222222222222222222222')}},
 {...q,tx:{...q.tx,data:encode()+'00'}}, {...q,spender:owner},
]) assert.throws(()=>validateStockSwap(bad,owner))
const dagData=encodeFunctionData({abi,functionName:'dagSwapTo',args:[1n,owner,base,[{mixAdapters:[],assetTo:[],rawData:[],extraData:[],fromToken:BigInt(stockUsdc.address)}]]})
const expected=parseUnits(q.expectedOut,q.decimalsOut)
const trim=(threshold=expected,cap=100n)=>((0x777777771111800000000000n<<160n)|threshold).toString(16).padStart(64,'0')+((0x777777771111n<<208n)|(cap<<160n)|BigInt(owner)).toString(16).padStart(64,'0')
const dag={...q,tx:{...q.tx,data:dagData+trim()}}
dag.positiveSlippageFee=readStockSwapFee(dag);validateStockSwap(dag,owner)
assert.equal(dag.positiveSlippageFee.capPercent,10)
for(const tail of [trim(expected-1n),trim(expected,101n),trim()+'00'])assert.throws(()=>readStockSwapFee({...q,tx:{...q.tx,data:dagData+tail}}))
assert.throws(()=>validateStockSwap({...dag,positiveSlippageFee:undefined},owner))
const secret='fixture-key-not-a-production-secret-123456789'
const token=sealStockQuote(q,'fixture-user',secret)
assert.deepEqual(openStockQuote(token,'fixture-user',secret),q)
assert.throws(()=>openStockQuote(token,'other-user',secret))
assert.throws(()=>openStockQuote(token.slice(0,-4)+'AAAA','fixture-user',secret))
for(const amount of ['-1','1e3','0','0.0000001','1.0000001','NaN',' 1','01']) assert.throws(()=>stockAmountUnits(amount,6))
assert.equal(stockAmountUnits('1.25',6),1250000n)
const envNames=['OKX_DEX_API_KEY','OKX_DEX_SECRET_KEY','OKX_DEX_PASSPHRASE']
const old=envNames.map(k=>process.env[k])
envNames.forEach(k=>process.env[k]='fixture-only')
try {
 const result=await okxGet('swap',{chainIndex:'196',amount:'1000000'},async(url,opts)=>{
  assert.match(url,/^https:\/\/web3\.okx\.com\/api\/v6\/dex\/aggregator\/swap\?chainIndex=196&amount=1000000$/)
  assert.equal(opts.redirect,'error')
  assert.ok(opts.headers['OK-ACCESS-SIGN'])
  return new Response(JSON.stringify({code:'0',data:[{fixture:true}]}),{status:200})
 })
 assert.equal(result.fixture,true)
 await assert.rejects(okxGet('swap',{},async()=>new Response(JSON.stringify({code:'50000',data:[]}),{status:200})))
} finally { envNames.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]) }
console.log('PASS: wrong chain/owner/router/recipient/amount/minimum/spender/trailer rejected; signed quote isolation; decimal precision; OKX auth envelope; Pocket-only confirmation.')
if(process.argv.includes('--live-read')){
 const decimals=await stockClient.readContract({address:getAddress(stockUsdc.address),abi:[{type:'function',name:'decimals',stateMutability:'view',inputs:[],outputs:[{type:'uint8'}]}],functionName:'decimals'})
 assert.equal(decimals,6)
 const symbol=await stockClient.readContract({address:getAddress(stockUsdc.address),abi:[{type:'function',name:'symbol',stateMutability:'view',inputs:[],outputs:[{type:'string'}]}],functionName:'symbol'})
 assert.equal(symbol,'USDC')
 const holdings=await readStockHoldings('0x0000000000000000000000000000000000000000')
 console.log('READ ONLY: native USDC verified; catalogue read completeness:',holdings.complete)
}

