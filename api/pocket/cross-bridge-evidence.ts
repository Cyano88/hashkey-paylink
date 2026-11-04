import {crossBridgeAsset,type CrossBridgeNetwork,type CrossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {RELAY_BSC_CHAINS} from './bsc-bridge-provider.js'
import type {validateCrossBridgeRelayQuote} from './cross-bridge-provider.js'
export type CrossBridgeRoute=ReturnType<typeof validateCrossBridgeRelayQuote>
export type CrossBridgeSettlementPlan={route:CrossBridgeRoute;sender:string;recipient:string}
export type CrossBridgeDeliveryCandidate={outcome:'completed'|'refunded';network:CrossBridgeNetwork;token:CrossBridgeAsset;recipient:string;hash:string;exactUnits:string|null;minimumUnits:string}
export const sameCrossBridgeAddress=(n:CrossBridgeNetwork,a:unknown,b:string)=>typeof a==='string'&&(n==='solana'?a===b:a.toLowerCase()===b.toLowerCase())
export const crossBridgeHash=(n:CrossBridgeNetwork,h:unknown):h is string=>typeof h==='string'&&(n==='solana'?/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(h):/^0x[0-9a-f]{64}$/i.test(h))
const units=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,77}$/.test(v)&&BigInt(v)<2n**256n
/** Only saved, validated route data may supply tokens, wallets and refund plans.
 * Cross-asset output is not capped by source units or an assumed stablecoin peg. */
export function crossBridgeDeliveryCandidate(p:CrossBridgeSettlementPlan,sourceHash:string,status:any,requests:any):CrossBridgeDeliveryCandidate|null{
 const q=p.route,same=sameCrossBridgeAddress
 if(!crossBridgeHash(q.source,sourceHash)||!crossBridgeHash('base',q.orderId)||!crossBridgeHash('base',q.requestId)||!units(q.minimumUnits)||!units(q.receiveUnits)||BigInt(q.minimumUnits)>BigInt(q.receiveUnits))return null
 if(!['success','refund'].includes(status?.status)||status.originChainId!==RELAY_BSC_CHAINS[q.source].id||!Array.isArray(status.inTxHashes)||status.inTxHashes.length!==1||!same(q.source,status.inTxHashes[0],sourceHash))return null
 if(!Array.isArray(requests?.requests)||requests.requests.length!==1)return null
 const r=requests.requests[0]
 if(!same('base',r.id,q.requestId)||!same('base',r.protocol?.orderId,q.orderId)||r.protocol?.hubType!=='onchain'||r.status!==status.status||!same(q.source,r.user,p.sender)||!same(q.destination,r.recipient,p.recipient)||!Array.isArray(r.data?.inTxs)||r.data.inTxs.length!==1)return null
 const input=r.data.inTxs[0]
 if(input.status!=='success'||input.chainId!==RELAY_BSC_CHAINS[q.source].id||!same(q.source,input.txHash,sourceHash))return null
 let network=q.destination,token=q.tokenOut,recipient=p.recipient,exactUnits:string|null=null
 if(status.status==='refund'){
  const refund=r.data.refundCurrencyData
  if(!Array.isArray(q.refundOptions)||q.refundOptions.length!==2||new Set(q.refundOptions.map(x=>x.network)).size!==2)return null
  for(const option of q.refundOptions){
   if(![q.source,q.destination].includes(option.network)||!same(option.network,option.recipient,option.network===q.source?p.sender:p.recipient))return null
   const asset=crossBridgeAsset(option.network,option.asset)
   if(!same(option.network,asset.address,option.address)||asset.decimals!==option.decimals)return null
  }
  const option=q.refundOptions.find(x=>RELAY_BSC_CHAINS[x.network].id===refund?.currency?.chainId)
  if(!option||!same(option.network,refund.currency.address,option.address)||refund.currency.decimals!==option.decimals||!units(refund.amount))return null
  network=option.network;token=crossBridgeAsset(network,option.asset);recipient=option.recipient;exactUnits=refund.amount
  // A source-asset refund cannot exceed the approved source deposit. A
  // different refund asset has no valid 1:1 source-amount comparison.
  if(network===q.source&&token.symbol===q.tokenIn.symbol&&BigInt(refund.amount)>BigInt(q.amountUnits))return null
 }else if(status.destinationChainId!==RELAY_BSC_CHAINS[q.destination].id)return null
 const canonicalToken=crossBridgeAsset(network,token.symbol)
 if(!same(network,canonicalToken.address,token.address)||canonicalToken.decimals!==token.decimals||canonicalToken.native!==token.native)return null
 if(!Array.isArray(r.data.outTxs)||!Array.isArray(status.txHashes)||status.txHashes.length!==1)return null
 const outputs=r.data.outTxs.filter((t:any)=>t.status==='success')
 if(outputs.length!==1||outputs[0].chainId!==RELAY_BSC_CHAINS[network].id||!crossBridgeHash(network,outputs[0].txHash)||!same(network,status.txHashes[0],outputs[0].txHash))return null
 return {outcome:status.status==='refund'?'refunded':'completed',network,token:canonicalToken,recipient,hash:outputs[0].txHash,exactUnits,minimumUnits:q.minimumUnits}
}
export function crossBridgeDeliveryProven(c:CrossBridgeDeliveryCandidate,received:bigint|null){return received!==null&&received>0n&&received<2n**256n&&(c.exactUnits!==null?received===BigInt(c.exactUnits):received>=BigInt(c.minimumUnits))}
