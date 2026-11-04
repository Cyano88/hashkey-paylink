import {Connection} from '@solana/web3.js'
import {parseAbi,parseUnits,type Hex} from 'viem'
import {getRpc,loadRelayer} from '../relay-solana.js'
import {inboundBridgeClient,inboundChains} from './inbound-bridge-networks.js'
import {readCrossBridgePrices} from './cross-bridge-prices.js'
import {crossBridgeConfiguredPolicy} from './cross-bridge-policy.js'
import {createCrossBridgePrivyCost} from './cross-bridge-privy-cost.js'
import {createCrossBridgeSolanaCost} from './cross-bridge-solana-transaction.js'
import {resolveCrossBridgeWallets,revalidateCrossBridgeWallets,type CrossBridgeWalletBinding} from './cross-bridge-wallets.js'
import {fetchCrossBridgeRelayReview,type CrossBridgeInput} from './cross-bridge-provider.js'
import {createCrossBridgeReview,type openCrossBridgeReview} from './cross-bridge-review.js'
import {quoteCrossBridgeCharges,priceCrossBridgeReimbursement,crossBridgeReimbursementRecipient,type CrossBridgeChargedPlan,type CrossBridgeCost} from './cross-bridge-reimbursement.js'
import {relayBridgeAppFee} from './relay-bridge-app-fee.js'
import {crossBridgeAsset,assertCrossBridgeRollout} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {quoteBridgeMaximum} from './bridge-max-quote.js'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
export function crossBridgeReaders(wallets:CrossBridgeWalletBinding,asset:string,userToken:string,env:NodeJS.ProcessEnv=process.env){
 const source=wallets.source.network,token=crossBridgeAsset(source,asset)
 if(source==='arc')throw Error('Arc is outside this bridge rollout.')
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
 assertCrossBridgeRollout(input.source,input.destination)
 const wallets=await resolveCrossBridgeWallets(input.ownerId,input.source,input.destination),readers=crossBridgeReaders(wallets,input.from,input.circleUserToken||'',env)
 const quote=async(amountUnits:bigint)=>{
  const request:CrossBridgeInput={source:input.source,destination:input.destination,from:input.from,to:input.to,amountUnits:String(amountUnits),sender:wallets.source.address,recipient:wallets.destination.address}
  const appFee=relayBridgeAppFee(env),provider=await fetchCrossBridgeRelayReview(request,env.RELAY_API_KEY||'',fetch,appFee),prices=await readCrossBridgePrices(input.source,input.from),policy=crossBridgeConfiguredPolicy(input.source,input.from,prices.assetPrice,env)
  const charged=await quoteCrossBridgeCharges(provider.route,wallets,crossBridgeReimbursementRecipient(input.source,env),policy,readers)
  await revalidateCrossBridgeWallets(wallets)
  const result=await createCrossBridgeReview({wallets,input:request,providerQuote:provider.providerQuote,appFee,...charged,expiresAt:Math.min(charged.expiresAt,provider.requestedAt+30000)})
  return {quote:result,amountUnits,totalUnits:charged.totalUnits,expiresAt:result.quote.expiresAt}
 }
 if(input.maximum)return (await quoteBridgeMaximum({balanceUnits:await readers.balance(),quote})).quote
 if(!/^[1-9]\d{0,38}$/.test(input.amountUnits))throw Error('Enter a valid bridge amount.')
 return (await quote(BigInt(input.amountUnits))).quote
}
export function crossBridgePreflight(userToken:string,guard:(review:Review)=>Promise<void>,env:NodeJS.ProcessEnv=process.env){return async(review:Review)=>{
 const {quote:q,route,charged}=review
 const fresh=()=>{if(q.expiresAt<=Date.now())throw Error('Bridge quote expired. Review again.')};fresh();assertCrossBridgeRollout(q.input.source,q.input.destination)
 if(q.reimbursementRecipient!==crossBridgeReimbursementRecipient(q.input.source,env)||JSON.stringify(q.appFee)!==JSON.stringify(relayBridgeAppFee(env)))throw Error('Bridge fee policy changed.')
 await revalidateCrossBridgeWallets(q.wallets);await guard(review)
 const readers=crossBridgeReaders(q.wallets,q.input.from,userToken,env),[balance,cost]=await Promise.all([readers.balance(),readers.estimate(charged.plan,charged.planHash)])
 if(balance<charged.totalUnits)throw Object.assign(Error('Insufficient '+q.input.from+' for this bridge and fee.'),{status:422,code:'insufficient_balance'})
 const policy=crossBridgeConfiguredPolicy(q.input.source,q.input.from,cost.assetPrice,env),price=priceCrossBridgeReimbursement(q.input.source,route.tokenIn.symbol,cost.nativeUnits+cost.rentUnits,cost.gasPrice,cost.assetPrice,policy)
 if(cost.expiresAt<=Date.now()||BigInt(q.reimbursementUnits)<price.coverageFeeUnits||BigInt(q.reimbursementUnits)>policy.maximumFeeUnits)throw Error('Bridge fee changed. Review again.')
 fresh()
}}
