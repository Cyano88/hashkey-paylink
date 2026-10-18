import assert from 'node:assert/strict'
import {NATIVE_SWAP_NETWORKS,nativeSwapPair,nativeSwapAssets} from '../src/pocket/lib/pocketNativeSwap.ts'
import {quoteNativeSwap,nativeSwapUnits} from '../api/pocket/native-swap-quote.ts'
import {fixture,owner} from './fixtures/native-evm-swap.mjs'
import {sealNativeEvmSwap,openNativeEvmSwap,quoteNativeEvmSwap} from '../api/pocket/native-evm-swap-quote.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='flexible-minimum-fixture-'.repeat(3)
let previews=0,executables=0
for(const network of NATIVE_SWAP_NETWORKS)for(const stable of ['USDC','USDT'])for(const reverse of [false,true]){
 const native=nativeSwapAssets(network)[0],from=reverse?stable:native.symbol,to=reverse?native.symbol:stable,{tokenIn,tokenOut}=nativeSwapPair(network,from,to),amount=reverse?'0.1':'0.0001'
 const route={chainIndex:{ethereum:'1',base:'8453',arbitrum:'42161',polygon:'137',solana:'501'}[network],fromTokenAmount:String(nativeSwapUnits(amount,tokenIn.decimals)),toTokenAmount:reverse?'1000000':'100000',priceImpactPercent:'0',fromToken:{tokenContractAddress:tokenIn.address,decimal:tokenIn.decimals,taxRate:'0'},toToken:{tokenContractAddress:tokenOut.address,decimal:tokenOut.decimals,taxRate:'0'}}
 assert.equal((await quoteNativeSwap({network,from,to,amount},async()=>route)).expectedOutUnits,route.toTokenAmount);previews++
 await assert.rejects(()=>quoteNativeSwap({network,from,to,amount:'0'},async()=>assert.fail('Zero must not reach provider')))
 await assert.rejects(()=>quoteNativeSwap({network,from,to,amount},async()=>({...route,toTokenAmount:'0'})))
 if(network==='solana')continue
 const f=await fixture(network,reverse,stable,true)
 const opened=openNativeEvmSwap(sealNativeEvmSwap(f.q),owner,false,f.now)
 assert.ok(BigInt(reverse?opened.amountUnits:opened.expectedOutUnits)<500000n);executables++
 if(reverse)await assert.rejects(()=>quoteNativeEvmSwap(f.binding,async()=> '1',f.provider),/too small to cover the network fee/)
 else await assert.rejects(()=>quoteNativeEvmSwap(f.binding,async()=> '0.00001',f.provider,Date.now,async()=>false),/Insufficient/)
}
console.log(`PASS ${previews} sub-0.50 quote directions; ${executables} sealed executable EVM directions; zero, no output, unaffordable fees and insufficient balances still rejected`)
