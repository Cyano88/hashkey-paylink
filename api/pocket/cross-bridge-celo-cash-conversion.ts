import {encodeFunctionData,parseAbi,type Address} from 'viem'
import {crossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {inboundBridgeClient} from './inbound-bridge-networks.js'
import type {CrossBridgeInput} from './cross-bridge-provider.js'

const quoter='0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8'
const router='0x5615CDAb10dc425a742d643d949a7F474C01abc4'
const fee=100
const abi=parseAbi([
 'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256,uint160,uint32,uint256)',
 'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256)',
 'function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])',
 'function approve(address spender,uint256 amount) returns (bool)'
])
export const isCeloCashConversion=(i:CrossBridgeInput)=>i.source==='celo'&&i.destination==='base'&&i.from==='USDT'&&i.to==='USDC'&&i.purpose==='cash'
type Swap={quotedUnits:string;expiresAt:number}
function swapInput(i:CrossBridgeInput){
 if(!isCeloCashConversion(i)||!/^\d{1,38}$/.test(i.amountUnits)||BigInt(i.amountUnits)<=0n)throw Error('Invalid Celo conversion.')
 return {tokenIn:crossBridgeAsset('celo','USDT').address as Address,tokenOut:crossBridgeAsset('celo','USDC').address as Address,amountIn:BigInt(i.amountUnits),fee,sqrtPriceLimitX96:0n}
}
export async function quoteCeloCashConversion(i:CrossBridgeInput,now:number):Promise<Swap>{
 const {result}=await inboundBridgeClient('celo').simulateContract({address:quoter,abi,functionName:'quoteExactInputSingle',args:[swapInput(i)]})
 return {quotedUnits:String(result[0]),expiresAt:now+45000}
}
export function validateCeloCashConversion(swap:Swap,i:CrossBridgeInput,now:number){
 const input=swapInput(i)
 if(!/^\d{1,38}$/.test(swap?.quotedUnits)||!Number.isSafeInteger(swap.expiresAt)||swap.expiresAt<=now||swap.expiresAt>now+45000)throw Error('Invalid Celo conversion quote.')
 const quoted=BigInt(swap.quotedUnits),minimum=quoted*9990n/10000n
 if(minimum<=0n||quoted*100n<input.amountIn*98n||quoted*100n>input.amountIn*102n)throw Object.assign(Error('No route is available for this token pair.'),{status:422,code:'route_unavailable'})
 const approve=(amount:bigint)=>({target:input.tokenIn,value:0n,data:encodeFunctionData({abi,functionName:'approve',args:[router,amount]})})
 const swapData=encodeFunctionData({abi,functionName:'exactInputSingle',args:[{...input,recipient:i.sender as Address,amountOutMinimum:minimum}]})
 const call={target:router as Address,value:0n,data:encodeFunctionData({abi,functionName:'multicall',args:[BigInt(Math.floor(swap.expiresAt/1000)),[swapData]]})}
 return {calls:[approve(0n),approve(input.amountIn),call,approve(0n)],minimumUnits:String(minimum),expiresAt:swap.expiresAt,spendRecipient:router as Address,bridgeToken:crossBridgeAsset('celo','USDC')}
}
