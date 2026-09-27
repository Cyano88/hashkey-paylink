import {retirePosQr} from './pos-retirement.js'
import {UNIFIED_XPAY_KEY as KEY,readUnifiedXPayStore as read,type UnifiedXPayRecord as Record,type UnifiedXPayStore as Store} from './unified-xpay-store.js'
import type {Request,Response} from 'express'
import {randomUUID} from 'node:crypto'
import {verifiedPrivyUser} from '../privy-circle-link.js'
import {mutateDurableJson} from '../render-durable-store.js'
import {ownedPosSetupKeys,ownedPosSetupKey,ownsPocketPosQr,listPocketXPayPosDestinations,listPocketUnifiedXPayPosPayments} from '../ng-pos.js'
import {ownedStockSetupKeys,ownedStockSetupKey,listPocketXPayStockDestinations,listPocketUnifiedXPayStockPayments} from './xpay.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {validateXPayDestinations,type XPayCheckout,type XPayDestination} from '../../src/pocket/lib/pocketUnifiedXPay.js'
const available=async(owner:string):Promise<XPayDestination[]> => (await Promise.all([listPocketXPayPosDestinations(owner),listPocketXPayStockDestinations(owner)])).flat()
async function publicCheckout(c:Record):Promise<XPayCheckout>{
 const current=await available(c.owner)
 // Do not silently change a checkout when an underlying receiving setup changes.
 if(!c.destinationIds.length)throw Object.assign(Error('This terminal is not accepting payments yet.'),{status:409})
 const destinations=validateXPayDestinations(c.destinationIds,current)
 if(destinations.some((d,i)=>d.revision!==c.revisions[i]))throw Object.assign(Error('Receiving options changed. Reopen this terminal before paying.'),{status:409})
 return {id:c.id,name:c.name,createdAt:c.createdAt,version:c.version||0,destinations}
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
  if(b.action==='bank-delete'){
   const id=typeof b.id==='string'?b.id:''
   if(!id||!await ownsPocketPosQr(owner,id))return res.status(404).json({ok:false,error:'QR not found.'})
   if(!await consumePocketPaymentApproval(String(req.headers['x-pocket-payment-approval']||''),owner))return res.status(403).json({ok:false,error:'Confirm with your PIN or fingerprint.'})
   return res.json({ok:true,deletedAt:await retirePosQr(owner,id)})
  }
  if(b.action==='mine'){
   const destinations=await available(owner)
   const records=(await read()).checkouts
   const proofs=Object.assign({},...await Promise.all([ownedPosSetupKeys(owner),ownedStockSetupKeys(owner)]))
   const standaloneIds=destinations.filter(d=>!records.some(c=>c.destinationIds.includes(d.id)||c.pastDestinations?.some(p=>p.id===d.id)||c.setupKeys?.some(k=>k.key===proofs[d.id]))).map(d=>d.id)
   const checkouts=records.filter(c=>c.owner===owner&&!c.deletedAt).map(c=>({id:c.id,name:c.name,createdAt:c.createdAt,version:c.version||0,destinations:c.destinationIds.flatMap(id=>destinations.filter(d=>d.id===id))}))
   return res.json({ok:true,destinations,checkouts,standaloneIds})
  }
  if(b.action==='history'){
   const c=b.id?(await read()).checkouts.find(c=>c.id===b.id&&c.owner===owner):undefined
   if(b.id&&!c)return res.status(404).json({ok:false,error:'QR not found.'})
   const payments=(await Promise.all([listPocketUnifiedXPayPosPayments(owner,c?.id,c?.legacyDestinationIds),listPocketUnifiedXPayStockPayments(owner,c?.id,c?.legacyDestinationIds)])).flat().sort((a,b)=>b.createdAt-a.createdAt)
   return res.json({ok:true,payments:payments.slice(0,200)})
  }
  if(b.action==='create'||b.action==='adopt'){
   const adopting=b.action==='adopt',destinations=adopting?await available(owner):[]
   const destination=adopting?destinations.find(d=>d.id===b.destinationId):undefined
   if(adopting&&!destination)return res.status(404).json({ok:false,error:'Terminal not found.'})
   const name=adopting?destination!.name:String(b.name||'').trim(),key=adopting?'adopt-'+destination!.id:String(b.key||'')
   if(!name||name.length>60||/[<>\u0000-\u001f]/.test(name)||(!adopting&&!/^[a-zA-Z0-9-]{16,80}$/.test(key)))return res.status(400).json({ok:false,error:'Enter a business name.'})
   if(!adopting&&Array.isArray(b.destinationIds)&&b.destinationIds.length)return res.status(400).json({ok:false,error:'Create a terminal, then set up its own receiving options.'})
   const adoptionKey=destination?(destination.kind==='xstocks'?await ownedStockSetupKey(owner,destination.id):await ownedPosSetupKey(owner,destination.id)):undefined
   let checkout:Record|undefined
   await mutateDurableJson<Store>(KEY,current=>{
    const s=current||{checkouts:[]},prior=s.checkouts.find(c=>c.owner===owner&&c.key===key)
    if(prior){if(prior.deletedAt||prior.name!==name)throw Object.assign(Error('This creation reference was already used. Start again.'),{status:409});checkout=prior;return s}
    if(destination&&s.checkouts.some(c=>c.destinationIds.includes(destination.id)||c.pastDestinations?.some(d=>d.id===destination.id)||c.setupKeys?.some(k=>k.key===adoptionKey)))throw Object.assign(Error('This receiving option already belongs to another terminal.'),{status:409})
    if(s.checkouts.filter(c=>c.owner===owner&&!c.deletedAt).length>=20)throw Object.assign(Error('You can have up to 20 active terminals.'),{status:400})
    checkout={id:'xp_'+randomUUID(),owner,key,name,destinationIds:destination?[destination.id]:[],revisions:destination?[destination.revision]:[],legacyDestinationIds:destination?[destination.id]:[],createdAt:Date.now(),version:0};s.checkouts.push(checkout);return s
   })
   const active=await available(owner)
   return res.json({ok:true,checkout:{id:checkout!.id,name:checkout!.name,createdAt:checkout!.createdAt,version:checkout!.version||0,destinations:checkout!.destinationIds.flatMap(id=>active.filter(d=>d.id===id))}})
  }
  if(b.action==='begin-setup'){
   if(!['bank','wallet'].includes(b.kind))return res.status(400).json({ok:false,error:'Choose a receiving option.'})
   let key=''
   await mutateDurableJson<Store>(KEY,current=>{
    const s=current||{checkouts:[]},c=s.checkouts.find(c=>c.id===b.id&&c.owner===owner&&!c.deletedAt)
    if(!c)throw Object.assign(Error('Terminal not found.'),{status:404})
    if((c.setupKeys?.length||0)>=100)throw Object.assign(Error('Too many unfinished setups. Contact Pocket support.'),{status:409})
    key=randomUUID();c.setupKeys=[...(c.setupKeys||[]),{key,kind:b.kind}];return s
   })
   return res.json({ok:true,key})
  }
  if(b.action==='configure'){
   const c=(await read()).checkouts.find(c=>c.id===b.id&&c.owner===owner&&!c.deletedAt)
   if(!c)return res.status(404).json({ok:false,error:'Terminal not found.'})
   const destinations=await available(owner)
   const selected=Array.isArray(b.destinationIds)&&b.destinationIds.length===0?[]:validateXPayDestinations(b.destinationIds,destinations)
   const proofs=await Promise.all(selected.map(d=>d.kind==='xstocks'?ownedStockSetupKey(owner,d.id):ownedPosSetupKey(owner,d.id)))
   if(!await consumePocketPaymentApproval(String(req.headers['x-pocket-payment-approval']||''),owner))return res.status(403).json({ok:false,error:'Confirm with your PIN or fingerprint.'})
   let saved:Record|undefined
   await mutateDurableJson<Store>(KEY,current=>{
    const s=current||{checkouts:[]},live=s.checkouts.find(x=>x.id===c.id&&x.owner===owner&&!x.deletedAt)
    if(!live)throw Object.assign(Error('Terminal not found.'),{status:404})
    if(b.version!==(live.version||0))throw Object.assign(Error('This terminal changed. Reopen it before saving.'),{status:409})
    for(const [i,d] of selected.entries()){
     if(s.checkouts.some(other=>other.id!==live.id&&(other.destinationIds.includes(d.id)||other.pastDestinations?.some(p=>p.id===d.id))))throw Object.assign(Error('Receiving options cannot be shared between terminals.'),{status:409})
     const belongs=live.destinationIds.includes(d.id)||live.pastDestinations?.some(p=>p.id===d.id)
     if(!belongs&&!live.setupKeys?.some(k=>k.key===proofs[i]&&k.kind===(d.kind==='xstocks'?'wallet':'bank')))throw Object.assign(Error('Set up this receiving option inside this business terminal.'),{status:409})
    }
    live.pastDestinations=[...(live.pastDestinations||[]),...live.destinationIds.map((id,i)=>({id,revision:live.revisions[i]}))].filter((d,i,all)=>all.findIndex(p=>p.id===d.id&&p.revision===d.revision)===i)
    live.setupKeys=live.setupKeys?.filter(k=>!proofs.includes(k.key))
    live.destinationIds=selected.map(d=>d.id);live.revisions=selected.map(d=>d.revision);live.version=(live.version||0)+1;saved=live;return s
   })
   return res.json({ok:true,checkout:{id:saved!.id,name:saved!.name,createdAt:saved!.createdAt,version:saved!.version,destinations:selected}})
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
