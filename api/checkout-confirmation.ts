import type {Request,Response} from 'express'
import {registerVerifiedPayment} from './event-registry.js'

// Only current merchant payments may use this entry point. The old event product
// stays retired, including when an older Pocket build uses its former URL.
export function createCheckoutConfirmationHandler(register=registerVerifiedPayment){
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  const input=req.body
  const hosted=input?.source==='hosted-checkout'&&typeof input.merchantId==='string'&&/^chk_[A-Za-z0-9]{8,40}$/.test(input.merchantId)&&input.eventId===`hosted-${input.merchantId}`
  const pos=input?.source==='ngpos'&&typeof input.merchantId==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(input.merchantId)&&input.eventId===`ngpos-${input.merchantId}`
  if(!hosted&&!pos){
   res.status(410).json({ok:false,code:'PRODUCT_UNAVAILABLE',error:'This endpoint only confirms merchant checkout payments.'});return
  }
  try{res.json(await register(input))}catch(cause){const error=cause as Error&{status?:number};res.status(error.status||500).json({ok:false,error:error.message||'Payment verification is temporarily unavailable.'})}
 }
}
export default createCheckoutConfirmationHandler()
