import {parseAbi,type Hex} from 'viem'
import {nativeFeeToUsdcUnits,readNativeUsdcRate} from '../payment-network-fees.js'
import {inboundBridgeClient,inboundChains} from './inbound-bridge-networks.js'
import {CIRCLE_KIT_BRIDGE,circleKitBridgeAbi,buildCircleKitFeeBatch} from './circle-bridge-platform-fee.js'
import {revalidateCrossBridgeWallets} from './cross-bridge-wallets.js'
import type {CircleKitReview} from './circle-bridge-review.js'
type Source=CircleKitReview['input']['source']
type Dependencies={now():number;wallets:typeof revalidateCrossBridgeWallets;balance(source:Source,token:Hex,wallet:Hex):Promise<bigint>;rate(source:Source):Promise<bigint>;shares(source:Source,gross:bigint):Promise<readonly [bigint,bigint]>;estimate(q:CircleKitReview,userToken:string):Promise<string>}
const checkedClient=async(source:Source)=>{const c=inboundBridgeClient(source);if(await c.getChainId()!==inboundChains[source].id)throw Error('Bridge source network mismatch.');return c}
export const circleKitCostReaders:Dependencies={now:Date.now,wallets:revalidateCrossBridgeWallets,
 balance:async(source,token,wallet)=>(await checkedClient(source)).readContract({address:token,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[wallet]}),
 rate:source=>source==='arc'?Promise.resolve(100000000n):readNativeUsdcRate(source==='polygon'?'polygon':'ethereum'),
 shares:async(source,gross)=>(await checkedClient(source)).readContract({address:CIRCLE_KIT_BRIDGE,abi:circleKitBridgeAbi,functionName:'calculateFeeShares',args:[gross]}),
 estimate:async(q,userToken)=>(await import('../circle-solana-email.js')).estimateCircleOwnedEvmBatch({chain:q.input.source,userToken,walletId:q.wallets.source.walletId,walletAddress:q.wallets.source.address,callData:q.callData}),
}
/** Internal only: q must already have passed openCircleKitReview. Does not mutate
 * the approved batch or dispatch. The policy guard is an early check; the default
 * runtime also reserves atomically against journaled actions before dispatch. */
export function createCircleKitPreflight(userToken:string,guard:(q:CircleKitReview)=>Promise<void>,overrides:Partial<Dependencies>={}){
 const d={...circleKitCostReaders,...overrides}
 if(!userToken||userToken.length>8000||typeof guard!=='function')throw Error('Unlock Pocket to review this bridge.')
 const expired=(q:CircleKitReview)=>{if(q.expiresAt<=d.now())throw Object.assign(Error('Bridge review expired. Refresh the quote.'),{status:409})}
 return async(q:CircleKitReview)=>{
  expired(q);await d.wallets(q.wallets);await guard(q)
  const i=q.input,batch=await buildCircleKitFeeBatch({...i,transferUnits:BigInt(i.transferUnits),providerFeeUnits:BigInt(i.providerFeeUnits),reimbursementUnits:BigInt(i.reimbursementUnits)},{},q.platformFee)
  if(batch.callData!==q.callData||batch.totalUnits!==BigInt(q.totalUnits))throw Error('Bridge batch changed. Review it again.')
  const balance=await d.balance(i.source,batch.bridgeParams.burnToken,i.walletAddress)
  if(balance<batch.totalUnits)throw Object.assign(Error('Insufficient USDC to cover the bridge and fee. Enter a smaller amount.'),{status:422})
  const [rate,estimate,shares]=await Promise.all([d.rate(i.source),d.estimate(q,userToken),d.shares(i.source,BigInt(q.platformFee.amountUnits))])
  if(String(shares[0])!==q.platformFee.developerUnits||String(shares[1])!==q.platformFee.protocolUnits)throw Object.assign(Error('Bridge fee policy changed. Review a new quote.'),{status:409})
  const reserved=BigInt(i.reimbursementUnits),actual=nativeFeeToUsdcUnits(estimate,rate),tolerance=reserved/1000n<100n?reserved/1000n:100n
  if(actual>reserved+tolerance)throw Object.assign(Error('Bridge fee changed. Review a new quote.'),{status:409})
  expired(q)
 }
}
