import {parseUnits} from 'viem'
import {EVM_PLATFORM_TREASURY, PLATFORM_FEE_BPS} from '../../src/lib/platformFees.js'
/** Applied server-side only to an intent bound to a shared XPay checkout. */
export function xpaySenderFee(){return {senderFeePercent:String(PLATFORM_FEE_BPS/100),senderFeeAddress:EVM_PLATFORM_TREASURY}}
export function assertXPaySenderFee(data:unknown){
 const d=data as Record<string,unknown>|undefined
 const fail=()=>{throw Object.assign(new Error('The bank fee could not be verified. Please try again.'),{status:503})}
 if(!d||!/^\d+(?:\.\d+)?$/.test(String(d.senderFeePercent))||Number(d.senderFeePercent)!==PLATFORM_FEE_BPS/100)fail()
 const decimal=(v:unknown)=>typeof v==='string'&&/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(v)
 if(!decimal(d!.amount)||!decimal(d!.senderFee))fail()
 const expected=parseUnits(d!.amount as string,18)*BigInt(PLATFORM_FEE_BPS)/10000n
 const fee=parseUnits(d!.senderFee as string,18)
 // Provider decimal quotes can retain precision beyond USDC settlement units.
 // Permit at most one micro-USDC of rounding, never another percentage fee.
 if(fee<expected-10n**12n||fee>expected+10n**12n)fail()
 if(d!.senderFeeAddress&&String(d!.senderFeeAddress).toLowerCase()!==EVM_PLATFORM_TREASURY.toLowerCase())fail()
}
