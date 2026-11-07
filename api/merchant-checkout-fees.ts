import {assertCashCheckoutPayer} from './checkout-cash-policy.js'
import {formatUnits,parseUnits} from 'viem'
import {mutateDurableJson,readDurableJson} from './render-durable-store.js'
import {readVerifiedHostedCheckoutRecord,hostedCheckoutPaymentOption,type CheckoutRecord} from './hosted-checkouts.js'
import {verifyPaymentFeeQuote,type PaymentFeeBinding,type PaymentFeeQuote} from './payment-fee-quotes.js'
import {verifyEvmUsdcTransfer,normalizeEvmUsdcChain} from './usdc-transfer-verify.js'
import {verifySolanaUsdcTransfer} from './solana-usdc-transfer-verify.js'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.js'
import type {MerchantPaymentFees} from '../src/lib/merchantPaymentFees.js'
const KEY='hashpaylink:merchant-checkout-fee-proofs:v1'
type FeeContext=Pick<CheckoutRecord,'cashPayer'|'id'|'feePayer'|'asset'|'amount'|'flexible'|'createdAt'|'expiresAt'|'network'|'recipient'|'paymentOptions'>
type Store={quotes:Record<string,{token:string;quote:PaymentFeeQuote}>}
const equal=(a:string,b:string,chain:string)=>chain==='solana'?a===b:a.toLowerCase()===b.toLowerCase()
export async function assertMerchantFeeBinding(binding:PaymentFeeBinding){
 if(!binding.checkoutId)return
 if(binding.purpose&&binding.purpose!=='payment')throw Error('Checkout requires a payment quote.')
 if(binding.checkoutId.startsWith('pos_')){
  const {readPosCryptoFeeContext}=await import('./ng-pos.js')
  const context=await readPosCryptoFeeContext(binding.checkoutId.slice(4),binding.chain)
  if(binding.mode!=='net'||(binding.asset||'USDC')!=='USDC'||!equal(context.recipient,binding.recipient,binding.chain)||BigInt(binding.amountUnits)<=0n)throw Error('Merchant payment details changed.')
  return
 }
 const c=await readVerifiedHostedCheckoutRecord(binding.checkoutId)
 if(c)assertCashCheckoutPayer(c,binding.chain,binding.asset||'USDC',binding.walletAddress)
 const option=c&&hostedCheckoutPaymentOption(c,binding.chain)
 if(!c||c.checkoutMode!=='human'||!option||c.payment||!equal(option.recipient,binding.recipient,binding.chain)||(!c.flexible&&parseUnits(c.amount,6)!==BigInt(binding.amountUnits))||(c.asset||'USDC')!==(binding.asset||'USDC')||binding.mode!==(c.feePayer==='merchant'?'net':'gross'))throw Error('Checkout payment details changed. Reopen checkout.')
}
/** Save authenticated quote evidence before signing. Recovery does not depend on a browser session. */
export async function rememberMerchantFeeQuote(token:string,quote:PaymentFeeQuote){
 await (await import('./checkout-selection.js')).claimCheckoutSelectionPayment(quote.checkoutId)
 if(!quote.checkoutId||quote.mode!=='net'||quote.exemption!=='none')return
 await mutateDurableJson<Store>(KEY,current=>{
  const store=current||{quotes:{}}
  for(const[id,item]of Object.entries(store.quotes))if(item.quote.expiresAt<Date.now()-31*86400000)delete store.quotes[id]
  store.quotes[quote.id]??={token,quote}
  return store
 })
}
export async function verifyMerchantCheckoutTransfer(c:FeeContext,input:{txHash:string;payer:string;network:string}){
 assertCashCheckoutPayer(c,input.network,c.asset||'USDC',input.payer)
 const option=hostedCheckoutPaymentOption(c,input.network)
 if(c.feePayer!=='merchant'||!option)throw Error('Merchant fee policy is unavailable.')
 const stored=Object.values((await readDurableJson<Store>(KEY))?.quotes||{}).filter(({quote:q})=>q.checkoutId===c.id&&q.chain===input.network&&equal(q.walletAddress,input.payer,input.network))
 for(const item of stored){
  try{
   const binding:PaymentFeeBinding={checkoutId:c.id,purpose:'payment',asset:c.asset||'USDC',chain:input.network,walletId:item.quote.walletId,walletAddress:input.payer,recipient:option.recipient,amountUnits:c.flexible?item.quote.amountUnits:parseUnits(c.amount,6).toString(),mode:'net'}
   const q=verifyPaymentFeeQuote(item.token,binding,item.quote.issuedAt)
   if(q.exemption!=='none')continue
   const before=new Date(Math.max(Date.parse(c.createdAt),q.issuedAt-2000)).toISOString(),after=c.expiresAt
   const treasury=input.network==='solana'?process.env.SOLANA_TREASURY||'':EVM_PLATFORM_TREASURY
   const verify=async(recipient:string,units:string)=>input.network==='solana'?verifySolanaUsdcTransfer({txHash:input.txHash,payer:input.payer,asset:c.asset||'USDC',recipient,minAmount:formatUnits(BigInt(units),6),exactAmount:true,notBefore:before,notAfter:after,confirmation:'finalized'}):verifyEvmUsdcTransfer({txHash:input.txHash,payer:input.payer,chain:normalizeEvmUsdcChain(input.network)!,token:c.asset||'USDC',recipient,minAmount:formatUnits(BigInt(units),6),exactAmount:true,notBefore:before,notAfter:after,confirmation:input.network==='base'?'base-included':'finalized'})
   const received=await verify(option.recipient,q.recipientUnits)
   if(BigInt(q.treasuryUnits)>0n){const collected=await verify(treasury,q.treasuryUnits);if(collected.confirmedAt!==received.confirmedAt)continue}
   const fees:MerchantPaymentFees={payer:'merchant',platformFee:formatUnits(BigInt(q.platformFeeUnits),6),networkFee:formatUnits(BigInt(q.networkFeeUnits),6),netAmount:formatUnits(BigInt(q.recipientUnits),6)}
   return {...received,amount:formatUnits(BigInt(q.amountUnits),6),fees}
  }catch{/* another issued quote may be the executed one */}
 }
 throw Error('The exact merchant payment and fees are still being verified.')
}

export async function verifyPosMerchantTransfer(merchantId:string,amount:string,input:{txHash:string;payer:string;network:string}){
 const {readPosCryptoFeeContext}=await import('./ng-pos.js')
 const context=await readPosCryptoFeeContext(merchantId,input.network)
 return verifyMerchantCheckoutTransfer({id:'pos_'+merchantId,feePayer:'merchant',asset:'USDC',amount,flexible:false,createdAt:context.createdAt,expiresAt:new Date(Date.now()+5000).toISOString(),network:input.network as CheckoutRecord['network'],recipient:context.recipient},input)
}
