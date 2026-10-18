import assert from 'node:assert/strict'
import {encodeFunctionData} from 'viem'
import {fixture,wallet,owner} from './fixtures/native-evm-swap.mjs'
import {COMPACT_V3_ABI,ETHEREUM_WETH,ethereumV3Pool} from '../api/pocket/native-ethereum-compact-swap.ts'
import {nativeSwapPair,nativeSwapAssets} from '../src/pocket/lib/pocketNativeSwap.ts'
import {validateNativeEvmSwap,nativeSwapBatch,sealNativeEvmSwap,openNativeEvmSwap,quoteNativeEvmSwap} from '../api/pocket/native-evm-swap-quote.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='compact-swap-fixture-secret-'.repeat(3)
const reverseFlag=1n<<255n,unwrapFlag=1n<<253n
const assets=nativeSwapAssets('ethereum'),usdc=assets.find(a=>a.symbol==='USDC').address,usdt=assets.find(a=>a.symbol==='USDT').address
assert.equal(ethereumV3Pool(ETHEREUM_WETH,usdc,500).address.toLowerCase(),'0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640')
function path(tokens,unwrap){return tokens.slice(0,-1).map((token,i)=>{const pool=ethereumV3Pool(token,tokens[i+1],500);return BigInt(pool.address)|(token.toLowerCase()===pool.token1.toLowerCase()?reverseFlag:0n)|(unwrap&&i===tokens.length-2?unwrapFlag:0n)})}
function encode(q,route,receiver=BigInt(wallet),amount=BigInt(q.amountUnits),minimum=BigInt(q.minimumOutUnits)){q.tx.data=encodeFunctionData({abi:COMPACT_V3_ABI,functionName:'uniswapV3SwapTo',args:[receiver,amount,minimum,route]});q.callData=nativeSwapBatch(q);return q}
let count=0
for(const stable of ['USDC','USDT'])for(const reverse of [false,true])for(const multi of [false,true]){
 const {q,response,binding,now}=await fixture('ethereum',reverse,stable),{tokenIn,tokenOut}=nativeSwapPair('ethereum',q.from,q.to),from=tokenIn.native?ETHEREUM_WETH:tokenIn.address,to=tokenOut.native?ETHEREUM_WETH:tokenOut.address,other=stable==='USDC'?usdt:usdc
 const route=path(multi?[from,other,to]:[from,to],reverse);encode(q,route);
 const packedExpectation=(0x777777771111800000000000n<<160n)|BigInt(q.expectedOutUnits),packedFee=(0x777777771111n<<208n)|(100n<<160n)|BigInt(wallet)
 const providerTx={...q.tx,data:q.tx.data+packedExpectation.toString(16).padStart(64,'0')+packedFee.toString(16).padStart(64,'0'),minReceiveAmount:q.minimumOutUnits}
 const prepared=await quoteNativeEvmSwap(binding,async()=> '0.00001',async path=>path==='swap'?{...response,tx:providerTx}:{dexContractAddress:q.spender},()=>now)
 assert.equal(prepared.positiveSlippageFee.capPercent,10);assert.ok(openNativeEvmSwap(sealNativeEvmSwap(prepared),owner))
 assert.ok(validateNativeEvmSwap(q));assert.ok(openNativeEvmSwap(sealNativeEvmSwap(q),owner));count++
 assert.ok(validateNativeEvmSwap(encode(structuredClone(q),route,0n)))
 assert.ok(validateNativeEvmSwap(encode(structuredClone(q),route,BigInt(wallet)|(123n<<160n))))
 for(const badRoute of [[],[...route,route[0]],route.map((x,i)=>i?x:x^reverseFlag),route.map((x,i)=>i?x:x|(1n<<254n)),route.map((x,i)=>i?x:(x&~((1n<<160n)-1n))|1n),route.map((x,i)=>i===route.length-1?x^unwrapFlag:x)])assert.throws(()=>validateNativeEvmSwap(encode(structuredClone(q),badRoute)))
 assert.throws(()=>validateNativeEvmSwap(encode(structuredClone(q),route,2n)))
 assert.throws(()=>validateNativeEvmSwap(encode(structuredClone(q),route,BigInt(wallet),1n)))
 assert.throws(()=>validateNativeEvmSwap(encode(structuredClone(q),route,BigInt(wallet),BigInt(q.amountUnits),1n)))
 const extra=structuredClone(q);extra.tx.data+='00';extra.callData=nativeSwapBatch(extra);assert.throws(()=>validateNativeEvmSwap(extra))
 const wrongChain=structuredClone(q);wrongChain.network='base';assert.throws(()=>validateNativeEvmSwap(wrongChain))
}
console.log('PASS '+count+' Ethereum compact routes: canonical pool address, direct/multihop in both directions, packed order ID, owner/amount/minimum, direction/unwrap/unknown-bit/path/trailer rejection')
