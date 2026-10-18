import {swapTokenUsdPrice} from '../../src/pocket/lib/pocketSwapUsd.js'
import {randomUUID} from 'node:crypto'
import {formatUnits,parseUnits} from 'viem'
import {nativeSwapNetwork,nativeSwapPair,type NativeSwapNetwork} from '../../src/pocket/lib/pocketNativeSwap.js'
import {okxGet} from './xstocks-swap-provider.js'
const chainIndex={ethereum:'1',base:'8453',arbitrum:'42161',polygon:'137',solana:'501'} as const
function fail(message:string,status=422):never{throw Object.assign(Error(message),{status})}
export function nativeSwapUnits(amount:string,decimals:number){
 if(typeof amount!=='string'||amount.length>60||!new RegExp('^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,'+decimals+'})?$').test(amount))fail('Enter a valid swap amount.',400)
 const units=parseUnits(amount,decimals);if(units<=0n)fail('Enter an amount above zero.',400);return units
}
/** Indicative prices only. This result is deliberately not an execution authorization. */
export async function quoteNativeSwap(input:{network:NativeSwapNetwork;from:string;to:string;amount:string},read:typeof okxGet=okxGet,now:()=>number=Date.now){
 const network=nativeSwapNetwork(input.network),{tokenIn,tokenOut}=nativeSwapPair(network,input.from,input.to)
 const units=nativeSwapUnits(input.amount,tokenIn.decimals)
 const requestedAt=now()
 const route=await read('quote',{chainIndex:chainIndex[network],fromTokenAddress:tokenIn.address,toTokenAddress:tokenOut.address,amount:String(units),swapMode:'exactIn',priceImpactProtectionPercent:'3'})
 if(now()-requestedAt>15000)fail('This estimate expired. Refresh the amount.',503)
 const same=(a:unknown,b:string)=>typeof a==='string'&&(network==='solana'?a===b:a.toLowerCase()===b.toLowerCase())
 if(!route||String(route.chainIndex)!==chainIndex[network]||String(route.fromTokenAmount)!==String(units)||route.swapMode&&route.swapMode!=='exactIn')fail('Could not verify this swap route.',502)
 for(const [actual,expected] of [[route.fromToken,tokenIn],[route.toToken,tokenOut]] as const){
  if(!actual||!same(actual.tokenContractAddress,expected.address)||String(actual.decimal)!==String(expected.decimals)||actual.isHoneyPot===true||actual.taxRate==null||!/^0(?:\.0+)?$/.test(String(actual.taxRate)))fail('Could not verify this swap asset.',502)
 }
 if(typeof route.toTokenAmount!=='string'||!/^[1-9]\d{0,77}$/.test(route.toTokenAmount))fail('No output amount is available.',502)
 const impact=route.priceImpactPercent
 if(typeof impact!=='string'||! /^-?\d+(?:\.\d+)?$/.test(impact)||!Number.isFinite(Number(impact))||Math.abs(Number(impact))>3)fail('Price impact is unavailable or too high.',422)
 const output=BigInt(route.toTokenAmount)
 return {id:randomUUID(),network,tokenIn,tokenOut,amount:formatUnits(units,tokenIn.decimals),amountUnits:String(units),expectedOut:formatUnits(output,tokenOut.decimals),expectedOutUnits:String(output),priceImpact:impact,issuedAt:requestedAt,expiresAt:requestedAt+15000,outputUsdPrice:swapTokenUsdPrice(route.toToken.tokenUnitPrice),indicative:true as const,executionAvailable:false as const}
}
