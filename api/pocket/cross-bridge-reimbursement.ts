import {pocketFeeLimitError} from './fee-limit-error.js'
import {encodePrivyValueBatch} from './xlayer-sponsored-cost.js'
import {createHash} from 'node:crypto'
import {encodeFunctionData,parseAbi,isAddress,type Hex} from 'viem'
import {PublicKey,SystemProgram,type TransactionInstruction} from '@solana/web3.js'
import {createTransferCheckedInstruction,getAssociatedTokenAddress} from '../solana-token.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
import {assertCrossBridgeRollout,crossBridgePair,crossBridgeAsset,type CrossBridgeNetwork} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import type {validateCrossBridgeRelayQuote} from './cross-bridge-provider.js'
import type {CrossBridgeWalletBinding} from './cross-bridge-wallets.js'

type Route=ReturnType<typeof validateCrossBridgeRelayQuote>
export type CrossBridgeFeePolicy={providerBps:number;providerAllowanceUsdMicros:bigint;marginBps:number;minimumFeeUnits:bigint;maximumFeeUnits:bigint}
export type CrossBridgePrice={scaled8:bigint;observedAt:number}
export const crossBridgeGas:Record<CrossBridgeNetwork,{symbol:string;decimals:number}>={ethereum:{symbol:'ETH',decimals:18},base:{symbol:'ETH',decimals:18},arbitrum:{symbol:'ETH',decimals:18},polygon:{symbol:'POL',decimals:18},arc:{symbol:'USDC',decimals:18},bsc:{symbol:'BNB',decimals:18},xlayer:{symbol:'OKB',decimals:18},solana:{symbol:'SOL',decimals:9}}
/** Match the existing Circle bridge's 0.1% / $0.0001 rounding allowance.
 * The platform absorbs this bounded difference; the approved debit never rises.
 * Sponsored billing and Solana rent retain strict coverage. */
