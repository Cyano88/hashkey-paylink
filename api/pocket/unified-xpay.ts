import type {Request,Response} from 'express'
import {randomUUID} from 'node:crypto'
import {verifiedPrivyUser} from '../privy-circle-link.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {listPocketXPayPosDestinations} from '../ng-pos.js'
import {listPocketXPayStockDestinations} from './xpay.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {validateXPayDestinations,type XPayCheckout,type XPayDestination} from '../../src/pocket/lib/pocketUnifiedXPay.js'
const KEY='pocket:unified-xpay:v1'
type Record = Omit<XPayCheckout,'destinations'>&{owner:string;destinationIds:string[];revisions:string[];key:string}
type Store={checkouts:Record[]}
const read=async()=>await readDurableJson<Store>(KEY)||{checkouts:[]}
const available=async(owner:string):Promise<XPayDestination[]> => (await Promise.all([listPocketXPayPosDestinations(owner),listPocketXPayStockDestinations(owner)])).flat()
async function publicCheckout(c:Record):Promise<XPayCheckout>{
 const current=await available(c.owner)
 // Do not silently change a checkout when an underlying receiving setup changes.
 const destinations=validateXPayDestinations(c.destinationIds,current)
 if(destinations.some((d,i)=>d.revision!==c.revisions[i]))throw Object.assign(Error('The receiving setup changed. Ask the merchant for a new QR.'),{status:409})
 return {id:c.id,name:c.name,createdAt:c.createdAt,destinations}
}
export default async function handler(req:Request,res:Response){
 res.setHeader('Cache-Control','no-store')
 try{
  if(req.method==='GET'){
   const id=String(req.query.id||'')
   if(!/^xp_[0-9a-f-]{36}$/.test(id))return res.status(400).json({ok:false,error:'Invalid XPay QR.'})
   const c=(await read()).checkouts.find(c=>c.id===id&&!c.deletedAt)
   if(!c)return res.status(404).json({ok:false,error:'This QR is no longer available.'})
   return res.json({ok:true,checkout:await publicCheckout(c)})
  }
  if(req.method!=='POST')return res.sendStatus(405)
  const identity=await verifiedPrivyUser(req),owner=identity.userId,b=req.body||{}
  if(b.action==='mine'){
   const destinations=await available(owner)
   const checkouts=(await read()).checkouts.filter(c=>c.owner===owner&&!c.deletedAt).map(c=>({id:c.id,name:c.name,createdAt:c.createdAt,destinations:c.destinationIds.flatMap(id=>destinations.filter(d=>d.id===id))}))
   return res.json({ok:true,destinations,checkouts})
  }
  if(b.action==='create'){
   const name=String(b.name||'').trim(),key=String(b.key||'')
   if(!name||name.length>60||/[<>\u0000-\u001f]/.test(name)||! /^[a-zA-Z0-9-]{16,80}$/.test(key))return res.status(400).json({ok:false,error:'Enter a checkout name and valid request reference.'})
   const selected=validateXPayDestinations(b.destinationIds,await available(owner))
   let checkout:Record|undefined
   await mutateDurableJson<Store>(KEY,current=>{
    const s=current||{checkouts:[]};const prior=s.checkouts.find(c=>c.owner===owner&&c.key===key)
    if(prior){if(prior.deletedAt||prior.name!==name||JSON.stringify(prior.destinationIds)!==JSON.stringify(selected.map(d=>d.id)))throw Object.assign(Error('This request reference already has different checkout details.'),{status:409});checkout=prior;return s}
    if(s.checkouts.filter(c=>c.owner===owner&&!c.deletedAt).length>=20)throw Object.assign(Error('You can have up to 20 active XPay QRs.'),{status:400})
    checkout={id:'xp_'+randomUUID(),owner,key,name,destinationIds:selected.map(d=>d.id),revisions:selected.map(d=>d.revision),createdAt:Date.now()};s.checkouts.push(checkout);return s
   })
   return res.json({ok:true,checkout:await publicCheckout(checkout!)})
  }
  if(b.action==='delete'){
   const c=(await read()).checkouts.find(c=>c.id===b.id&&c.owner===owner&&!c.deletedAt)
   if(!c)return res.status(404).json({ok:false,error:'QR not found.'})
   if(!await consumePocketPaymentApproval(String(req.headers['x-pocket-payment-approval']||''),owner))return res.status(403).json({ok:false,error:'Confirm with your PIN or fingerprint.'})
   await mutateDurableJson<Store>(KEY,current=>({checkouts:(current?.checkouts||[]).map(x=>x.id===c.id&&x.owner===owner?{...x,deletedAt:Date.now()}:x)}))
   return res.json({ok:true})
  }
  return res.status(400).json({ok:false,error:'Unsupported XPay action.'})
 }catch(e){const error=e as Error&{status?:number};return res.status(error.status||503).json({ok:false,error:error.status&&error.status<500?error.message:'XPay is temporarily unavailable.'})}
}
