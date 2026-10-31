import {resolveCirclePocketIdentity,circlePocketIdentityId} from './circle-pocket-identity.js'
import {readSupportJson} from './hash-support/pocket-storage.js'
import type {Request,Response} from 'express'
import {randomUUID} from 'node:crypto'
import {readDurableJson,writeDurableJson} from './render-durable-store.js'
import {verifyDeveloper,verifyDeveloperProjectOwner} from './developer-projects.js'
import {verifyOperationsIdentity} from './operations-access.js'
import {authorizeOperations,isOperationsFounder,operationsPolicy,operationsRequestPolicy} from './operations-policy.js'
import type {OperationsCase} from './operations-cases.js'
import {SUPPORT_FILE_LIMIT,SUPPORT_FILE_COUNT,type SupportAttachment} from '../src/lib/supportAttachments.js'
type Scope={uploaderId:string;projectId?:string;workspaceId?:string;caseId?:string}
type StoredAttachment=SupportAttachment&Scope&{data:string;createdAt:number}
const fileKey=(id:string)=>'hashpaylink:support-file:v1:'+id
function fail(message:string,status=400):never{throw Object.assign(Error(message),{status})}
const meta=(f:SupportAttachment):SupportAttachment=>({id:f.id,name:f.name,mime:f.mime,size:f.size})
export function validateSupportFile(bytes:Buffer,name:unknown,mime:unknown){
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>SUPPORT_FILE_LIMIT)fail('Choose a file up to 5 MB.')
 if(typeof name!=='string'||!name.trim()||name.length>180||/[\x00-\x1f\x7f/\\]/.test(name))fail('Choose a file with a valid name.')
 const ext=name.toLowerCase().split('.').pop(),head=bytes.subarray(0,12)
 const valid=(mime==='image/png'&&ext==='png'&&head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
  (mime==='image/jpeg'&&['jpg','jpeg'].includes(ext||'')&&head[0]===255&&head[1]===216&&head[2]===255)||
  (mime==='image/webp'&&ext==='webp'&&head.subarray(0,4).toString()==='RIFF'&&head.subarray(8,12).toString()==='WEBP')||
  (mime==='application/pdf'&&ext==='pdf'&&head.subarray(0,5).toString()==='%PDF-')||
  (mime==='text/plain'&&ext==='txt'&&!bytes.includes(0)&&!/[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(bytes.toString('utf8'))&&Buffer.from(bytes.toString('utf8'),'utf8').equals(bytes))
 if(!valid)fail('Use a PNG, JPG, WebP, PDF or plain-text file with a matching file type.')
 return {name:name.trim(),mime:String(mime),size:bytes.length}
}
export function createAttachmentResolver(read=readDurableJson){return async(ids:unknown,scope:Scope):Promise<SupportAttachment[]>=>{
 if(ids===undefined)return []
 if(!Array.isArray(ids)||ids.length>SUPPORT_FILE_COUNT||new Set(ids).size!==ids.length)fail('Attach up to 3 files per message.')
 return Promise.all(ids.map(async id=>{
  if(typeof id!=='string'||!/^sf_[a-f0-9-]{36}$/.test(id))fail('Invalid attachment.')
  const f=await read<StoredAttachment>(fileKey(id))
  if(!f||f.uploaderId!==scope.uploaderId||f.projectId!==scope.projectId||f.workspaceId!==scope.workspaceId||f.caseId!==scope.caseId)fail('Attachment not found for this conversation.',404)
  return meta(f)
 }))
}}
export const resolveSupportAttachments=createAttachmentResolver()
const defaults={pocketIdentity:resolveCirclePocketIdentity,pocketRead:readSupportJson,identity:verifyDeveloper,owner:verifyDeveloperProjectOwner,staff:verifyOperationsIdentity,env:operationsRequestPolicy,read:readDurableJson,write:writeDurableJson,uuid:randomUUID,now:Date.now}
export function createSupportAttachmentHandler(overrides:Partial<typeof defaults>={}){const d={...defaults,...overrides};return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff')
 try{
  if([req.headers.authorization,req.headers['x-api-key']].some(value=>/hpl_(?:cli|app)_/.test(String(value||''))))fail('Sign in to access support files.',403)
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
  const pocket=['pocket-user','pocket-staff'].includes(String(req.query.audience)),staff=req.query.audience==='staff'||req.query.audience==='pocket-staff',projectId=String(req.query.projectId||'')||undefined,caseId=String(req.query.caseId||'')||undefined
  let scope:Scope,allowed:(c:OperationsCase)=>boolean
  if(staff){
   const identity=await d.staff(req),env=d.env(req),policy=operationsPolicy(env),access=authorizeOperations(identity,{query:req.query,method:req.method,body:req.method==='POST'?{action:pocket?'staff-attachment':'case-attachment'}:undefined},pocket?'support':'cases',undefined,env)
   const manage=isOperationsFounder(identity,policy)||policy.grants.some(g=>g.email.toLowerCase()===identity.email.toLowerCase()&&g.workspaceId===access.workspaceId&&(g.roles||[]).some(r=>['support','administrator'].includes(r)))
   if(!manage||(pocket?access.workspaceId!=='pocket':access.workspaceId==='pocket'))fail('Support access required.',403)
   scope={uploaderId:identity.userId,workspaceId:access.workspaceId,caseId}
   allowed=c=>pocket?true:c.humanSupport!==false&&c.workspaceId===access.workspaceId&&(access.workspaceId==='builders'?!c.projectId:access.projectIds.includes(c.projectId||''))
  }else if(pocket){
   const identity=await d.pocketIdentity(req);if(identity.kind!=='privy')fail('Sign in to Pocket.',401);const id=circlePocketIdentityId(identity);scope={uploaderId:id,workspaceId:'pocket'};allowed=c=>c.profileId===id
  }else{
   const identity=projectId?await d.owner(req,projectId):await d.identity(req).then(i=>({ownerId:i.userId}))
   scope={uploaderId:identity.ownerId,projectId};allowed=c=>c.projectId===projectId&&c.profileId===identity.ownerId+':'+(projectId||'account')
  }
  let c:OperationsCase|undefined
  if(caseId){c=(pocket?await d.pocketRead<{cases:Record<string,OperationsCase>}>((process.env.POCKET_SUPPORT_STORE_KEY||'hashpaylink:pocket-support:v1').trim()):await d.read<{cases:Record<string,OperationsCase>}>('hashpaylink:business-support:v1'))?.cases[caseId];if(!c||!allowed(c))fail('Conversation not found.',404)}
  if(req.method==='POST'){
   if(staff&&!c)fail('Choose a conversation.')
   if(c?.status==='resolved')fail('This conversation is closed.',409)
   const info=validateSupportFile(req.body,req.query.name,req.query.mime),id='sf_'+d.uuid()
   const file:StoredAttachment={...info,id,...scope,data:req.body.toString('base64'),createdAt:d.now()};await d.write(fileKey(id),file)
   return res.json({ok:true,attachment:meta(file)})
  }
  const id=String(req.query.id||'');if(!c||!c.messages?.some(m=>m.attachments?.some(a=>a.id===id)))fail('Attachment not found in this conversation.',404)
  const file=await d.read<StoredAttachment>(fileKey(id));if(!file)fail('Attachment is unavailable.',404)
  res.setHeader('Content-Type',file.mime);res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(file.name));res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox")
  return res.send(Buffer.from(file.data,'base64'))
 }catch(e){const status=(e as {status?:number}).status||503;return res.status(status).json({ok:false,error:status<500?(e as Error).message:'Files are temporarily unavailable. Try again.'})}
}}
export default createSupportAttachmentHandler()
