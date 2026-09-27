import type {XPayProgressSnapshot,XPayStepState} from './pocketXPayProgress'
// Minimal, serializable evidence only. Approval requests are not broadcasts.
export type XPayBankEvidence={
 state:string
 hasSwap:boolean
 swapHash?:string
 payoutHash?:string
 failureStage?:'swap'|'bridge'|'payment'
 bridge?:{state:string;burnHash?:string;mintHash?:string}
}
export function xpayBankProgress(e:XPayBankEvidence):XPayProgressSnapshot{
 const afterSwap=['swap_confirmed','bridging','payout_ready','payout_requested','payout_submitted','successful','refunded'].includes(e.state)||e.state==='failed'&&(e.failureStage==='bridge'||e.failureStage==='payment')
 const swap:XPayStepState=e.state==='failed'&&e.failureStage==='swap'?'failed':afterSwap?'confirmed':e.state==='swap_submitted'&&e.swapHash?'submitted':'waiting'
 const afterBridge=['payout_ready','payout_requested','payout_submitted','successful','refunded'].includes(e.state)||e.state==='failed'&&e.failureStage==='payment'
 const bridge:XPayStepState=afterBridge?'confirmed':e.state==='failed'&&e.failureStage==='bridge'||e.bridge?.state==='mint_failed'?'failed':e.bridge?.burnHash?'submitted':'waiting'
 const payment:XPayStepState=['successful','refunded'].includes(e.state)?'confirmed':e.state==='failed'&&e.failureStage==='payment'?'failed':e.state==='payout_submitted'&&e.payoutHash?'submitted':'waiting'
 return {...(e.hasSwap?{swap}:{}),bridge,payment}
}
