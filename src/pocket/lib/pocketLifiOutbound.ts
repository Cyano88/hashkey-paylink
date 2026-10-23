import {decodeFunctionData,encodeFunctionData,parseAbi,isAddress,type Address,type Hex} from 'viem'
import {POCKET_USDT_ASSETS} from './pocketUsdtAssets.js'
import {assertPocketBridgeRevenue,type PocketBridgeRevenue} from './pocketBridgeRevenue.js'
export const LIFI_DESTINATIONS=['arbitrum','ethereum','polygon'] as const
export type LifiDestination=typeof LIFI_DESTINATIONS[number]
export type OutboundDestination='base'|LifiDestination
export const LIFI_DIAMOND='0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'
const forwarder='0xCE40449B773a3E6E5e769ADb4e567179d4828cbd'
const sourceToken='0x779ded0c9e1022225f8e0630b35a9b54be713736'
const bridgeTuple='(bytes32 transactionId,string bridge,string integrator,address referrer,address sendingAssetId,address receiver,uint256 minAmount,uint256 destinationChainId,bool hasSourceSwaps,bool hasDestinationCall)'
const swapTuple='(address callTo,address approveTo,address sendingAssetId,address receivingAssetId,uint256 fromAmount,bytes callData,bool requiresDeposit)[]'
const layerTuple='(bytes32 requestId,address depositoryReceiver,address refundRecipient,bytes32 nonEVMReceiver,bytes signature,uint256 deadline)'
export const lifiAbi=parseAbi([
 `function swapAndStartBridgeTokensViaLayerSwap(${bridgeTuple} bridgeData,${swapTuple} swaps,${layerTuple} layerData) payable`,
 `function startBridgeTokensViaLayerSwap(${bridgeTuple} bridgeData,${layerTuple} layerData) payable`,
 `event LiFiTransferStarted(${bridgeTuple} bridgeData)`,
 'function forwardERC20Fees(address token,(address recipient,uint256 amount)[] distributions)',
 'function approve(address,uint256) returns(bool)',
])
export type LifiOutboundPlan={destination:LifiDestination;owner:Address;recipient:Address;amountUnits:string;receiveUnits:string;minimumUnits:string;transactionId:Hex;data:Hex;expiresAt:number;revenue?:PocketBridgeRevenue}
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const invalid=():never=>{throw Object.assign(Error('This bridge route could not be verified. Try again.'),{status:502})}
export function validateLifiPlan(p:LifiOutboundPlan,now=Date.now()){
 if(!LIFI_DESTINATIONS.includes(p.destination)||!isAddress(p.owner)||!isAddress(p.recipient)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=now)invalid()
 for(const n of [p.amountUnits,p.receiveUnits,p.minimumUnits])if(!/^[1-9]\d{0,19}$/.test(n))invalid()
 const principal=BigInt(p.amountUnits),receive=BigInt(p.receiveUnits),minimum=BigInt(p.minimumUnits)
 if(receive>principal||minimum>receive||minimum<receive*995n/1000n)invalid()
 const decoded=decodeFunctionData({abi:lifiAbi,data:p.data})
 if(decoded.functionName!=='swapAndStartBridgeTokensViaLayerSwap'&&decoded.functionName!=='startBridgeTokensViaLayerSwap')invalid()
 const args=decoded.args as any,bd=args[0],hasSwap=decoded.functionName==='swapAndStartBridgeTokensViaLayerSwap',ld=args[hasSwap?2:1]
 if(!same(bd.transactionId,p.transactionId)||bd.bridge!=='layerswap'||!same(bd.sendingAssetId,sourceToken)||!same(bd.receiver,p.recipient)||bd.destinationChainId!==BigInt(POCKET_USDT_ASSETS[p.destination].chainId)||bd.hasDestinationCall||bd.hasSourceSwaps!==hasSwap||!same(ld.refundRecipient,p.owner)||!isAddress(ld.depositoryReceiver)||/^0x0{40}$/i.test(ld.depositoryReceiver)||!/^0x0{64}$/i.test(ld.nonEVMReceiver)||!/^0x[0-9a-f]{130}$/i.test(ld.signature)||ld.deadline*1000n<BigInt(p.expiresAt))invalid()
 let providerFee=0n
 if(p.revenue&&bd.integrator!=='hashpaylink')invalid()
 if(hasSwap){
  const swaps=args[1];if(swaps.length!==1)invalid();const s=swaps[0]
  // Only the published LI.FI fee forwarder is permitted. No arbitrary swaps/calls.
  if(!same(s.callTo,forwarder)||!same(s.approveTo,forwarder)||!same(s.sendingAssetId,sourceToken)||!same(s.receivingAssetId,sourceToken)||s.fromAmount!==principal||!s.requiresDeposit)invalid()
  const f=decodeFunctionData({abi:lifiAbi,data:s.callData});if(f.functionName!=='forwardERC20Fees')invalid()
  const [token,distributions]=f.args as any;if(!same(token,sourceToken))invalid()
  if(p.revenue){assertPocketBridgeRevenue(principal,p.revenue,distributions);providerFee=distributions.reduce((sum:bigint,f:{amount:bigint})=>sum+f.amount,0n)}
  else{
   if(distributions.length!==1)invalid()
   const fee=distributions[0];if(!isAddress(fee.recipient)||/^0x0{40}$/i.test(fee.recipient))invalid()
   providerFee=fee.amount;if(providerFee<0n||providerFee>principal*25n/10000n)invalid()
  }
 }
 if(p.revenue&&!hasSwap)assertPocketBridgeRevenue(principal,p.revenue,[])
 if(bd.minAmount!==principal-providerFee||bd.minAmount<receive)invalid()
 // Canonical ABI bytes exclude trailing or hidden execution data.
 if(encodeFunctionData({abi:lifiAbi,functionName:decoded.functionName,args:decoded.args as any}).toLowerCase()!==p.data.toLowerCase())invalid()
 return {bridgeData:bd,layerData:ld,providerFee}
}
export function lifiOutboundCalls(p:LifiOutboundPlan,now=Date.now()){
 validateLifiPlan(p,now)
 const approve=(n:bigint)=>({to:sourceToken as Address,value:'0x0' as const,data:encodeFunctionData({abi:lifiAbi,functionName:'approve',args:[LIFI_DIAMOND,n]})})
 return [approve(0n),approve(BigInt(p.amountUnits)),{to:LIFI_DIAMOND as Address,value:'0x0' as const,data:p.data},approve(0n)]
}
