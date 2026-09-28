import {verifiedXPayConversionHashes} from './xpay-bank-store.js'
import type {Request,Response} from 'express'
import {verifiedPrivyUser} from '../privy-circle-link.js'
import {createXPayBankService} from './xpay-bank-service.js'
import type {XPayBankPayment} from './xpay-bank-store.js'
import type {XPayBridgeRecord} from './xpay-bridge-journal.js'
import {xpayBankProgress} from '../../src/pocket/lib/pocketXPayBankProgress.js'
const defaults={identity:verifiedPrivyUser,service:createXPayBankService()}
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status})}
const text=(v:unknown,max=160)=>typeof v==='string'&&v.length<=max?v:fail('Invalid XPay request.')
export function publicXPayBankPayment(p:XPayBankPayment,b?:XPayBridgeRecord){
 return {id:p.id,checkoutId:p.checkoutId,merchantId:p.merchantId,merchantName:p.payout.merchantName,source:p.source,token:p.token,symbol:p.symbol,amount:p.amount,amountUnits:p.amountUnits,fiatAmount:p.fiatAmount,currency:p.payout.currency,state:p.state,swapHash:p.swapHash,payoutHash:p.payoutHash,failureStage:p.failureStage,error:p.error,bankDelivery:p.bankDelivery,conversionHashes:verifiedXPayConversionHashes(p),createdAt:p.createdAt,updatedAt:p.updatedAt,
  baseWallet:p.payout.wallet,fundingUnits:p.payout.fundingUnits,bridgeUnits:p.bridgeUnits,expiresAt:p.payout.expiresAt,quoteExpiresAt:p.swap?.expiresAt,bankName:p.payout.bankName,bankLast4:p.payout.bankLast4,
  replacement:p.replacementPayout?{intentId:p.replacementPayout.intentId,fundingUnits:p.replacementPayout.fundingUnits,expiresAt:p.replacementPayout.expiresAt}:undefined,
  bridge:b?{state:b.state,burnHash:b.burnHash,mintHash:b.mintHash}:undefined,
  progress:xpayBankProgress({state:p.state,hasSwap:Boolean(p.swap),swapHash:p.swapHash,payoutHash:p.payoutHash,failureStage:p.failureStage,bridge:b}),
 }
}
// Registered in the local draft with separate read/write request limits.
// Deployment still requires wallet/device end-to-end validation.
export function createXPayBankHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed.'})
  try{
   const identity=await d.identity(req),owner=identity.userId,input=req.body
   if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid XPay request.')
   const action=text(input.action,40),session=()=>text(input.circleUserToken,8000),approval=()=>text(req.headers['x-pocket-payment-approval'],8000)
   if(action==='list')return res.json({ok:true,payments:(await d.service.list(owner)).slice(-100).reverse().map(p=>publicXPayBankPayment(p))})
   if(action==='prepare'){
    const payment=await d.service.prepare(req,identity,{key:text(input.key,80),checkoutId:text(input.checkoutId,40),merchantId:text(input.merchantId,100),source:text(input.source,42),token:text(input.token,42),fiatAmount:text(input.fiatAmount,12)})
    return res.json({ok:true,payment:publicXPayBankPayment(payment)})
   }
   const id=text(input.id,80)
   let transaction:unknown,quote:unknown,challengeId:string|undefined,bridgePlan:unknown
   switch(action){
    case 'status':await d.service.status(owner,id,input.circleUserToken?session():undefined);break
    case 'approve':await d.service.approve(owner,id,approval());break
    case 'swap':{
     const result=await d.service.authorizeSwap(owner,id)
     const call='approval' in result?result.approval:result.swap
     if(call)transaction={kind:'approval' in result?'approval':'swap',...call,value:String(call.value),gas:String(result.gas),gasPrice:String(result.gasPrice)}
     quote=result.quote
     break
    }
    case 'swapSubmitted':await d.service.submittedSwap(owner,id,text(input.hash,66));break
    case 'bridge':{
     const result=await d.service.authorizeBridge(owner,id),call=result.approval||result.burn
     if(call)transaction={kind:result.approval?'approval':'burn',...call,value:String(call.value),gas:String(result.gas),gasPrice:String(result.gasPrice)}
     bridgePlan=result.record.plan;break
    }
    case 'bridgeSubmitted':{
     const hash=text(input.hash,66);if(!/^0x[0-9a-f]{64}$/i.test(hash))fail('Invalid bridge transaction.')
     await d.service.submittedBridge(owner,id,hash as `0x${string}`);break
    }
    case 'mint':challengeId=(await d.service.mint(owner,id,session())).challengeId;break
    case 'refreshAttestation':await d.service.refreshAttestation(owner,id);break
    case 'payout':challengeId=(await d.service.payout(owner,id,session())).challengeId;break
    case 'retry':await d.service.retry(owner,id);break
    case 'reviewPayout':await d.service.reviewPayout(req,identity,id);break
    case 'acceptPayout':await d.service.acceptPayout(owner,id,text(input.intentId,100),approval());break
    default:fail('Unsupported XPay action.')
   }
   const snapshot=await d.service.snapshot(owner,id)
   return res.json({ok:true,payment:publicXPayBankPayment(snapshot.payment,snapshot.bridge),transaction,quote,bridgePlan,challengeId})
  }catch(reason){
   const error=reason as Error&{status?:number;code?:string}
   const status=error.status&&[400,401,403,404,409,429].includes(error.status)?error.status:503
   return res.status(status).json({ok:false,error:status<500?error.message:'XPay is temporarily unavailable. Your submitted payment can be checked again.',code:['INSUFFICIENT_OKB','PAYOUT_REVIEW_REQUIRED','ATTESTATION_EXPIRED'].includes(error.code||'')?error.code:undefined})
  }
 }
}
export default createXPayBankHandler()
