import type {Request,Response} from 'express'
import {verifyOperationsIdentity} from '../operations-access.js'
import {isOperationsFounder,operationsPolicy,operationsRequestPolicy} from '../operations-policy.js'
import {readDurableJson} from '../render-durable-store.js'
import {marketplaceStorage,marketplaceFields} from './application.js'
import {marketplaceOperationalSnapshot} from './workers.js'
import {marketplaceReference} from './beneficiaries.js'
const defaults={identity:verifyOperationsIdentity,read:readDurableJson,storage:marketplaceStorage,founder:(req:Request,identity:Awaited<ReturnType<typeof verifyOperationsIdentity>>)=>isOperationsFounder(identity,operationsPolicy(operationsRequestPolicy(req)))}
/** Founder-only operational visibility and explicitly reviewed webhook retry. No money commands. */
export function createMarketplaceOperationsHandler(d=defaults){return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','no-store')
 try{
  const identity=await d.identity(req)
  if(!d.founder(req,identity))return res.status(403).json({ok:false,error:'Marketplace operations access denied.'})
  if(req.method==='GET'){
   const [s,health,backing]=await Promise.all([d.storage.read(),d.read('hashpaylink:marketplace-worker-health:v1'),d.read('hashpaylink:marketplace-backing-monitor:v1')])
   const events=(s?.books||[]).flatMap(b=>[...(b.walletEvents||[]),...(b.refundEvents||[]),...(b.bankEvents||[])]).filter(e=>e.delivery!=='delivered').slice(0,100).map(e=>({projectId:e.projectId,paymentId:e.paymentId,eventId:e.id,type:e.type,delivery:e.delivery,attempts:e.attempts||0,createdAt:e.createdAt}))
   return res.json({ok:true,data:{current:marketplaceOperationalSnapshot(s),health,backing,events}})
  }
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed.'})
  const v=marketplaceFields(req.body,['projectId','paymentId','eventId','expectedWebhookUrl','reason'])
  const projectId=marketplaceReference(v.projectId),paymentId=marketplaceReference(v.paymentId),eventId=marketplaceReference(v.eventId)
  if(typeof v.reason!=='string'||v.reason.trim().length<10||v.reason.length>300)return res.status(400).json({ok:false,error:'Provide a review reason.'})
  const projects=await d.read<{projects:Record<string,{webhookUrl?:string}>}>((process.env.DEVELOPER_PROJECT_STORE_KEY??'hashpaylink:developer-projects:v1').trim())
  const url=projects?.projects[projectId]?.webhookUrl
  if(!url||url!==v.expectedWebhookUrl||!url.startsWith('https://'))return res.status(409).json({ok:false,error:'Review the current project webhook destination before retrying.'})
  await d.storage.mutate(s=>{
   const b=s.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId),e=[...(b?.walletEvents||[]),...(b?.refundEvents||[]),...(b?.bankEvents||[])].find(e=>e.id===eventId)
   if(!e||e.delivery==='delivered'||e.delivery==='delivering')throw Error('Webhook cannot be retried in its current state.')
   const at=d.storage.now();e.replayApprovals=[...(e.replayApprovals||[]),{actorId:identity.userId,reason:String(v.reason).trim(),at}];e.replayApprovedAt=at;e.delivery='pending';e.attempts=0;e.nextAttemptAt=at;delete e.claimToken;delete e.leaseUntil;return s
  })
  return res.json({ok:true,data:{eventId,status:'pending',note:'Replay approved; delivery requires the webhook worker and project allowlist.'}})
 }catch(error){const status=(error as {status?:number}).status;return res.status(status===401||status===403?status:503).json({ok:false,error:'Marketplace operations unavailable.'})}
}}
