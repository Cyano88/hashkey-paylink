import type {Request,Response} from 'express'
import {encodeFunctionData,getAddress,parseAbi,parseUnits,type Address} from 'viem'
import ngPosHandler,{listPocketXPayPosDestinations} from '../ng-pos.js'
import {listPocketXPayStockDestinations} from './xpay.js'
import {assertUnifiedXPayDestination} from './unified-xpay-store.js'
import {validateXPayDestinations} from '../../src/pocket/lib/pocketUnifiedXPay.js'
import {localCurrencyProfileRepository} from '../local-currency-profile.js'
import {circleLinkKey,readCircleLink,type VerifiedLinkUser} from '../privy-circle-link.js'
import {getPaycrestPosOrder,markPaycrestPosPayment,type PaycrestOrderRecord} from '../paycrest-pos.js'
import {schedulePaycrestOrderReconciliation} from '../paycrest-reconcile.js'
import {verifyEvmUsdcTransfer} from '../usdc-transfer-verify.js'
import {assertXPaySenderFee} from './xpay-fee.js'

function fail(message:string,status=409):never {throw Object.assign(new Error(message),{status})}
const transferAbi=parseAbi(['function transfer(address,uint256) returns(bool)'])
const batchAbi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
export type XPayPayoutQuote={intentId:string;merchantId:string;merchantName:string;currency:'NGN'|'UGX';fiatAmount:string;fundingUnits:string;recipient:Address;wallet:Address;walletId:string;expiresAt:number;providerOrderId:string;bankName?:string;bankLast4?:string}
export function assertXPayPayoutBinding(order:PaycrestOrderRecord,quote:XPayPayoutQuote){
 if(order.intent_id!==quote.intentId||order.paycrest_order_id!==quote.providerOrderId||order.merchant_id!==quote.merchantId||order.receive_address.toLowerCase()!==quote.recipient.toLowerCase()||order.refund_address.toLowerCase()!==quote.wallet.toLowerCase()||parseUnits(order.amount_usdc,6)!==BigInt(quote.fundingUnits)||order.amount_ngn!==quote.fiatAmount||(order.fiat_currency||'NGN')!==quote.currency)throw Object.assign(new Error('The bank quote changed. Review it before paying.'),{status:409,code:'PAYOUT_REVIEW_REQUIRED'})
}
export function assertXPayPayoutPayable(order:PaycrestOrderRecord,quote?:XPayPayoutQuote,now=Date.now()) {
 if(order.tx_hash||order.status.toLowerCase()!=='initiated')fail('This bank payment is already submitted or unavailable. Check its status.')
 const expires=Date.parse(order.valid_until||'')
 if(!Number.isFinite(expires)||expires<=now+90000)throw Object.assign(new Error('The bank quote expired. Review an updated quote before paying.'),{status:409,code:'PAYOUT_REVIEW_REQUIRED'})
 if(quote)assertXPayPayoutBinding(order,quote)
 return expires
}
async function invoke(req:Request,body:Record<string,unknown>){let status=200,result:any;const res={setHeader(){},status(s:number){status=s;return this},json(b:unknown){result=b;return this}} as unknown as Response;await ngPosHandler(Object.assign(Object.create(req),{body,method:'POST'}) as Request,res);if(status>=400||!result?.ok){throw Object.assign(Error(result?.error||'Bank payout is temporarily unavailable.'),{status:status>=400?status:503,code:result?.code,remainingNgn:result?.remainingNgn,dailyLimitNgn:result?.dailyLimitNgn})};return result}
export async function validateXPayBankChoice(checkoutId:string,merchantId:string,symbol:string){
 const checkout=await assertUnifiedXPayDestination(checkoutId,merchantId)
 const available=(await Promise.all([listPocketXPayPosDestinations(checkout.owner),listPocketXPayStockDestinations(checkout.owner)])).flat()
 const selected=validateXPayDestinations(checkout.destinationIds,available)
 if(selected.some((d,i)=>d.revision!==checkout.revisions[i]))fail('The receiving setup changed. Ask the merchant for a new QR.')
 const bank=selected.find(d=>d.id===merchantId&&d.kind==='bank')
 if(!bank||!selected.some(d=>d.assets.includes(symbol)))fail('Choose an asset accepted by this QR.',400)
 return bank
}
export async function prepareXPayBankPayout(req:Request,identity:VerifiedLinkUser,input:{checkoutId:string;merchantId:string;symbol:string;fiatAmount:string}):Promise<XPayPayoutQuote>{
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(input.fiatAmount)||Number(input.fiatAmount)<=0)fail('Enter a valid payment amount.',400)
 if(!identity.email)fail('Sign in with your verified Pocket email before paying.',403)
 const bank=await validateXPayBankChoice(input.checkoutId,input.merchantId,input.symbol)
 const [link,payer]=await Promise.all([readCircleLink(circleLinkKey(identity.userId,'base')),localCurrencyProfileRepository.ensure({...identity,email:identity.email})])
 if(!link||link.circleBlockchain!=='BASE')fail('Open your Base wallet in Pocket before paying.')
 if(payer.profile.nameStatus!=='kyc_verified'||!payer.profile.resolvedName)fail('Complete Basic identity verification in Pocket before paying.')
 const q=await invoke(req,{action:'quote',merchant_id:bank.id,settlement_type:'INSTANT_FIAT',network:'base',amount_currency:bank.currency,amount:input.fiatAmount,xpay_checkout_id:input.checkoutId})
 const data=await invoke(req,{action:'createOfframpOrder',intent_id:q.quote.intent_id,ensure_payable:true,refund_address:link.circleWalletAddress,payer_wallet:link.circleWalletAddress,payer_email:identity.email,payer_name:payer.profile.resolvedName})
 const order=data.order as PaycrestOrderRecord,expiresAt=assertXPayPayoutPayable(order)
 assertXPaySenderFee(order.raw)
 return {intentId:order.intent_id,merchantId:bank.id,merchantName:bank.name,currency:bank.currency as 'NGN'|'UGX',fiatAmount:order.amount_ngn,fundingUnits:String(parseUnits(order.amount_usdc,6)),recipient:getAddress(order.receive_address),wallet:getAddress(link.circleWalletAddress),walletId:link.circleWalletId,expiresAt,providerOrderId:order.paycrest_order_id,bankName:order.bank_name,bankLast4:order.bank_last4}
}
export async function checkXPayPayout(quote:XPayPayoutQuote,owner?:string){const order=await getPaycrestPosOrder(quote.intentId);if(!order)fail('Bank order is unavailable.');assertXPayPayoutPayable(order,quote);if(owner){const {reservePocketBankAllowance}=await import('./transfer-allowance.js');await reservePocketBankAllowance(owner,{id:order.intent_id,amount:order.amount_ngn,currency:order.fiat_currency||'NGN',usdc:order.amount_usdc,providerOrderId:order.paycrest_order_id})};return order}
export function xpayPayoutCall(quote:XPayPayoutQuote){return encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[[{target:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',value:0n,data:encodeFunctionData({abi:transferAbi,functionName:'transfer',args:[quote.recipient,BigInt(quote.fundingUnits)]})}]]})}
export async function confirmXPayPayout(quote:XPayPayoutQuote,hash:string){
 const order=await getPaycrestPosOrder(quote.intentId)
 if(!order)fail('Bank order no longer matches this payment.')
 assertXPayPayoutBinding(order,quote)
 if(order.tx_hash&&order.tx_hash.toLowerCase()!==hash.toLowerCase())fail('This bank payment already has another transaction.')
 await verifyEvmUsdcTransfer({chain:'base',txHash:hash,recipient:quote.recipient,payer:quote.wallet,minAmount:order.amount_usdc,notBefore:order.created_at,confirmation:'base-included'})
 const paid=await markPaycrestPosPayment({id:quote.intentId,txHash:hash,payerWallet:quote.wallet})
 schedulePaycrestOrderReconciliation(quote.intentId)
 return paid
}

export async function readXPayPayoutDelivery(quote:XPayPayoutQuote){
 const order=await getPaycrestPosOrder(quote.intentId)
 if(!order)return undefined
 assertXPayPayoutBinding(order,quote)
 return {hash:order.tx_hash,status:order.status.toLowerCase()}
}
