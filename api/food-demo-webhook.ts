import type {Request,Response} from 'express'
import {createHmac,createHash,timingSafeEqual} from 'node:crypto'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {reconcileFoodDemoCheckout} from './food-demo.js'
const STORE='hashpaylink:food-demo-webhooks:v1'
type Events=Record<string,{hash:string;at:number}>
const defaults={secret:()=>process.env.FOOD_DEMO_WEBHOOK_SECRET||'',ready:hasRenderDurableStore,now:Date.now,reconcile:reconcileFoodDemoCheckout,read:async()=>await readDurableJson<Events>(STORE)||{},record:async(id:string,hash:string,at:number)=>{await mutateDurableJson<Events>(STORE,current=>{const events=current||{};if(events[id]&&events[id].hash!==hash)throw Error('Event conflict.');events[id]={hash,at};return events})}}
export function createFoodDemoWebhook(overrides:Partial<typeof defaults>={}) {
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.sendStatus(405)
  const secret=d.secret()
  if(secret.length<32||!d.ready())return res.status(503).json({ok:false,error:'Webhook is not configured.'})
  if(!Buffer.isBuffer(req.body)||!req.body.length||req.body.length>65536)return res.status(400).json({ok:false,error:'Raw JSON body required.'})
  const header=req.headers['x-hashpaylink-signature']
  const match=typeof header==='string'?/^t=(\d{10}),v1=([a-f0-9]{64})$/.exec(header):null
  if(!match||Math.abs(d.now()/1000-Number(match[1]))>300)return res.status(401).json({ok:false,error:'Invalid webhook signature.'})
  const raw=req.body.toString('utf8'),expected=createHmac('sha256',secret).update(match[1]+'.'+raw).digest()
  if(!timingSafeEqual(expected,Buffer.from(match[2],'hex')))return res.status(401).json({ok:false,error:'Invalid webhook signature.'})
  let event:any
  try{event=JSON.parse(raw)}catch{return res.status(400).json({ok:false,error:'Invalid JSON.'})}
  if(typeof event?.id!=='string'||!event.id.length||event.id.length>180||typeof event.event!=='string')return res.status(400).json({ok:false,error:'Invalid event.'})
  if(event.event!=='payment.confirmed')return res.json({ok:true,ignored:true})
  const checkoutId=event.data?.checkoutId
  if(typeof checkoutId!=='string'||!/^chk(?:x|b)?_[a-zA-Z0-9]{8,40}$/.test(checkoutId))return res.status(400).json({ok:false,error:'Invalid checkout reference.'})
  const hash=createHash('sha256').update(raw).digest('hex')
  try{
   const seen=(await d.read())[event.id]
   if(seen)return res.status(seen.hash===hash?200:409).json({ok:seen.hash===hash,duplicate:seen.hash===hash})
   // A webhook is a notification. Fulfil only after the project's authenticated status API agrees.
   await d.reconcile(checkoutId)
   await d.record(event.id,hash,d.now())
   return res.json({ok:true})
  }catch{return res.status(503).json({ok:false,error:'Payment confirmation is pending. Retry delivery.'})}
 }
}
export default createFoodDemoWebhook()
