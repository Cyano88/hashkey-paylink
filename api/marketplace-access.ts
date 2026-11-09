import {randomUUID} from 'node:crypto'
import type {Request,Response} from 'express'
import {verifyDeveloperProjectOwner} from './developer-projects.js'
import {verifyOperationsIdentity} from './operations-access.js'
import {isOperationsFounder,operationsPolicy,operationsRequestPolicy} from './operations-policy.js'
import {readDurableJson,mutateDurableJson} from './render-durable-store.js'

type AccessRequest={id:string;projectId:string;projectName:string;ownerId:string;email:string;status:'pending'|'approved'|'rejected';createdAt:string;reviewNote?:string;reviewedAt?:string;decisions?:Array<{actorId:string;status:'approved'|'rejected';at:string;note:string}>}
type Store={requests:AccessRequest[]}
const key='hashpaylink:marketplace-access-requests:v1'
const defaults={owner:verifyDeveloperProjectOwner,admin:async(req:Request)=>{const identity=await verifyOperationsIdentity(req);if(!isOperationsFounder(identity,operationsPolicy(operationsRequestPolicy(req))))throw Object.assign(Error('Whitelist review access is restricted.'),{status:403});return identity},read:()=>readDurableJson<Store>(key),mutate:(fn:(s:Store)=>Store)=>mutateDurableJson<Store>(key,s=>fn(s||{requests:[]})),now:()=>new Date().toISOString(),uuid:randomUUID}
const view=({id,projectId,projectName,email,status,createdAt,reviewNote,reviewedAt}:AccessRequest)=>({id,projectId,projectName,email,status,createdAt,reviewNote,reviewedAt})
export function createMarketplaceAccessHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','private, no-store')
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
   if(req.query.resource==='admin'){
    const reviewer=await d.admin(req)
    if(req.method==='POST'){
     const body=req.body
     if(!body||Object.keys(body).sort().join(',')!=='expectedStatus,note,requestId,status'||typeof body.requestId!=='string'||!['approved','rejected'].includes(body.status)||!['pending','approved','rejected'].includes(body.expectedStatus)||typeof body.note!=='string'||body.note.length>500)return res.status(400).json({ok:false,error:'Provide a valid review decision and a note of up to 500 characters.'})
     const saved=await d.mutate(s=>{
      const request=s.requests.find(r=>r.id===body.requestId)
      if(!request)throw Object.assign(Error('Access request not found.'),{status:404})
      if(request.status===body.status&&request.reviewNote===body.note.trim())return s
      if(request.status!==body.expectedStatus)throw Object.assign(Error('This request changed. Refresh before reviewing.'),{status:409})
      request.status=body.status;request.reviewNote=body.note.trim();request.reviewedAt=d.now()
      request.decisions=[...(request.decisions||[]),{actorId:reviewer.userId,status:body.status,at:request.reviewedAt,note:request.reviewNote||''}]
      return s
     })
     return res.json({ok:true,request:view(saved.requests.find(r=>r.id===body.requestId)!)})
    }
    return res.json({ok:true,requests:((await d.read())?.requests||[]).map(view).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))})
   }
   const projectId=req.method==='GET'?req.query.projectId:req.body?.projectId
   if(typeof projectId!=='string'||!/^dev_[a-z0-9]{8,64}$/i.test(projectId))return res.status(400).json({ok:false,error:'Choose a developer app.'})
   const owner=await d.owner(req,projectId)
   const email=owner.email.trim().toLowerCase()
   if(req.method==='GET'){
    const request=(await d.read())?.requests.find(r=>r.projectId===projectId&&r.ownerId===owner.ownerId)
    return res.json({ok:true,email,request:request?view(request):null})
   }
   if(!req.body||Object.keys(req.body).sort().join(',')!=='email,projectId'||typeof req.body.email!=='string')return res.status(400).json({ok:false,error:'Provide your app and verified email.'})
   if(!email||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||req.body.email.trim().toLowerCase()!==email)return res.status(400).json({ok:false,error:'Use the verified email linked to your developer account.'})
   if(owner.operationalStatus!=='active')return res.status(403).json({ok:false,error:'This app is paused. Contact support before requesting access.'})
   const store=await d.mutate(s=>{
    if(!s.requests.some(r=>r.projectId===projectId&&r.ownerId===owner.ownerId))s.requests.push({id:d.uuid(),projectId,projectName:owner.name,ownerId:owner.ownerId,email,status:'pending',createdAt:d.now()})
    return s
   })
   return res.json({ok:true,request:view(store.requests.find(r=>r.projectId===projectId&&r.ownerId===owner.ownerId)!)})
  }catch(error){const status=(error as {status?:number}).status||503;return res.status(status).json({ok:false,error:status<500?(error as Error).message:'Access requests are temporarily unavailable. Please try again.'})}
 }
}
export default createMarketplaceAccessHandler()
