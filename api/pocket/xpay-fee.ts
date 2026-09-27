import {parseUnits} from 'viem'
import {EVM_PLATFORM_TREASURY, PLATFORM_FEE_BPS} from '../../src/lib/platformFees.js'
/** Applied server-side only to an intent bound to a shared XPay checkout. */
export function xpaySenderFee(){return {senderFeePercent:String(PLATFORM_FEE_BPS/100),senderFeeAddress:EVM_PLATFORM_TREASURY}}
export function assertXPaySenderFee(data:unknown){
 const d=data as Record<string,unknown>|undefined
 const fail=()=>{throw Object.assign(new Error('The bank fee could not be verified. Please try again.'),{status:503})}
 if(!d||String(d.senderFeePercent)!==String(PLATFORM_FEE_BPS/100))fail()
 const decimal=(v:unknown)=>typeof v==='string'&&/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(v)
 if(!decimal(d!.amount)||!decimal(d!.senderFee))fail()
 const expected=parseUnits(d!.amount as string,6)*BigInt(PLATFORM_FEE_BPS)/10000n
 const fee=parseUnits(d!.senderFee as string,6)
 // Providers may round their percentage up by one USDC base unit.
 if(fee<expected||fee>expected+1n)fail()
 if(d!.senderFeeAddress&&String(d!.senderFeeAddress).toLowerCase()!==EVM_PLATFORM_TREASURY.toLowerCase())fail()
}
