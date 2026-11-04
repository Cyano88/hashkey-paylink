import {encodeFunctionData,parseAbi,toHex,type Hex} from 'viem'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {estimatePrivyValueBatchGas,type XLayerCostRpc} from './xlayer-sponsored-cost.js'
import {readCrossBridgePrices} from './cross-bridge-prices.js'
import {inboundBridgeClient,inboundChains} from './inbound-bridge-networks.js'
import type {CrossBridgeWalletBinding} from './cross-bridge-wallets.js'
import type {CrossBridgeChargedPlan,CrossBridgeCost} from './cross-bridge-reimbursement.js'
const fail=():never=>{throw Error('Sponsored bridge fee is unavailable. Review again.')}
const uint=(v:unknown)=>typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/i.test(v)?BigInt(v):fail()
/** Full atomic batch, including native principal and reimbursement. No balance
 * overrides. X Layer includes its L1 data fee; BSC never calls that oracle. */
export function createCrossBridgePrivyCost(wallets:CrossBridgeWalletBinding,asset:string,options:{rpc?:XLayerCostRpc;prices?:typeof readCrossBridgePrices;now?:()=>number;env?:NodeJS.ProcessEnv}={}){
 const source=wallets.source.network
 if(source!=='bsc'&&source!=='xlayer'||wallets.source.provider!=='privy')return fail()
 const client=options.rpc?undefined:inboundBridgeClient(source,options.env),rpc=options.rpc??((method,params)=>client!.request({method,params} as any)),now=options.now??Date.now
 return async(plan:CrossBridgeChargedPlan,planHash:string):Promise<CrossBridgeCost>=>{
  if(plan.kind!=='evm')return fail()
  const start=now(),calls=plan.calls.map(c=>({to:c.target,data:c.data,value:toHex(c.value)})),chainId=inboundChains[source].id as 56|196
  const [gas,suggestion,spot,prices]=await Promise.all([
   estimatePrivyValueBatchGas(rpc,wallets.source.address as Hex,calls,chainId),rpc('rundler_getUserOperationGasPrice',[]),rpc('eth_gasPrice',[]),(options.prices??readCrossBridgePrices)(source,asset,{now}),
  ])
  if(gas.callData.toLowerCase()!==plan.callData.toLowerCase())return fail()
  const suggested=uint(suggestion?.suggested?.maxFeePerGas),spotPrice=uint(spot),height=uint(suggestion?.blockNumber)
  if(suggested<=0n||spotPrice<=0n)return fail()
  const block=await rpc('eth_getBlockByNumber',[toHex(height),false]),blockTime=Number(uint(block?.timestamp))*1000
  if(uint(block?.number)!==height||!/^0x[0-9a-f]{64}$/i.test(block?.hash)||!Number.isSafeInteger(blockTime)||blockTime>now()+5000||blockTime+30000<=now())return fail()
  let l1=0n
  if(source==='xlayer'){
   const op={sender:wallets.source.address as Hex,nonce:0n,initCode:'0x' as Hex,callData:gas.callData,accountGasLimits:toHex((gas.verificationGas<<128n)|gas.callGas,{size:32}),preVerificationGas:gas.preVerificationGas,gasFees:toHex(0n,{size:32}),paymasterAndData:'0x' as Hex,signature:('0x'+'ff'.repeat(65)) as Hex}
   const data=encodeFunctionData({abi:entryPoint07Abi,functionName:'handleOps',args:[[op],wallets.source.address as Hex]})
   l1=uint(await rpc('eth_call',[{to:'0x420000000000000000000000000000000000000F',data:encodeFunctionData({abi:parseAbi(['function getL1FeeUpperBound(uint256) view returns(uint256)']),functionName:'getL1FeeUpperBound',args:[BigInt((data.length-2)/2+1024)]})},'latest']))
  }
  const expiresAt=Math.min(start+30000,blockTime+30000,prices.gasPrice.observedAt+30000,prices.assetPrice.observedAt+30000)
  if(expiresAt<=now())return fail()
  return {source,asset,planHash,nativeUnits:(gas.totalGas+25000n)*(suggested>spotPrice?suggested:spotPrice)+l1,rentUnits:0n,...prices,expiresAt}
 }
}
