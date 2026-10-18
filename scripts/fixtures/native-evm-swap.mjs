import {readFileSync} from 'node:fs'
import {encodeFunctionData,getAddress,formatUnits} from 'viem'
import {nativeSwapPair} from '../../src/pocket/lib/pocketNativeSwap.ts'
import {nativeSwapUnits} from '../../api/pocket/native-swap-quote.ts'
import {NATIVE_SWAP_CONTRACTS,quoteNativeEvmSwap,nativeSwapCalls} from '../../api/pocket/native-evm-swap-quote.ts'
const abi=JSON.parse(readFileSync(new URL('../../src/pocket/lib/pocketOkxRouterAbi.json',import.meta.url),'utf8'))
export const owner='owner',wallet='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64)
export async function fixture(network='base',reverse=false,stable='USDC'){
 const now=Date.now(),symbol=network==='polygon'?'POL':'ETH',from=reverse?stable:symbol,to=reverse?symbol:stable,pair=nativeSwapPair(network,from,to),input=reverse?'1':'0.01',units=nativeSwapUnits(input,pair.tokenIn.decimals),out=reverse?1000000000000000n:1000000n,min=out*995n/1000n
 const contracts=NATIVE_SWAP_CONTRACTS[network]
 const data=encodeFunctionData({abi,functionName:'smartSwapByOrderId',args:[1n,{fromToken:BigInt(pair.tokenIn.address),toToken:getAddress(pair.tokenOut.address),fromTokenAmount:units,minReturnAmount:min,deadLine:BigInt(Math.floor(now/1000)+300)},[],[],[]]})
 const response={routerResult:{chainIndex:{base:'8453',ethereum:'1',arbitrum:'42161',polygon:'137'}[network],fromTokenAmount:String(units),toTokenAmount:String(out),priceImpactPercent:'0',fromToken:{tokenContractAddress:pair.tokenIn.address,decimal:String(pair.tokenIn.decimals),taxRate:'0'},toToken:{tokenContractAddress:pair.tokenOut.address,decimal:String(pair.tokenOut.decimals),taxRate:'0'}},tx:{from:wallet,to:getAddress(contracts.router),data,value:reverse?'0':String(units),minReceiveAmount:String(min)}}
 const binding={ownerId:owner,walletId:'wallet',walletAddress:wallet,network,from,to,amount:input}
 const provider=async path=>path==='swap'?structuredClone(response):{dexContractAddress:contracts.spender}
 const q=await quoteNativeEvmSwap(binding,async()=> '0.00001',provider,()=>now)
 const calls=nativeSwapCalls(q).map(call=>({type:'CALL',from:wallet,to:call.target,input:call.data,value:'0x'+call.value.toString(16)}))
 const router=calls.find(c=>c.to.toLowerCase()===contracts.router.toLowerCase())
 if(reverse)router.calls=[{type:'CALL',from:contracts.router,to:wallet,input:'0x',value:'0x'+out.toString(16)}]
 else router.logs=[{address:pair.tokenOut.address,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', '0x'+'0'.repeat(24)+contracts.router.slice(2).toLowerCase(),'0x'+'0'.repeat(24)+wallet.slice(2)],data:'0x'+out.toString(16).padStart(64,'0')}]
 return {q,trace:{type:'CALL',to:wallet,input:q.callData,calls},provider,response,binding,out,now}
}
