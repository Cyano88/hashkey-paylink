import type {Request,Response} from 'express'
import {randomUUID} from 'node:crypto'
import {verifyDeveloperProjectOwner,verifyDeveloper} from './developer-projects.js'
import {readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {BUSINESS_SUPPORT_KEY,type OperationsCase} from './operations-cases.js'
import {submitSupportConversation,type Conversation} from './pocket/support-conversation.js'
export type DeveloperCase=OperationsCase&Conversation&{customer:{fullName:string;email:string}}
type Store={cases:Record<string,DeveloperCase>}
export function developerSupportAnswer(message:string){
 if(/\b(human|person|staff|agent|complain|dispute|refund|missing|failed|stuck)\b/i.test(message))return {text:'I’ll pass this to Business Support. Include your checkout or order reference and what happened so the team can investigate.',handoff:true}
 if(/\b(webhooks?|fulfil|fulfill|confirm)\b/i.test(message))return {text:'Verify the signed webhook on your server and confirm the payment status before fulfilling an order. A return URL alone is not proof of payment. See Docs / Confirm payments. Would you like Business Support to help with your integration?',handoff:false}
 if(/\b(sandbox|test|integrat|api|start)\b/i.test(message))return {text:'Start in Sandbox in the developer portal. Open your app’s integration guide, keep API keys on your server, and test checkout plus payment confirmation before using Production. What part are you working on?',handoff:false}
 if(/\b(receipt|email)\b/i.test(message))return {text:'Check your app’s receipt and support settings in the developer portal. For a missing receipt, share the checkout reference with Business Support. Please don’t paste credentials or sign-in codes here.',handoff:false}
 if(/\b(card|subscription|recurring|escrow)\b/i.test(message))return {text:'Card checkout, automatic recurring subscriptions and the general Escrow service are not available in this release. Use the currently enabled payment methods shown in your app’s settings.',handoff:false}
 return {text:'I’ll pass this to Business Support so the team can help with your app. Describe the issue and include an order or checkout reference if it concerns a payment.',handoff:true}
}
const defaults={identity:verifyDeveloper,owner:verifyDeveloperProjectOwner,now:Date.now,uuid:randomUUID,workspace:(projectId:string)=>{const rows=JSON.parse(process.env.OPERATIONS_WORKSPACES_JSON||'[]') as Array<{id:string;projectIds:string[]}>;return rows.find(w=>w.projectIds.includes(projectId))?.id||projectId},read:async()=>await readDurableJson<Store>(BUSINESS_SUPPORT_KEY)||{cases:{}},mutate:(fn:(s:Store)=>Store)=>mutateDurableJson<Store>(BUSINESS_SUPPORT_KEY,s=>fn(s||{cases:{}}))}
// Customer projection deliberately excludes profile IDs, staff emails, evidence, internal notes and review decisions.
export function developerCaseView(c:DeveloperCase){return {id:c.id,projectId:c.projectId,summary:c.summary,status:c.status,humanSupport:c.humanSupport,updatedAt:c.updatedAt,messages:c.messages.map(m=>({id:m.id,author:m.author,text:m.text,createdAt:m.createdAt}))}}
export function createDeveloperSupportHandler(overrides:Partial<typeof defaults>={}){const d={...defaults,...overrides};return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','private, no-store')
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
  const projectId=String(req.method==='GET'?req.query.projectId||'':req.body?.projectId||'');const owner=projectId?await d.owner(req,projectId):await d.identity(req).then(i=>({ownerId:i.userId,email:i.email,name:i.email}));const scope=projectId||undefined;const profileId=owner.ownerId+':'+(projectId||'account')
  if(req.method==='GET')return res.json({ok:true,cases:Object.values((await d.read()).cases).filter(c=>c.projectId===scope&&c.profileId===profileId).sort((a,b)=>b.updatedAt-a.updatedAt).map(developerCaseView)})
  if(req.body?.action!=='message')return res.status(400).json({ok:false,error:'Choose a supported action.'})
  const message=typeof req.body.message==='string'?req.body.message.trim():'';let saved:DeveloperCase|undefined
  await d.mutate(store=>{
   const cases=Object.fromEntries(Object.entries(store.cases).filter(([,c])=>c.projectId===scope&&c.profileId===profileId));
   saved=submitSupportConversation(cases,{profileId,message,requestId:req.body.requestId,caseId:req.body.caseId,newConversation:req.body.newConversation===true},d.now(),d.uuid,{tenantId:'developer:'+projectId,entries:{},fallbackAnswer:developerSupportAnswer(message),handoffText:'You are in the queue for Business Support.'})
   saved.projectId=scope;saved.workspaceId=projectId?d.workspace(projectId):'builders';saved.customer={fullName:owner.name,email:owner.email};store.cases[saved.id]=saved;return store
  });return res.json({ok:true,case:developerCaseView(saved!)})
 }catch(e){const status=(e as {status?:number}).status||503;return res.status(status).json({ok:false,error:status<500?(e as Error).message:'Support is temporarily unavailable. Please try again.'})}
}}
export default createDeveloperSupportHandler()
