import {createCrossBridgeCircleRuntime} from './cross-bridge-circle-runtime.js'
import {parseAbi,parseUnits,type Hex} from 'viem'
import {inboundBridgeClient,inboundChains} from './inbound-bridge-networks.js'
import {readCrossBridgePrices} from './cross-bridge-prices.js'
import {fetchCrossBridgeRelayReview,type CrossBridgeInput} from './cross-bridge-provider.js'
import {resolveCrossBridgeWallets,revalidateCrossBridgeWallets,type CrossBridgeWalletBinding} from './cross-bridge-wallets.js'
import {quoteCrossBridgeCharges,crossBridgeFeeCovered,priceCrossBridgeReimbursement,crossBridgeReimbursementRecipient,type CrossBridgeChargedPlan,type CrossBridgeCost,type CrossBridgeFeePolicy} from './cross-bridge-reimbursement.js'
import {createCrossBridgeReview,type openCrossBridgeReview} from './cross-bridge-review.js'
import {relayBridgeAppFee} from './relay-bridge-app-fee.js'
import {assertCrossBridgeRollout,crossBridgeAsset,type CrossBridgeNetwork} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'

type Source='ethereum'|'base'|'arbitrum'|'polygon'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
type EstimateInput={chain:Source;userToken:string;walletId:string;walletAddress:string;callData:string}
const defaults={now:Date.now,wallets:resolveCrossBridgeWallets,revalidate:revalidateCrossBridgeWallets,prices:readCrossBridgePrices,provider:fetchCrossBridgeRelayReview,
 balance:async(source:Source,asset:string,wallet:string)=>{
  const token=crossBridgeAsset(source,asset),client=inboundBridgeClient(source)
  if(await client.getChainId()!==inboundChains[source].id)throw Error('Bridge source network changed.')
  return token.native?client.getBalance({address:wallet as Hex}):client.readContract({address:token.address as Hex,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[wallet as Hex]})
 },
 estimate:async(input:EstimateInput)=>(await import('../circle-solana-email.js')).estimateCircleOwnedEvmBatch(input),
}
const sourceChain=(source:CrossBridgeNetwork):Source=>{if(!['ethereum','base','arbitrum','polygon'].includes(source))throw Error('This route requires another source wallet adapter.');return source as Source}
const fail=(message:string):never=>{throw Object.assign(Error(message),{status:409})}
/** Full-plan Circle estimate, using chain-verified native/token balances. Provider
 * estimates are read-only and verify that the Circle token owns this wallet. */
function readers(wallets:CrossBridgeWalletBinding,asset:string,userToken:string,d:typeof defaults){
 const source=sourceChain(wallets.source.network)
 if(!userToken||userToken.length>8000||wallets.source.provider!=='circle')throw Error('Unlock your source wallet.')
 return {
  balance:()=>d.balance(source,asset,wallets.source.address),
  estimate:async(plan:CrossBridgeChargedPlan,planHash:string):Promise<CrossBridgeCost>=>{
   if(plan.kind!=='evm')throw Error('Circle source plan changed.')
   const startedAt=d.now()
   const [fee,prices]=await Promise.all([
    d.estimate({chain:source,userToken,walletId:wallets.source.walletId,walletAddress:wallets.source.address,callData:plan.callData}),
    d.prices(source,asset,{now:d.now}),
   ])
   if(!/^\d+(?:\.\d{1,18})?$/.test(fee))throw Error('Invalid bridge network fee.')
   const nativeUnits=parseUnits(fee,18),expiresAt=Math.min(startedAt+30000,prices.gasPrice.observedAt+30000,prices.assetPrice.observedAt+30000)
   if(nativeUnits<=0n||expiresAt<=d.now())throw Error('Bridge cost expired. Review again.')
   return {source,asset,planHash,nativeUnits,rentUnits:0n,...prices,expiresAt}
  },
 }
}
/** Server-owned policy argument; never accept fee policy, wallets, recipient or
 * calldata from request JSON. Public mounting still requires rollout gates. */
