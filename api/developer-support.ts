import {readSupportStaffProfiles,withSupportStaffAvatars} from './support-staff-profile.js'
import {resolveSupportAttachments} from './support-attachments.js'
import {supportPresence} from './support-presence.js'
import {developerSupportSteps,developerSupportTopics,developerSupportOption,type DeveloperSupportOption} from '../src/lib/developerSupportFlow.js'
import type {Request,Response} from 'express'
import {randomUUID} from 'node:crypto'
import {verifyDeveloperProjectOwner,verifyDeveloper} from './developer-projects.js'
import {readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {BUSINESS_SUPPORT_KEY,type OperationsCase} from './operations-cases.js'
import {submitSupportConversation,type Conversation} from './pocket/support-conversation.js'
export type DeveloperCase=Omit<OperationsCase,keyof Conversation>&Omit<Conversation,'category'>&{category:string;supportStep?:string;menuPrompted?:boolean;supportOptions?:DeveloperSupportOption[];customer:{fullName:string;email:string}}
type Store={cases:Record<string,DeveloperCase>}
const defaults={profiles:readSupportStaffProfiles,attachments:resolveSupportAttachments,presence:supportPresence,identity:verifyDeveloper,owner:verifyDeveloperProjectOwner,now:Date.now,uuid:randomUUID,workspace:(projectId:string)=>{const rows=JSON.parse(process.env.OPERATIONS_WORKSPACES_JSON||'[]') as Array<{id:string;projectIds:string[]}>;return rows.find(w=>w.projectIds.includes(projectId))?.id||projectId},read:async()=>await readDurableJson<Store>(BUSINESS_SUPPORT_KEY)||{cases:{}},mutate:(fn:(s:Store)=>Store)=>mutateDurableJson<Store>(BUSINESS_SUPPORT_KEY,s=>fn(s||{cases:{}}))}
// Customer projection deliberately excludes profile IDs, staff emails, evidence, internal notes and review decisions.
export function developerCaseView(c:DeveloperCase){return {id:c.id,projectId:c.projectId,summary:c.summary,status:c.status,humanSupport:c.humanSupport,updatedAt:c.updatedAt,supportOptions:c.status==='resolved'||c.humanSupport?[]:c.supportOptions||developerSupportTopics,staffJoined:Boolean(c.assignedTo||c.messages.some(m=>m.author==='staff'||m.kind==='staff_joined')),messages:c.messages.map(m=>({id:m.id,author:m.author,text:m.text,createdAt:m.createdAt,kind:m.kind,displayName:m.displayName,avatarDataUrl:m.avatarDataUrl,attachments:m.attachments}))}}
export function createDeveloperSupportHandler(overrides:Partial<typeof defaults>={}){const d={...defaults,...overrides};return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','private, no-store')
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
  const projectId=String(req.method==='GET'?req.query.projectId||'':req.body?.projectId||'');const owner=projectId?await d.owner(req,projectId):await d.identity(req).then(i=>({ownerId:i.userId,email:i.email,name:i.email}));const scope=projectId||undefined;const profileId=owner.ownerId+':'+(projectId||'account')
  if((req.method==='GET'&&req.query.presence)||(req.method==='POST'&&req.body?.action==='typing')){
   const caseId=String(req.method==='GET'?req.query.presence:req.body.caseId||'');const c=(await d.read()).cases[caseId]
   if(!c||c.profileId!==profileId||c.projectId!==scope)return res.status(404).json({ok:false,error:'Conversation not found.'})
   if(req.method==='GET')return res.json({ok:true,...(c.status==='resolved'||!c.humanSupport?{expiresIn:0}:await d.presence.read(c.id,'staff',d.now()))})
   if(typeof req.body.typing!=='boolean')return res.status(400).json({ok:false,error:'Invalid typing state.'})
   if(c.status==='resolved'||!c.humanSupport)return res.status(409).json({ok:false,error:'This conversation is not waiting for support.'})
   await d.presence.set(c.id,'user',req.body.typing,d.now());return res.json({ok:true})
  }
  if(req.method==='GET'){const profiles=await d.profiles().catch(()=>undefined);return res.json({ok:true,cases:Object.values((await d.read()).cases).filter(c=>c.projectId===scope&&c.profileId===profileId).sort((a,b)=>b.updatedAt-a.updatedAt).map(c=>developerCaseView(withSupportStaffAvatars(c,profiles)))})}
  if(req.body?.action!=='message')return res.status(400).json({ok:false,error:'Choose a supported action.'})
  const optionId=typeof req.body.optionId==='string'?req.body.optionId:'';const selected=optionId?developerSupportOption(optionId):undefined;if(optionId&&!selected)return res.status(400).json({ok:false,error:'Choose an available support option.'});const files=await d.attachments(req.body.attachments,{uploaderId:owner.ownerId,projectId:scope});const draft=typeof req.body.message==='string'?req.body.message.trim():'';const message=selected?(optionId==='human'&&draft?draft:selected.label):(draft||(files.length?'Shared '+files.length+' file'+(files.length===1?'':'s')+'.':''));let saved:DeveloperCase|undefined
  if(!message.trim()||message.length>1500||typeof req.body.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(req.body.requestId))return res.status(400).json({ok:false,error:'Enter a message of up to 1,500 characters.'})
  await d.mutate(store=>{
   const cases=Object.fromEntries(Object.entries(store.cases).filter(([,c])=>c.projectId===scope&&c.profileId===profileId));
   const previous=req.body.caseId?cases[req.body.caseId]:req.body.newConversation===true?undefined:Object.values(cases).sort((a,b)=>b.updatedAt-a.updatedAt).find(c=>c.status!=='resolved')
   const duplicate=Object.values(cases).find(c=>c.messages.some(m=>m.requestId===req.body.requestId))
   if(duplicate){saved=duplicate;return store}
   if(selected&&previous?.humanSupport)throw Object.assign(Error('Our team already has this conversation. Send your message here.'),{status:409})
   if(selected&&!['human','topics'].includes(optionId)&&!(previous?.supportOptions||developerSupportTopics).some(o=>o.id===optionId))throw Object.assign(Error('These options changed. Refresh the conversation.'),{status:409})
   const step=selected?developerSupportSteps[optionId]:undefined
   const fallbackAnswer={text:step?.text||'Choose a topic below, or tap Talk to us for help from our team.',handoff:optionId==='human'}
   const timestamp=d.now()
   saved=submitSupportConversation(cases,{profileId,message,requestId:req.body.requestId,caseId:req.body.caseId,newConversation:req.body.newConversation===true},timestamp,d.uuid,{tenantId:'developer:'+projectId,entries:{},fallbackAnswer,handoffText:'Waiting for our team.',suppressAutomatedReply:!selected&&Boolean(previous?.menuPrompted)})
   const sent=saved.messages.find(m=>m.requestId===req.body.requestId);if(sent&&files.length)sent.attachments=files
   if(!saved.humanSupport){saved.supportOptions=step?.options||saved.supportOptions||developerSupportTopics;saved.menuPrompted=true;if(step){saved.supportStep=optionId;if(step.category)saved.category=step.category}}
   else saved.supportOptions=[]
   if(optionId==='resolved'){saved.status='resolved';saved.resolvedAt=timestamp;saved.supportOptions=[];const last=saved.messages[saved.messages.length-1];if(last?.author==='agent')last.kind='automatic_resolution'}
   saved.projectId=scope;saved.workspaceId=projectId?d.workspace(projectId):'builders';saved.customer={fullName:owner.name,email:owner.email};store.cases[saved.id]=saved;return store
  });return res.json({ok:true,case:developerCaseView(saved!)})
 }catch(e){const status=(e as {status?:number}).status||503;return res.status(status).json({ok:false,error:status<500?(e as Error).message:'Support is temporarily unavailable. Please try again.'})}
}}
export default createDeveloperSupportHandler()
