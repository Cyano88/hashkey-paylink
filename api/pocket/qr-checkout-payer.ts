import type {Request} from 'express'
import {checkoutCashPayer} from '../checkout-cash.js'
import {requirePocketBasicKyc} from './kyc-level.js'

/** Cash QR payments use the same authenticated payment wallet as online checkout. */
export async function verifiedQrCheckoutPayer(req:Request,owner:string,refundAddress:string,payerWallet:string,existing=false){
 const cash=await checkoutCashPayer(req)
 if(cash.owner!==owner||cash.address!==refundAddress.toLowerCase()||(payerWallet&&cash.address!==payerWallet.toLowerCase()))throw Object.assign(Error('Continue with the cash account used for this payment.'),{status:403})
 let verified:Awaited<ReturnType<typeof requirePocketBasicKyc>>
 try{verified=await requirePocketBasicKyc(owner)}catch(error){if((error as {code?:string}).code==='KYC_BASIC_REQUIRED')throw Object.assign(Error('Complete Basic verification for online and QR purchases.'),{status:403,code:'KYC_PURCHASE_REQUIRED'});throw error}
 const name=verified.legalName?.trim()||''
 if(!name&&!existing)throw Object.assign(Error('Your verified name is unavailable. Contact support before paying.'),{status:403,code:'KYC_NAME_REQUIRED'})
 return name
}
