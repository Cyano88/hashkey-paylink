import {readFileSync} from 'node:fs'
import {encodeFunctionData,getAddress} from 'viem'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.ts'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.ts'
import {NATIVE_SWAP_CONTRACTS} from '../../api/pocket/native-evm-swap-quote.ts'
import {quoteCashConversion,cashConversionCalls} from '../../api/pocket/cash-conversion-quote.ts'
const abi=JSON.parse(readFileSync(new URL('../../src/pocket/lib/pocketOkxRouterAbi.json',import.meta.url),'utf8'))
export const owner='cash-owner',wallet='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64),rate=3000n*100000000n
export function transfer(token,from,to,units){return {address:token,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+'0'.repeat(24)+from.slice(2).toLowerCase(),'0x'+'0'.repeat(24)+to.slice(2).toLowerCase()],data:'0x'+units.toString(16).padStart(64,'0')}}
export async function cashFixture(){
 const now=Date.now(),out=10000000n,min=9950000n,contracts=NATIVE_SWAP_CONTRACTS.base
 const data=encodeFunctionData({abi,functionName:'smartSwapByOrderId',args:[1n,{fromToken:BigInt(BASE_STABLECOINS.USDT.address),toToken:getAddress(BASE_STABLECOINS.USDC.address),fromTokenAmount:10000000n,minReturnAmount:min,deadLine:BigInt(Math.floor(now/1000)+300)},[],[],[]]})
 const response={routerResult:{chainIndex:'8453',swapMode:'exactIn',fromTokenAmount:'10000000',toTokenAmount:String(out),priceImpactPercent:'0',fromToken:{tokenContractAddress:BASE_STABLECOINS.USDT.address,decimal:'6',taxRate:'0'},toToken:{tokenContractAddress:BASE_STABLECOINS.USDC.address,decimal:'6',taxRate:'0'}},tx:{from:wallet,to:getAddress(contracts.router),data,value:'0',minReceiveAmount:String(min)}}
 const binding={ownerId:owner,walletId:'wallet',walletAddress:wallet,network:'base',from:'USDT',to:'USDC',amount:'10'}
 const provider=async path=>path==='swap'?structuredClone(response):{dexContractAddress:contracts.spender}
 const q=await quoteCashConversion(binding,async()=> '0.00001',rate,provider,()=>now)
 const calls=cashConversionCalls(q).map(c=>({type:'CALL',from:wallet,to:c.target,input:c.data,value:'0x0'}))
 calls[2].logs=[transfer(BASE_STABLECOINS.USDT.address,wallet,contracts.router,10000000n),transfer(BASE_STABLECOINS.USDC.address,contracts.router,wallet,out)]
 calls[4].logs=[transfer(BASE_STABLECOINS.USDC.address,wallet,EVM_PLATFORM_TREASURY,BigInt(q.feeUnits))]
 return {q,binding,response,provider,now,out,trace:{type:'CALL',to:wallet,input:q.callData,calls}}
}