export function crossBridgeFeeCovered(network:CrossBridgeNetwork,asset:string,reserved:bigint,required:bigint,assetPrice:CrossBridgePrice){
 if(reserved<=0n||required<=0n||assetPrice.scaled8<=0n)return false
 if(network==='bsc'||network==='xlayer'||network==='solana')return required<=reserved
 const cap=100n*100n*10n**BigInt(crossBridgeAsset(network,asset).decimals)/assetPrice.scaled8
 const tolerance=reserved/1000n<cap?reserved/1000n:cap
 return required<=reserved+tolerance
}
const fail=(message='Bridge fees are unavailable. Review this route again.',reason='invalid_fee_plan',details:Record<string,string|number>={}):never=>{throw Object.assign(Error(message),{status:409,code:'cross_bridge_fee_unavailable',feeCheck:{reason,...details}})}
const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b
/** Source-denominated reimbursement. No destination prices or assumed stablecoin pegs. */
export function priceCrossBridgeReimbursement(network:CrossBridgeNetwork,asset:string,nativeUnits:bigint,gasPrice:CrossBridgePrice,assetPrice:CrossBridgePrice,policy:CrossBridgeFeePolicy,now=Date.now()){
 const gas=crossBridgeGas[network]
 const tokenIn=crossBridgeAsset(network,asset)
 for(const price of [gasPrice,assetPrice])if(typeof price.scaled8!=='bigint'||price.scaled8<=0n||price.scaled8>10n**20n||!Number.isSafeInteger(price.observedAt)||price.observedAt>now+5000||price.observedAt+30000<=now)fail(undefined,'stale_fee_price',{network,asset,ageMs:now-price.observedAt})
 if(nativeUnits<=0n||nativeUnits>=2n**128n||![policy.providerBps,policy.marginBps].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=10000)||policy.providerAllowanceUsdMicros<0n||policy.minimumFeeUnits<0n||policy.maximumFeeUnits<=0n||policy.maximumFeeUnits>=2n**128n||policy.minimumFeeUnits>policy.maximumFeeUnits)fail()
 const scale=10n**BigInt(tokenIn.decimals)
 const networkFee=ceil(nativeUnits*gasPrice.scaled8*scale*BigInt(10000+policy.providerBps),10n**BigInt(gas.decimals)*assetPrice.scaled8*10000n)
 const allowance=ceil(policy.providerAllowanceUsdMicros*100n*scale,assetPrice.scaled8)
 // The minimum is a quote-time charge, not a provider liability. Repricing
 // that minimum during confirmation can reject a fully covered fee after a
 // one-unit exchange-rate movement. Still require the full current gas and
 // provider allowance; never increase the user's signed charge here.
 const floor=networkFee+allowance
 const buffered=ceil((networkFee+allowance)*BigInt(10000+policy.marginBps),10000n)
 const fee=buffered>policy.minimumFeeUnits?buffered:policy.minimumFeeUnits
 if(fee<=0n)fail()
 if(fee>policy.maximumFeeUnits)throw pocketFeeLimitError(network,fee,policy.maximumFeeUnits)
 return {feeUnits:fee,coverageFeeUnits:floor,expiresAt:Math.min(gasPrice.observedAt,assetPrice.observedAt)+30000}
}
const batchAbi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const transferAbi=parseAbi(['function transfer(address to,uint256 amount) returns(bool)'])
/** Reimbursement recipient only. Provider app fees are bound in their own quote. */
export function crossBridgeReimbursementRecipient(network:CrossBridgeNetwork,env:NodeJS.ProcessEnv=process.env){
 const recipient=network==='solana'?(env.SOLANA_TREASURY||'').trim():EVM_PLATFORM_TREASURY
 if(network==='solana'){try{const key=new PublicKey(recipient);if(key.equals(PublicKey.default)||key.toBase58()!==recipient)fail()}catch{fail()}}
 return recipient
}
export type CrossBridgeChargedPlan={kind:'evm';calls:Array<{target:Hex;value:bigint;data:Hex}>;callData:Hex}|{kind:'solana';instructions:TransactionInstruction[]}
/** route must be the server validator result, never client-supplied calls. */
export async function buildCrossBridgeChargedPlan(route:Route,binding:CrossBridgeWalletBinding,reimbursementUnits:bigint,reimbursementRecipient:string):Promise<{plan:CrossBridgeChargedPlan;totalUnits:bigint;planHash:string}>{
 const {tokenIn,tokenOut}=crossBridgePair(route.source,route.destination,route.tokenIn.symbol,route.tokenOut.symbol)
 if(binding.source.network!==route.source||binding.destination.network!==route.destination||JSON.stringify(tokenIn)!==JSON.stringify(route.tokenIn)||JSON.stringify(tokenOut)!==JSON.stringify(route.tokenOut)||reimbursementUnits<=0n)fail()
 const same=(a:string,b:string)=>route.source==='solana'?a===b:a.toLowerCase()===b.toLowerCase()
 if(same(reimbursementRecipient,binding.source.address))fail()
 if(route.source==='solana'){try{if(new PublicKey(reimbursementRecipient).equals(PublicKey.default))fail()}catch{fail()}}else if(!isAddress(reimbursementRecipient)||/^0x0{40}$/i.test(reimbursementRecipient))fail()
 for(const side of [binding.source,binding.destination]){const refund=route.refundOptions.find(r=>r.network===side.network);if(!refund||(side.network==='solana'?refund.recipient!==side.address:refund.recipient.toLowerCase()!==side.address.toLowerCase()))fail()}
 const sponsored=route.source==='bsc'||route.source==='xlayer'
 if(binding.source.provider!==(sponsored?'privy':'circle'))fail('Bridge wallet execution provider changed.')
 const totalUnits=BigInt(route.amountUnits)+reimbursementUnits
 if(totalUnits>=(route.source==='solana'?2n**64n:2n**128n))fail()
 const fees=[{recipient:reimbursementRecipient,units:reimbursementUnits}]
 let plan:CrossBridgeChargedPlan
 if(route.execution.kind==='evm'){
  const calls=[...route.execution.calls,...fees.map(f=>tokenIn.native?{target:f.recipient as Hex,value:f.units,data:'0x' as Hex}:{target:tokenIn.address as Hex,value:0n,data:encodeFunctionData({abi:transferAbi,functionName:'transfer',args:[f.recipient as Hex,f.units]})})]
  plan={kind:'evm',calls,callData:sponsored?encodePrivyValueBatch(calls.map(c=>({to:c.target,data:c.data,value:('0x'+c.value.toString(16)) as Hex}))):encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[calls]})}
 }else{
  const owner=new PublicKey(binding.source.address),mint=new PublicKey(tokenIn.address),source=await getAssociatedTokenAddress(mint,owner,true)
  const transfers=tokenIn.native?fees.map(f=>SystemProgram.transfer({fromPubkey:owner,toPubkey:new PublicKey(f.recipient),lamports:f.units})):await Promise.all(fees.map(async f=>createTransferCheckedInstruction(source,mint,await getAssociatedTokenAddress(mint,new PublicKey(f.recipient),true),owner,f.units,tokenIn.decimals)))
  // Fee ATAs must be pre-provisioned or included in the exact relayer estimate;
  // no unchecked account setup or reserve cost may be appended after approval.
  plan={kind:'solana',instructions:[route.execution.instruction,...transfers]}
 }
 const planHash=createHash('sha256').update(JSON.stringify(plan,(_,v)=>typeof v==='bigint'?v.toString():v)).digest('hex')
 return {plan,totalUnits,planHash}
}
export type CrossBridgeCost={source:CrossBridgeNetwork;asset:string;planHash:string;nativeUnits:bigint;rentUnits:bigint;gasPrice:CrossBridgePrice;assetPrice:CrossBridgePrice;expiresAt:number}
/** Estimate the complete provider deposit + reimbursement transaction; never append a second app fee. */
export async function quoteCrossBridgeCharges(route:Route,binding:CrossBridgeWalletBinding,reimbursementRecipient:string,policy:CrossBridgeFeePolicy,deps:{estimate(plan:CrossBridgeChargedPlan,planHash:string):Promise<CrossBridgeCost>;balance():Promise<bigint>;now?():number}){
 assertCrossBridgeRollout(route.source,route.destination)
 const now=deps.now||Date.now
 let fee=policy.minimumFeeUnits>0n?policy.minimumFeeUnits:1n
 for(let pass=0;pass<4;pass++){
  const built=await buildCrossBridgeChargedPlan(route,binding,fee,reimbursementRecipient)
  const [balance,cost]=await Promise.all([deps.balance(),deps.estimate(built.plan,built.planHash)])
  if(balance<built.totalUnits)throw Object.assign(Error('Insufficient '+route.tokenIn.symbol+' for the amount and fee.'),{status:422,code:'insufficient_balance',maximumAmountUnits:String(balance>fee?balance-fee:0n)})
  // Require explicit account-rent coverage, including zero for existing ATAs.
  // A gas-only estimate must not silently omit a Solana account creation cost.
  if(typeof cost.rentUnits!=='bigint'||cost.rentUnits<0n||cost.rentUnits>=2n**64n||route.source!=='solana'&&cost.rentUnits!==0n||typeof cost.nativeUnits!=='bigint'||cost.nativeUnits<=0n)fail()
  const priced=priceCrossBridgeReimbursement(route.source,route.tokenIn.symbol,cost.nativeUnits+cost.rentUnits,cost.gasPrice,cost.assetPrice,policy,now())
  if(cost.source!==route.source||cost.asset!==route.tokenIn.symbol||cost.planHash!==built.planHash||!Number.isSafeInteger(cost.expiresAt)||cost.expiresAt<=now())fail()
  // Price/estimate freshness is verified above and again at both preflights.
  // It is not the executable route deadline: aging a review from a market
  // snapshot can leave less time than the review-opening freshness window.
  const expiresAt=route.expiresAt
  if(expiresAt<=now())fail('Bridge quote expired. Review this route again.','route_expired',{source:route.source,asset:route.tokenIn.symbol,expiredByMs:now()-expiresAt})
  // Recheck the coverage floor against the existing reserve, not a fresh margin.
  if((pass===0?priced.feeUnits:priced.coverageFeeUnits)<=fee)return {...built,reimbursementUnits:fee,reimbursementRecipient,sourceAsset:route.tokenIn.symbol,sourceDecimals:route.tokenIn.decimals,expiresAt,walletFingerprint:binding.fingerprint}
  fee=priced.feeUnits
 }
 return fail('Bridge fee estimate changed. Review a new quote.')
}
