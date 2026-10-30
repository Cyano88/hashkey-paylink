import type {Request,Response} from 'express'
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto'
import {readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {SANDBOX_ASSETS,type SandboxPayment} from '../src/lib/developerSandbox.js'

type Key = {id:string;prefix:string;digest:string;createdAt:string;revokedAt?:string}
type Store = {keys:Key[];payments:SandboxPayment[];requests:Record<string,{digest:string;id:string}>}
type Dependencies = {
  verify:(req:Request)=>Promise<{userId:string}>;
  read:(key:string)=>Promise<Store|undefined>;
  mutate:(key:string,update:(current:Store|undefined)=>Store)=>Promise<Store>;
  now:()=>Date;
}
const empty=():Store=>({keys:[],payments:[],requests:{}})
const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
const fail=(message:string,status=400):never=>{throw Object.assign(Error(message),{status})}
const same=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b))
const snapshot=(store:Store)=>({payments:store.payments,keys:store.keys.map(({digest,...key})=>key)})

// Deliberately separate from live project stores, policies, wallets and provider adapters.
// No function in this module sends funds, emails or webhooks.
export function createDeveloperSandboxHandler(verify:Dependencies['verify'],overrides:Partial<Dependencies>={}) {
 const deps:Dependencies={verify,read:readDurableJson,mutate:mutateDurableJson,now:()=>new Date(),...overrides}
 return async(req:Request,res:Response)=>{
  try {
   if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
   for(const hint of [req.query?.environment,req.body?.environment,req.headers['x-hashpaylink-environment']])if(hint!==undefined&&hint!=='test')fail('This endpoint only accepts environment test.')
   const bearer=String(req.headers.authorization??'').replace(/^Bearer\s+/i,'')
   const credential=String(req.headers['x-api-key']??bearer)
   if(/^hpl_(live|app|cli)_/.test(credential))fail('Production credentials cannot access the sandbox.',403)
   const testKey=credential.startsWith('hpl_test_')
   let owner:string
   if(testKey){const match=/^hpl_test_([a-f0-9]{64})_([a-f0-9]{64})$/.exec(credential);if(!match)fail('Invalid sandbox key.',401);owner=match![1]}
   else owner=hash((await deps.verify(req)).userId)
   const storeKey='hashpaylink:developer-sandbox:v1:'+owner
   const authorize=(store:Store)=>{if(testKey&&!store.keys.some(key=>!key.revokedAt&&same(key.digest,hash(credential))))fail('Invalid or revoked sandbox key.',401)}
   const current=await deps.read(storeKey)??empty();authorize(current)
   if(req.method==='GET'){
    const id=req.query?.id
    if(id!==undefined){if(typeof id!=='string')fail('Invalid checkout ID.');const checkout=current.payments.find(p=>p.id===id);if(!checkout)fail('Sandbox checkout not found.',404);return res.json({ok:true,environment:'test',simulated:true,checkout})}
    return res.json({ok:true,environment:'test',simulated:true,...snapshot(current)})
   }
   const action=req.body?.action
   const now=deps.now().toISOString()
   if(action==='webhook-fixture'){
    const checkout=current.payments.find(p=>p.id===req.body?.id)
    if(!checkout||checkout.status!=='paid')fail('Choose a paid test checkout.',409)
    const eventId='test_evt_'+hash(checkout!.id).slice(0,24)
    const signingSecret='whsec_test_'+randomBytes(32).toString('hex')
    const timestamp=String(Math.floor(deps.now().getTime()/1000))
    const payload=JSON.stringify({id:eventId,event:'payment.confirmed',createdAt:checkout!.updatedAt,data:{checkoutId:checkout!.id,amount:checkout!.amount,network:checkout!.network,asset:checkout!.asset,reference:checkout!.reference,environment:'test',simulated:true}})
    const signature=createHmac('sha256',signingSecret).update(timestamp+'.'+payload).digest('hex')
    return res.json({ok:true,environment:'test',simulated:true,fixture:{signingSecret,payload,headers:{'content-type':'application/json','x-hashpaylink-event':eventId,'x-hashpaylink-signature':`t=${timestamp},v1=${signature}`}}})
   }
   if(action==='create-key'){
    if(testKey)fail('Sign in to manage sandbox keys.',403)
    const raw='hpl_test_'+owner+'_'+randomBytes(32).toString('hex')
    const key:Key={id:randomUUID(),prefix:raw.slice(0,18)+"..."+raw.slice(-6),digest:hash(raw),createdAt:now}
    await deps.mutate(storeKey,store=>{const next=store??empty();if(next.keys.filter(k=>!k.revokedAt).length>=5)fail('Revoke a sandbox key before creating another.',409);return {...next,keys:[...next.keys.slice(-49),key]}})
    return res.status(201).json({ok:true,environment:'test',apiKey:raw})
   }
   if(action==='revoke-key'){
    if(testKey)fail('Sign in to manage sandbox keys.',403)
    await deps.mutate(storeKey,store=>{const next=store??empty();if(!next.keys.some(k=>k.id===req.body?.keyId))fail('Key not found.',404);return {...next,keys:next.keys.map(k=>k.id===req.body.keyId?{...k,revokedAt:k.revokedAt??now}:k)}})
    return res.json({ok:true})
   }
   if(action==='create-checkout'){
    const {amount,network,asset}=req.body??{}
    if(typeof amount!=='string'||!/^\d{1,7}(\.\d{1,6})?$/.test(amount)||Number(amount)<=0)fail('Enter a positive amount with up to 6 decimal places.')
    if(typeof network!=='string'||!Object.prototype.hasOwnProperty.call(SANDBOX_ASSETS,network)||!SANDBOX_ASSETS[network].includes(asset))fail('Choose a supported checkout network and asset.')
    const title=typeof req.body.title==='string'?req.body.title.trim():''
    if(!title||title.length>100)fail('Enter a title up to 100 characters.')
    const reference=req.body.reference
    if(typeof reference!=='string'||!reference.trim()||reference.length>100)fail('Include your order reference (up to 100 characters).')
    const requestId=req.headers['idempotency-key']
    if(typeof requestId!=='string'||! /^[\w-]{8,100}$/.test(requestId))fail('Include an Idempotency-Key header with 8 to 100 letters, numbers, underscores or dashes.')
    const fingerprint=hash(JSON.stringify({amount,network,asset,title,reference}))
    let checkout:SandboxPayment|undefined
    await deps.mutate(storeKey,store=>{
     const next=store??empty();authorize(next)
     const prior=next.requests[hash(requestId as string)]
     if(prior){if(prior.digest!==fingerprint)fail('This idempotency key was used with different checkout details.',409);checkout=next.payments.find(p=>p.id===prior.id);return next}
     if(next.payments.length>=500)fail('Sandbox payment limit reached. Contact support to reset this workspace.',409)
     checkout={id:'test_chk_'+randomUUID().replace(/-/g,''),title,amount,network,asset,reference,status:'pending',environment:'test',simulated:true,createdAt:now,updatedAt:now}
     return {...next,payments:[checkout,...next.payments],requests:{...next.requests,[hash(requestId as string)]:{digest:fingerprint,id:checkout.id}}}
    })
    return res.status(201).json({ok:true,environment:'test',simulated:true,checkout})
   }
   if(action==='simulate'){
    const status=req.body?.status
    if(!['processing','paid','failed','expired'].includes(status))fail('Choose processing, paid, failed or expired.')
    let checkout:SandboxPayment|undefined
    await deps.mutate(storeKey,store=>{
     const next=store??empty();authorize(next);const payment=next.payments.find(p=>p.id===req.body?.id)
     if(!payment)fail('Sandbox checkout not found.',404)
     if(['paid','failed','expired'].includes(payment!.status)&&payment!.status!==status)fail('This test payment has finished. Create a new payment to test another outcome.',409)
     checkout={...payment!,status,updatedAt:payment!.status===status?payment!.updatedAt:now}
     return {...next,payments:next.payments.map(p=>p.id===checkout!.id?checkout!:p)}
    })
    return res.json({ok:true,environment:'test',simulated:true,checkout})
   }
   fail('Unknown sandbox action.')
  }catch(error){const e=error as Error&{status?:number};return res.status(e.status??500).json({ok:false,error:e.status?e.message:'Sandbox is temporarily unavailable.'})}
 }
}
