import type {Hex} from 'viem'
import {CIRCLE_KIT_EVM_SOURCES} from './circle-bridge-platform-fee.js'
import {resolveCrossBridgeWallets} from './cross-bridge-wallets.js'
import {readCctpForwardQuote,solanaRecipient,CCTP_DOMAIN,type PocketBridgeNetwork} from './cctp.js'
import {crossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {circleKitCostReaders} from './circle-bridge-preflight.js'
import {quoteCircleKitReview} from './circle-bridge-review.js'
type Source=typeof CIRCLE_KIT_EVM_SOURCES[number]
const defaults={now:Date.now,wallets:resolveCrossBridgeWallets,provider:readCctpForwardQuote,recipient:async(address:string)=>(await solanaRecipient(address,true)).needsSetup,balance:circleKitCostReaders.balance,rate:circleKitCostReaders.rate,shares:circleKitCostReaders.shares,estimate:async(input:{chain:Source;userToken:string;walletId:string;walletAddress:string;callData:string})=>(await import('../circle-solana-email.js')).estimateCircleOwnedEvmBatch(input)}
/** Internal authenticated quote adapter. No caller-provided wallets, fees or calldata. */
export async function quoteOwnedCircleKitBridge(input:{ownerId:string;userToken:string;source:Source;destination:PocketBridgeNetwork;amountUnits:string},overrides:Partial<typeof defaults>={},env:NodeJS.ProcessEnv=process.env){
 const d={...defaults,...overrides}
 if(!input.ownerId||!input.userToken||input.userToken.length>8000||!(CIRCLE_KIT_EVM_SOURCES as readonly string[]).includes(input.source)||!Object.hasOwn(CCTP_DOMAIN,input.destination)||input.source===input.destination||! /^[1-9]\d{0,37}$/.test(input.amountUnits))throw Error('Invalid bridge review request.')
 const wallets=await d.wallets(input.ownerId,input.source,input.destination),token=crossBridgeAsset(input.source,'USDC'),transferUnits=BigInt(input.amountUnits)
 const setup=input.destination==='solana'?await d.recipient(wallets.destination.address):false
 // Circle returns a fee schedule, not a signed quote expiry. Bound its age from
 // request start, never from completion of slow estimates or price lookups.
 const requestedAt=d.now(),provider=await d.provider(input.source,input.destination,transferUnits,setup)
 if(provider.transferUnits!==transferUnits||provider.totalUnits!==transferUnits+provider.maxFeeUnits||provider.maxFeeUnits<0n||![1000,2000].includes(provider.finalityThreshold))throw Error('Circle bridge fee changed.')
 const [availableUnits,nativeRateScaled8]=await Promise.all([d.balance(input.source,token.address as Hex,wallets.source.address as Hex),d.rate(input.source)])
 return quoteCircleKitReview({source:input.source,destination:input.destination,walletAddress:wallets.source.address as Hex,destinationAddress:wallets.destination.address,transferUnits,providerFeeUnits:provider.maxFeeUnits,finalityThreshold:provider.finalityThreshold as 1000|2000,includeRecipientSetup:setup},wallets,{estimate:callData=>d.estimate({chain:input.source,userToken:input.userToken,walletId:wallets.source.walletId,walletAddress:wallets.source.address,callData}),feeShares:gross=>d.shares(input.source,gross),availableUnits,nativeRateScaled8,providerExpiresAt:requestedAt+30000,now:d.now},env)
}

/** Max returns the final sealed review; consumers must not replace it with a
 * quote for the full balance. Each retry revalidates server wallet bindings. */
export async function quoteOwnedCircleKitMaximum(input:Omit<Parameters<typeof quoteOwnedCircleKitBridge>[0],'amountUnits'>,overrides:Partial<typeof defaults>={},env:NodeJS.ProcessEnv=process.env){
 const d={...defaults,...overrides}
 if(!(CIRCLE_KIT_EVM_SOURCES as readonly string[]).includes(input.source)||!input.ownerId||!input.userToken||input.userToken.length>8000||!Object.hasOwn(CCTP_DOMAIN,input.destination)||input.source===input.destination)throw Error('Invalid bridge review request.')
 const bound=await d.wallets(input.ownerId,input.source,input.destination),token=crossBridgeAsset(input.source,'USDC')
 const balanceUnits=await d.balance(input.source,token.address as Hex,bound.source.address as Hex)
 const {quoteBridgeMaximum}=await import('./bridge-max-quote.js')
 return quoteBridgeMaximum({balanceUnits,now:d.now,quote:async amount=>{
  const result=await quoteOwnedCircleKitBridge({...input,amountUnits:String(amount)},{...d,wallets:async(...args)=>{const current=await d.wallets(...args);if(current.fingerprint!==bound.fingerprint)throw Error('Bridge wallets changed. Review again.');return current}},env)
  return {quote:result,amountUnits:BigInt(result.quote.input.transferUnits),totalUnits:BigInt(result.quote.totalUnits),expiresAt:result.quote.expiresAt}
 }})
}
