import {needsNativeBridgeConversion,quoteNativeBridgeConversion,validateNativeBridgeConversion} from './cross-bridge-evm-conversion.js'
import {quoteXLayerConversion,validateXLayerConversion} from './cross-bridge-xlayer-conversion.js'
import {quoteEurcConversion,validateEurcConversion} from './cross-bridge-eurc-conversion.js'
import {Connection} from '@solana/web3.js'
import {parseAbi,parseUnits,type Hex} from 'viem'
import {getRpc,loadRelayer} from '../relay-solana.js'
import {inboundBridgeClient,inboundChains} from './inbound-bridge-networks.js'
import {readCrossBridgePrices} from './cross-bridge-prices.js'
import {crossBridgeConfiguredPolicy} from './cross-bridge-policy.js'
import {createCrossBridgePrivyCost} from './cross-bridge-privy-cost.js'
import {createCrossBridgeSolanaCost} from './cross-bridge-solana-transaction.js'
import {resolveCrossBridgeWallets,revalidateCrossBridgeWallets,type CrossBridgeWalletBinding} from './cross-bridge-wallets.js'
import {fetchCrossBridgeRelayReview,validateCrossBridgeRelayQuote,type CrossBridgeInput} from './cross-bridge-provider.js'
import {createCrossBridgeReview,type openCrossBridgeReview} from './cross-bridge-review.js'
import {quoteCrossBridgeCharges,crossBridgeFeeCovered,priceCrossBridgeReimbursement,crossBridgeReimbursementRecipient,type CrossBridgeChargedPlan,type CrossBridgeCost} from './cross-bridge-reimbursement.js'
import {relayBridgeAppFee} from './relay-bridge-app-fee.js'
import {crossBridgeAsset,assertCrossBridgeRollout} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {quoteBridgeMaximum} from './bridge-max-quote.js'
import {assertCrossBridgeCoverageReady} from './cross-bridge-coverage.js'
import {readManualBridgeRetry,retryScope} from './cross-bridge-manual-retry.js'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
export function crossBridgeReaders(wallets:CrossBridgeWalletBinding,asset:string,userToken:string,env:NodeJS.ProcessEnv=process.env){
 const source=wallets.source.network,token=crossBridgeAsset(source,asset)
 if(source==='solana')return createCrossBridgeSolanaCost(wallets,asset,new Connection(getRpc(),'confirmed'),loadRelayer().publicKey)
 const client=inboundBridgeClient(source,env),balance=async()=>{if(await client.getChainId()!==inboundChains[source].id)throw Error('Bridge network changed.');return token.native?client.getBalance({address:wallets.source.address as Hex}):client.readContract({address:token.address as Hex,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[wallets.source.address as Hex]})}
 if(source==='bsc'||source==='xlayer')return {balance,estimate:createCrossBridgePrivyCost(wallets,asset,{env})}
 if(!userToken||userToken.length>8000)throw Error('Unlock your source wallet.')
 return {balance,estimate:async(plan:CrossBridgeChargedPlan,planHash:string):Promise<CrossBridgeCost>=>{
  if(plan.kind!=='evm')throw Error('Invalid Circle plan.')
  const start=Date.now(),[fee,prices]=await Promise.all([(await import('../circle-solana-email.js')).estimateCircleOwnedEvmBatch({chain:source,userToken,walletId:wallets.source.walletId,walletAddress:wallets.source.address,callData:plan.callData}),readCrossBridgePrices(source,asset)])
  if(!/^\d+(?:\.\d{1,18})?$/.test(fee))throw Error('Invalid bridge fee.')
  return {source,asset,planHash,nativeUnits:parseUnits(fee,18),rentUnits:0n,...prices,expiresAt:Math.min(start+30000,prices.gasPrice.observedAt+30000,prices.assetPrice.observedAt+30000)}
 }}
}
export async function quoteCrossBridgeOwned(input:Omit<CrossBridgeInput,'sender'|'recipient'>&{ownerId:string;circleUserToken?:string;maximum?:boolean},env:NodeJS.ProcessEnv=process.env){
 if(input.from==='EURC'&&env.POCKET_CROSS_EURC_ENABLED==='false')throw Object.assign(Error('Combined EURC bridges are not enabled yet.'),{status:409,code:'eurc_bridge_not_enabled'})
 assertCrossBridgeRollout(input.source,input.destination)
 const wallets=await resolveCrossBridgeWallets(input.ownerId,input.source,input.destination),readers=crossBridgeReaders(wallets,input.from,input.circleUserToken||'',env)
 const manual=wallets.source.provider==='privy'?await readManualBridgeRetry({ownerId:input.ownerId,source:input.source,walletAddress:wallets.source.address,from:input.from,destination:input.destination,to:input.to,...(!input.maximum?{amountUnits:input.amountUnits}:{})}):undefined
 if(wallets.source.provider==='privy')await assertCrossBridgeCoverageReady(wallets.source.address,{},manual?.originalId)
 if(manual){const balance=readers.balance;readers.balance=async()=>{const units=await balance();return units> manual.reservedUnits?units-manual.reservedUnits:0n}}
 const quote=async(amountUnits:bigint)=>{
  const request:CrossBridgeInput={source:input.source,destination:input.destination,from:input.from,to:input.to,amountUnits:String(amountUnits),sender:wallets.source.address,recipient:wallets.destination.address}
  const appFee=relayBridgeAppFee(env)
  const native=needsNativeBridgeConversion(request)
  const xlayer=input.source==='xlayer'&&input.from!=='USDC'
  const conversion=native?await quoteNativeBridgeConversion(request,wallets):xlayer?await quoteXLayerConversion(request):input.from==='EURC'?await quoteEurcConversion(request,wallets,input.circleUserToken||''):null
  const converted=conversion?(native?validateNativeBridgeConversion(conversion as any,request,Date.now()):xlayer?validateXLayerConversion(conversion as any,request,Date.now()):validateEurcConversion(conversion as any,request,Date.now())):null
  const direct=await fetchCrossBridgeRelayReview(converted?{...request,from:'USDC',amountUnits:converted.minimumUnits}:request,env.RELAY_API_KEY||'',fetch,appFee)
  const providerQuote=conversion?{kind:native?'evm-conversion':xlayer?'xlayer-conversion':'eurc-conversion',swap:conversion,bridge:direct.providerQuote}:direct.providerQuote
  const provider={...direct,providerQuote,route:validateCrossBridgeRelayQuote(providerQuote,request,direct.requestedAt,appFee)}
  const prices=await readCrossBridgePrices(input.source,input.from),policy=crossBridgeConfiguredPolicy(input.source,input.from,prices.assetPrice,env)
  const charged=await quoteCrossBridgeCharges(provider.route,wallets,crossBridgeReimbursementRecipient(input.source,env),policy,readers)
  await revalidateCrossBridgeWallets(wallets)
  const result=await createCrossBridgeReview({wallets,input:request,providerQuote:provider.providerQuote,appFee,...charged,expiresAt:Math.min(charged.expiresAt,provider.requestedAt+45000)})
  return {quote:result,amountUnits,totalUnits:charged.totalUnits,expiresAt:result.quote.expiresAt}
 }
 if(input.maximum)return (await quoteBridgeMaximum({balanceUnits:await readers.balance(),quote})).quote
 if(!/^[1-9]\d{0,38}$/.test(input.amountUnits))throw Error('Enter a valid bridge amount.')
 return (await quote(BigInt(input.amountUnits))).quote
}
const preflightDefaults={now:Date.now,readers:crossBridgeReaders,revalidate:revalidateCrossBridgeWallets,manualRetry:readManualBridgeRetry}
export function crossBridgePreflight(userToken:string,guard:(review:Review)=>Promise<void>,env:NodeJS.ProcessEnv=process.env,overrides:Partial<typeof preflightDefaults>={},reuseEstimateMs=0){const d={...preflightDefaults,...overrides};let recent:{id:string;planHash:string;at:number;cost:CrossBridgeCost}|undefined;return async(review:Review)=>{
 const {quote:q,route,charged}=review
 const fresh=()=>{if(q.expiresAt<=d.now())throw Error('Bridge quote expired. Review again.')};fresh();assertCrossBridgeRollout(q.input.source,q.input.destination)
 if(q.reimbursementRecipient!==crossBridgeReimbursementRecipient(q.input.source,env)||JSON.stringify(q.appFee)!==JSON.stringify(relayBridgeAppFee(env)))throw Error('Bridge fee policy changed.')
 const durations:Record<string,number>={},started=Date.now()
 const measured=async<T>(stage:string,read:()=>Promise<T>)=>{const start=Date.now();try{return await read()}finally{durations[stage]=Date.now()-start}}
 const freshReads=async()=>{
 await measured('walletMs',()=>d.revalidate(q.wallets))
 const readers=d.readers(q.wallets,q.input.from,userToken,env)
 // Only a combined, request-scoped Circle prepare/submit can reuse its own
 // identical estimate. Ownership, balance, policy and expiry are still checked.
 const estimate=async()=>{
  if(reuseEstimateMs>0&&recent?.id===q.id&&recent.planHash===charged.planHash&&d.now()-recent.at<Math.min(reuseEstimateMs,2000)&&recent.cost.expiresAt>d.now())return recent.cost
  const cost=await readers.estimate(charged.plan,charged.planHash);recent={id:q.id,planHash:charged.planHash,at:d.now(),cost};return cost
 }
 return Promise.all([measured('balanceMs',()=>readers.balance()),measured('estimateMs',estimate)])
 }
 // Billing and simulation are independent read/check paths. Verify wallet
 // ownership before balance/simulation, and require BOTH paths before reserve
 // or dispatch. Slow historical billing must not serialize the current reads.
 const [,[balance,cost]]=await Promise.all([measured('policyMs',()=>guard(review)),freshReads()])
 if(env.NODE_ENV==='production')console.info('pocket_bridge_preflight_timing',JSON.stringify({id:q.id,source:q.input.source,...durations,totalMs:Date.now()-started}))
 const manual=q.wallets.source.provider==='privy'?await d.manualRetry(retryScope(q)):undefined
 if(balance<charged.totalUnits+(manual?.reservedUnits??0n))throw Object.assign(Error('Insufficient '+q.input.from+' for this bridge and fee.'),{status:422,code:'insufficient_balance'})
 fresh()
 if(cost.expiresAt<=d.now())throw Object.assign(Error('Bridge cost expired. Review again.'),{status:409,code:'bridge_review_invalid'})
 const policy=crossBridgeConfiguredPolicy(q.input.source,q.input.from,cost.assetPrice,env),price=priceCrossBridgeReimbursement(q.input.source,route.tokenIn.symbol,cost.nativeUnits+cost.rentUnits,cost.gasPrice,cost.assetPrice,policy,d.now())
 if(!crossBridgeFeeCovered(q.input.source,route.tokenIn.symbol,BigInt(q.reimbursementUnits),price.coverageFeeUnits,cost.assetPrice)||BigInt(q.reimbursementUnits)>policy.maximumFeeUnits)throw Object.assign(Error('Bridge fee changed. Review again.'),{status:409,code:'cross_bridge_fee_changed',feeCheck:{source:q.input.source,asset:q.input.from,reservedUnits:q.reimbursementUnits,requiredUnits:String(price.coverageFeeUnits),maximumUnits:String(policy.maximumFeeUnits),quoteAgeMs:d.now()-q.issuedAt,remainingMs:q.expiresAt-d.now()}})
 fresh()
}}
