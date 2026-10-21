import assert from 'node:assert/strict'
import {createBscRuntime,bscConfiguredFeePolicy,parseBscMarketPrices} from '../api/pocket/bsc-runtime.ts'
const env={PRIVATE_RPC_URL_BSC:'https://private.example.invalid',POCKET_XLAYER_FEE_POLICY:'observed_cost',POCKET_XLAYER_OBSERVED_COST_USD_MICROS:'10000',POCKET_XLAYER_FEE_MARGIN_BPS:'2500',POCKET_XLAYER_MIN_FEE_UNITS:'10000',POCKET_XLAYER_MAX_FEE_UNITS:'1000000'}
const now=Date.now()
const rows=[['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','742.5875798762323825634551292133302'],['0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d','0.9999857400277765118681689192353124'],['0x55d398326f99059ff775485246999027b3197955','0.9966118744915897685777792318710468']].map(([tokenContractAddress,price])=>({chainIndex:'56',tokenContractAddress,price,time:String(now)}))
const prices=parseBscMarketPrices(rows,now)
assert.equal(prices.BNB.scaled8,74258757988n)
assert.equal(prices.USDC.scaled8,99998574n)
assert.equal(prices.USDT.scaled8,99661187n)
assert.throws(()=>parseBscMarketPrices([...rows,rows[0]],now))
assert.throws(()=>parseBscMarketPrices(rows,now+30000))
assert.throws(()=>parseBscMarketPrices(rows.map(r=>({...r,chainIndex:'196'})),now))
const p=bscConfiguredFeePolicy(env)
assert.equal(p.minimumFeeUnits,10000000000000000n)
assert.equal(p.maximumFeeUnits,1000000000000000000n)
assert.equal(p.providerAllowanceUsdMicros,10000n)
assert.throws(()=>bscConfiguredFeePolicy({...env,POCKET_XLAYER_MIN_FEE_UNITS:'1e6'}))
assert.throws(()=>createBscRuntime({...env,PRIVATE_RPC_URL_BSC:'http://example.invalid'}))
let chain='0x38',decimals='0x12',wrongId=false,calls=[]
const runtime=createBscRuntime(env,async(url,options)=>{
 const body=JSON.parse(options.body);calls.push(body)
 let result
 if(body.method==='eth_chainId')result=chain
 else if(body.method==='eth_getBalance')result='0xde0b6b3a7640000'
 else if(body.method==='eth_call')result=body.params[0].data==='0x313ce567'?decimals:'0xde0b6b3a7640000'
 else if(body.method==='eth_estimateGas')result='0x186a0'
 else if(body.method==='eth_gasPrice')result='0x3b9aca00'
 else throw Error('Unexpected RPC')
 return new Response(JSON.stringify({jsonrpc:'2.0',id:wrongId?body.id+1:body.id,result}),{status:200})
})
const wallet='0x1111111111111111111111111111111111111111'
for(const asset of ['BNB','USDC','USDT'])assert.equal(await runtime.balance(asset,wallet),10n**18n)
assert.equal(calls.filter(c=>c.method==='eth_call'&&c.params[0].data!=='0x313ce567').every(c=>c.params[1]==='pending'),true)
const gas=await runtime.estimateNative({from:'BNB',walletAddress:wallet,tx:{to:wallet,data:'0x1234',value:'1000'}})
assert.deepEqual(gas,{gasLimit:'120000',maxFeePerGas:'1500000000',maxPriorityFeePerGas:'1500000000'})
chain='0xc4';await assert.rejects(()=>runtime.balance('BNB',wallet));await assert.rejects(()=>runtime.estimateNative({from:'BNB'}))
chain='0x38';decimals='0x6';await assert.rejects(()=>runtime.balance('USDC',wallet))
decimals='0x12';wrongId=true;await assert.rejects(()=>runtime.balance('BNB',wallet))
console.log('PASS BSC runtime: 18-decimal fee scaling, pending balances, native gas reserve, wrong-chain/decimals/RPC-ID rejection; no signing or broadcasts')
