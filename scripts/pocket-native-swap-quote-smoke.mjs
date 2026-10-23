import assert from 'node:assert/strict'
import {NATIVE_SWAP_NETWORKS,nativeSwapAssets,nativeSwapPair} from '../src/pocket/lib/pocketNativeSwap.ts'
import {quoteNativeSwap,nativeSwapUnits} from '../api/pocket/native-swap-quote.ts'
import {createNativeSwapPreviewHandler} from '../api/pocket/native-swap-preview.ts'
let total=0
for(const network of NATIVE_SWAP_NETWORKS){
 const native=nativeSwapAssets(network)[0]
 for(const stable of ['USDC','USDT'])for(const reverse of [false,true]){
  const from=reverse?stable:native.symbol,to=reverse?native.symbol:stable,{tokenIn,tokenOut}=nativeSwapPair(network,from,to)
  const input={network,from,to,amount:reverse?'1':'0.1'}
  const route={chainIndex:{ethereum:'1',base:'8453',arbitrum:'42161',polygon:'137',solana:'501'}[network],fromTokenAmount:String(nativeSwapUnits(input.amount,tokenIn.decimals)),toTokenAmount:reverse?String(10n**BigInt(tokenOut.decimals-2)):'1000000',priceImpactPercent:'-0.1',fromToken:{tokenContractAddress:tokenIn.address,decimal:String(tokenIn.decimals),taxRate:'0'},toToken:{tokenContractAddress:tokenOut.address,decimal:String(tokenOut.decimals),taxRate:'0'}}
  route.fromToken.tokenUnitPrice='123.45';route.toToken.tokenUnitPrice='0.999'
  const provider=async(path,query)=>{assert.equal(path,'quote');assert.equal(query.chainIndex,route.chainIndex);assert.equal(query.amount,route.fromTokenAmount);assert.equal(query.fromTokenAddress,tokenIn.address);assert.equal(query.toTokenAddress,tokenOut.address);assert.equal(query.swapMode,'exactIn');return route}
  const result=await quoteNativeSwap(input,provider,()=>1000);assert.equal(result.indicative,true);assert.equal(result.executionAvailable,false);assert.equal(result.expiresAt,16000);assert.equal(result.inputUsdPrice,123.45);assert.equal(result.outputUsdPrice,0.999);total++
  for(const mutate of [r=>r.chainIndex='56',r=>r.fromTokenAmount='2',r=>r.toTokenAmount='-1',r=>r.priceImpactPercent=null,r=>r.priceImpactPercent='4',r=>r.swapMode='exactOut',r=>r.toToken.decimal='18',r=>r.toToken.tokenContractAddress='other',r=>r.fromToken.taxRate='0.1']){
   const bad=structuredClone(route);mutate(bad);if(JSON.stringify(bad)!==JSON.stringify(route))await assert.rejects(()=>quoteNativeSwap(input,async()=>bad))
  }
  let tick=0;await assert.rejects(()=>quoteNativeSwap(input,provider,()=>tick++?16001:0),/expired/)
 }
}
for(const network of ['bnb','xlayer','__proto__'])assert.throws(()=>nativeSwapAssets(network))
assert.throws(()=>nativeSwapPair('base','USDC','USDC'))
for(const amount of ['0','-1','1e2','01','.1','0.0000001'])assert.throws(()=>nativeSwapUnits(amount,6))
let enabled=false,calls=0,owner='owner',blockchain='BASE'
const handler=createNativeSwapPreviewHandler({enabled:()=>enabled,identity:async()=>({userId:'owner'}),readLink:async()=>({privyUserId:owner,chain:'base',purpose:'payment',circleBlockchain:blockchain}),quote:async()=>{calls++;return {indicative:true,executionAvailable:false}}})
async function call(body){let status=200,data;await handler({method:'POST',body,headers:{}},{setHeader(){},status(s){status=s;return this},json(b){data=b;return this}});return {status,data}}
const body={action:'quote',network:'base',from:'ETH',to:'USDC',amount:'0.1'}
assert.equal((await call(body)).status,409);enabled=true;owner='other';assert.equal((await call(body)).status,409);owner='owner';blockchain='ETH';assert.equal((await call(body)).status,409);blockchain='BASE';assert.equal((await call({...body,action:'execute'})).status,400);assert.equal(calls,0);assert.equal((await call(body)).status,200);assert.equal(calls,1)
console.log('PASS '+total+' native/stable quote directions, exact chain/assets/decimals/units, price impact and expiry, minimums, owner binding, preview gate and execution rejection')
