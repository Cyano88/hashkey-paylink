import {encodeFunctionData,formatUnits,getAddress,parseAbi,type Hex} from 'viem'
import {quoteArcSwap,validateArcSwapQuote,ARC_SWAP_ROUTER} from './arc-swap-provider.js'
import {nativeSwapCalls,prepareNativeEvmSwapRoute,validateNativeEvmSwap,type NativeEvmSwapQuote} from './native-evm-swap-quote.js'
import {crossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import type {CrossBridgeInput} from './cross-bridge-provider.js'
import type {CrossBridgeWalletBinding} from './cross-bridge-wallets.js'
const approvalAbi=parseAbi(['function approve(address spender,uint256 amount) returns(bool)'])
export type EurcConversion={provider:'arc-lifi';response:unknown;issuedAt:number;expiresAt:number}|{provider:'base-okx';quote:NativeEvmSwapQuote}
const fail=():never=>{throw Error('EURC conversion does not match this bridge review.')}
/** Rebuild the conversion only through the existing swap validators. No provider
 * origin-router calldata is accepted by the direct-deposit bridge validator. */
export function validateEurcConversion(swap:EurcConversion,input:CrossBridgeInput,now:number){
 if(input.from!=='EURC'||!['base','arc'].includes(input.source))return fail()
 const tokenIn=crossBridgeAsset(input.source,'EURC'),tokenOut=crossBridgeAsset(input.source,'USDC'),amount=BigInt(input.amountUnits)
 if(swap.provider==='arc-lifi'){
  if(input.source!=='arc'||!Number.isSafeInteger(swap.issuedAt)||swap.issuedAt>now+5000||swap.expiresAt!==swap.issuedAt+45000||swap.expiresAt<=now)return fail()
  const validated=validateArcSwapQuote(swap.response,{walletAddress:getAddress(input.sender),tokenIn:{...tokenIn,address:getAddress(tokenIn.address),name:'EURC',chainId:5042},tokenOut:{...tokenOut,address:getAddress(tokenOut.address),name:'USDC',chainId:5042},amountUnits:amount})
  if(validated.min<=0n||validated.min>validated.out||validated.min<validated.out*9950n/10000n)return fail()
  const approve=(units:bigint)=>({target:getAddress(tokenIn.address),value:0n,data:encodeFunctionData({abi:approvalAbi,functionName:'approve',args:[ARC_SWAP_ROUTER,units]})})
  return {calls:[approve(0n),approve(amount),{target:ARC_SWAP_ROUTER,value:0n,data:validated.tx.data as Hex},approve(0n)],minimumUnits:String(validated.min),expiresAt:swap.expiresAt,spendRecipient:ARC_SWAP_ROUTER,bridgeToken:tokenOut}
 }
 if(swap.provider!=='base-okx'||input.source!=='base')return fail()
 const q=validateNativeEvmSwap(swap.quote,false,now)
 if(q.version!==1||q.network!=='base'||q.from!=='EURC'||q.to!=='USDC'||q.walletAddress.toLowerCase()!==input.sender.toLowerCase()||q.amountUnits!==input.amountUnits)return fail()
 // Remove the standalone swap's reimbursement. The complete combined batch is
 // estimated below and has exactly one reimbursement in the original input asset.
 return {calls:nativeSwapCalls(q).slice(0,-1),minimumUnits:q.minimumOutUnits,expiresAt:q.expiresAt,spendRecipient:q.tx.to,bridgeToken:tokenOut}
}
export async function quoteEurcConversion(input:CrossBridgeInput,wallets:CrossBridgeWalletBinding,userToken:string):Promise<EurcConversion>{
 if(input.from!=='EURC'||wallets.source.network!==input.source||wallets.source.address.toLowerCase()!==input.sender.toLowerCase())return fail()
 if(input.source==='arc'){
  let response:unknown;const issuedAt=Date.now()
  const capture:typeof fetch=async(...args)=>{const r=await fetch(...args);if(String(args[0]).includes('/quote?'))response=await r.clone().json();return r}
  await quoteArcSwap({ownerId:wallets.ownerId,walletId:wallets.source.walletId,walletAddress:getAddress(input.sender),tokenIn:crossBridgeAsset('arc','EURC').address,tokenOut:crossBridgeAsset('arc','USDC').address,amount:formatUnits(BigInt(input.amountUnits),6)},capture)
  const swap:EurcConversion={provider:'arc-lifi',response,issuedAt,expiresAt:issuedAt+45000};validateEurcConversion(swap,input,Date.now());return swap
 }
 if(input.source!=='base')return fail()
 // Estimate only the final combined batch. A standalone swap would require an unnecessary ETH reimbursement.
 const quote=await prepareNativeEvmSwapRoute({ownerId:wallets.ownerId,walletId:wallets.source.walletId,walletAddress:getAddress(input.sender),network:'base',from:'EURC',to:'USDC',amount:formatUnits(BigInt(input.amountUnits),6)})
 return {provider:'base-okx',quote}
}