export async function quoteOwnedCrossBridgeCircle(input:{ownerId:string;userToken:string;source:Source;destination:CrossBridgeNetwork;from:string;to:string;amountUnits:string},policy:CrossBridgeFeePolicy,overrides:Partial<typeof defaults>={},env:NodeJS.ProcessEnv=process.env){
 const d={...defaults,...overrides};sourceChain(input.source);assertCrossBridgeRollout(input.source,input.destination)
 if(!input.ownerId||input.ownerId.length>256||!input.userToken||input.userToken.length>8000)throw Error('Authenticated bridge context is required.')
 // Resolve ownership before any provider request. Input never supplies addresses.
 const wallets=await d.wallets(input.ownerId,input.source,input.destination)
 const providerInput:CrossBridgeInput={source:input.source,destination:input.destination,from:input.from,to:input.to,amountUnits:input.amountUnits,sender:wallets.source.address,recipient:wallets.destination.address}
 const appFee=relayBridgeAppFee(env),provider=await d.provider(providerInput,env.RELAY_API_KEY||'',fetch,appFee,d.now)
 const reimbursementRecipient=crossBridgeReimbursementRecipient(input.source,env)
 const charged=await quoteCrossBridgeCharges(provider.route,wallets,reimbursementRecipient,policy,{...readers(wallets,input.from,input.userToken,d),now:d.now})
 await d.revalidate(wallets)
 return createCrossBridgeReview({wallets,input:providerInput,providerQuote:provider.providerQuote,appFee,...charged,expiresAt:Math.min(charged.expiresAt,provider.requestedAt+45000)},{now:d.now(),secret:env.POCKET_SWAP_QUOTE_SECRET})
}
/** Re-estimate the identical signed plan immediately before reservation/dispatch.
 * Fee changes cause a fresh review, never a silent higher debit. */
export function createCrossBridgeCirclePreflight(userToken:string,policy:CrossBridgeFeePolicy,guard:(review:Review)=>Promise<void>,overrides:Partial<typeof defaults>={},env:NodeJS.ProcessEnv=process.env){
 if(!userToken||userToken.length>8000||typeof guard!=='function')throw Error('Authenticated bridge preflight is required.')
 const d={...defaults,...overrides}
 return async(review:Review)=>{
  const {quote:q,route,charged}=review
  sourceChain(q.input.source);assertCrossBridgeRollout(q.input.source,q.input.destination)
  const fresh=()=>{if(q.expiresAt<=d.now())fail('Bridge review expired. Refresh the quote.')};fresh()
  if(q.reimbursementRecipient!==crossBridgeReimbursementRecipient(q.input.source,env)||JSON.stringify(q.appFee)!==JSON.stringify(relayBridgeAppFee(env)))fail('Bridge fee policy changed. Review again.')
  await d.revalidate(q.wallets);await guard(review)
  const r=readers(q.wallets,q.input.from,userToken,d),[balance,cost]=await Promise.all([r.balance(),r.estimate(charged.plan,charged.planHash)])
  if(balance<charged.totalUnits)throw Object.assign(Error('Insufficient '+q.input.from+' for this bridge and fee.'),{status:422,code:'insufficient_balance'})
  fresh()
  const priced=priceCrossBridgeReimbursement(q.input.source,route.tokenIn.symbol,cost.nativeUnits,cost.gasPrice,cost.assetPrice,policy,d.now()),reserved=BigInt(q.reimbursementUnits)
  if(!crossBridgeFeeCovered(q.input.source,route.tokenIn.symbol,reserved,priced.coverageFeeUnits,cost.assetPrice)||reserved>policy.maximumFeeUnits)throw Object.assign(Error('Bridge fee changed. Review a new quote.'),{status:409,code:'cross_bridge_fee_changed'})
  fresh()
 }
}

/** Authenticated composition: lifecycle cannot dispatch without the same cost
 * and balance checks used by quote preparation. guard is the server policy gate. */
export function createOwnedCrossBridgeCircleRuntime(context:{ownerId:string;userToken:string},policy:CrossBridgeFeePolicy,guard:(review:Review)=>Promise<void>,costOverrides:Partial<typeof defaults>={},runtimeOverrides:Parameters<typeof createCrossBridgeCircleRuntime>[3]={},env:NodeJS.ProcessEnv=process.env){
 return createCrossBridgeCircleRuntime(context.ownerId,context.userToken,createCrossBridgeCirclePreflight(context.userToken,policy,guard,costOverrides,env),runtimeOverrides)
}