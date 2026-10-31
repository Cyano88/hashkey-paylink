import type {Request,Response} from 'express'
import {randomUUID} from 'node:crypto'
import {verifyOperationsIdentity} from './operations-access.js'
import {authorizeOperations,isOperationsFounder,operationsPolicy,operationsRequestPolicy} from './operations-policy.js'
import {readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {readSupportJson,mutateSupportJson} from './hash-support/pocket-storage.js'
import {readReceiptCheckout} from './checkout-receipts.js'

export type CaseReview={destination:'compliance'|'legal';status:'pending'|'reviewed';reason:string;requestedBy:string;requestedAt:number;decision?:string;reviewedBy?:string;reviewedAt?:number}
export type CaseEvent={destination?:'compliance'|'legal';id:string;action:string;actor:string;at:number;text:string}
export type OperationsCase={profileId?:string;humanSupport?:boolean;priority?:'normal'|'high';customer?:{fullName:string;email:string};waitingSince?:number;reminderSentAt?:number;resolutionRequestedAt?:number;resolutionPromptId?:string;supportEscalatedAt?:number;id:string;workspaceId?:string;projectId?:string;checkoutId?:string;orderReference?:string;summary:string;category?:string;status:string;assignedTo?:string;messages?:Array<{id:string;author:string;text:string;createdAt:number}>;transaction?:Record<string,unknown>;reference?:string;proof?:unknown;evidence?:string[];escalation?:CaseReview;caseHistory?:CaseEvent[];createdAt:number;updatedAt:number}
type Store={cases:Record<string,OperationsCase>;[key:string]:unknown}
export const BUSINESS_SUPPORT_KEY='hashpaylink:business-support:v1'
const pocketKey=()=>(process.env.POCKET_SUPPORT_STORE_KEY||'hashpaylink:pocket-support:v1').trim()
const defaults={verify:verifyOperationsIdentity,env:operationsRequestPolicy,now:Date.now,uuid:randomUUID,
 read:async(workspace:string)=>(workspace==='pocket'?await readSupportJson<Store>(pocketKey()):await readDurableJson<Store>(BUSINESS_SUPPORT_KEY))||{cases:{}},
 mutate:(workspace:string,fn:(s:Store)=>Store)=>workspace==='pocket'?mutateSupportJson<Store>(pocketKey(),s=>fn(s||{cases:{}})):mutateDurableJson<Store>(BUSINESS_SUPPORT_KEY,s=>fn(s||{cases:{}})),checkout:readReceiptCheckout}
function fail(message:string,status=400):never{throw Object.assign(Error(message),{status})}
const clean=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):''
function evidence(value:unknown){if(value===undefined)return [];if(!Array.isArray(value)||value.length>10)fail('Use up to 10 evidence links.');return value.map(v=>{const text=clean(v,2000);try{const u=new URL(text);if(u.protocol!=='https:'||u.username||u.password)throw Error();return text}catch{return fail('Evidence links must use HTTPS.')}})}
// Explicit projection keeps Pocket identity documents, internal profile identifiers and staff profiles out of this API.
export function caseView(c:OperationsCase){return {id:c.id,workspaceId:c.workspaceId,projectId:c.projectId,checkoutId:c.checkoutId,orderReference:c.orderReference,summary:c.summary,category:c.category,status:c.status,assignedTo:c.assignedTo,...(c.workspaceId&&c.workspaceId!=='pocket'&&c.customer?{customer:c.customer}:{}),messages:c.messages?.map(m=>({id:m.id,author:m.author,text:m.text,createdAt:m.createdAt})),transaction:c.transaction,reference:c.reference,proof:c.proof,evidence:c.evidence||[],escalation:c.escalation,caseHistory:c.caseHistory||[],createdAt:c.createdAt,updatedAt:c.updatedAt}}
export function createOperationsCasesHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','private, no-store')
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
   const identity=await d.verify(req),env=d.env(req),policy=operationsPolicy(env)
   const {workspaceId,projectIds}=authorizeOperations(identity,req,'cases',undefined,env)
   const owner=isOperationsFounder(identity,policy),roles=policy.grants.filter(g=>g.email.toLowerCase()===identity.email.toLowerCase()&&g.workspaceId===workspaceId).flatMap(g=>g.roles||[])
   const manage=owner||roles.some(r=>['support','administrator'].includes(r))
   const visible=(c:OperationsCase)=>c.humanSupport!==false&&(workspaceId==='pocket'||c.workspaceId===workspaceId&&projectIds.includes(c.projectId||''))&&(manage||Boolean(c.escalation&&roles.includes(c.escalation.destination)))
   if(req.method==='GET')return res.json({ok:true,cases:Object.values((await d.read(workspaceId)).cases).filter(visible).sort((a,b)=>b.updatedAt-a.updatedAt).map(caseView),permissions:{manage,review:owner?['compliance','legal']:roles.filter(r=>r==='compliance'||r==='legal')}})
   const action=clean(req.body?.action,40),now=d.now();let created:OperationsCase|undefined
   if(action==='case-create'){
    if(workspaceId==='pocket')fail('Open Pocket cases from the customer conversation.',409)
    const projectId=clean(req.body.projectId,100),checkoutId=clean(req.body.checkoutId,100),category=clean(req.body.category,40),summary=clean(req.body.summary,1000),orderReference=clean(req.body.orderReference,200)
    if(!projectIds.includes(projectId))fail('Choose a business in this workspace.',404)
    if(!['integration','checkout','settlement','purchase_complaint'].includes(category)||summary.length<10)fail('Choose a category and describe the issue.')
    if(category==='purchase_complaint'&&(!checkoutId||!orderReference))fail('Purchase complaints need an order reference and checkout ID.')
    let transaction:Record<string,unknown>|undefined
    if(checkoutId){const checkout=await d.checkout(checkoutId);if(!checkout||checkout.partnerId!==projectId)fail('Checkout does not belong to this business.',404);if(checkout.payment)transaction={network:checkout.payment.network||checkout.network,asset:checkout.asset||'USDC',amount:checkout.payment.amount,transactionHash:checkout.payment.txHash,status:checkout.payment.status,confirmedAt:checkout.payment.confirmedAt}}
    created={id:'case_'+d.uuid(),workspaceId,projectId,checkoutId:checkoutId||undefined,orderReference:orderReference||undefined,category,summary,transaction,status:'open',assignedTo:identity.email,messages:[],evidence:evidence(req.body.evidence),caseHistory:[],createdAt:now,updatedAt:now}
   }
   let saved:OperationsCase|undefined
   await d.mutate(workspaceId,s=>{
    const c=created||s.cases[clean(req.body?.caseId,100)]
    if(!c||!created&&!visible(c))fail('Case not found in this workspace.',404)
    if(!created&&Number(req.body.updatedAt)!==c.updatedAt)fail('This case changed. Refresh it before continuing.',409)
    const text=clean(req.body?.reason||req.body?.message,3000)
    if(c.status==='resolved'&&action!=='case-create')fail('This case is closed.',409)
    if(action==='case-escalate'){
     const destination=req.body.destination
     if(!['compliance','legal'].includes(destination)||text.length<10)fail('Choose a review team and enter a reason of at least 10 characters.')
     if(c.escalation?.status==='pending')fail('This case is already awaiting review.',409)
     c.escalation={destination,status:'pending',reason:text,requestedBy:identity.email,requestedAt:now}
    }else if(action==='case-review'){
     if(!c.escalation||c.escalation.status!=='pending')fail('This case is not awaiting review.',409)
     if(!owner&&!roles.includes(c.escalation.destination))fail('Only the assigned review team can record a decision.',403)
     if(text.length<10)fail('Record a decision of at least 10 characters.')
     c.escalation={...c.escalation,status:'reviewed',decision:text,reviewedBy:identity.email,reviewedAt:now}
     if(workspaceId==='pocket'){c.status=c.assignedTo?'assigned':'open';delete c.waitingSince;delete c.reminderSentAt;delete c.resolutionRequestedAt;delete c.resolutionPromptId;delete c.supportEscalatedAt}
    }else if(action==='case-reply'){
     if(workspaceId==='pocket')fail('Reply from the Pocket conversation.',409);if(!manage)fail('Support access required.',403);if(!text||text.length>1500)fail('Enter a reply of up to 1,500 characters.');c.messages=[...c.messages||[],{id:d.uuid(),author:'staff',text,createdAt:now}];c.humanSupport=true;c.status='waiting_user';c.assignedTo=c.assignedTo||identity.email
    }else if(action==='case-assign')c.assignedTo=identity.email
    else if(action==='case-note'){if(text.length<3)fail('Enter a case note.');c.evidence=[...c.evidence||[],...evidence(req.body.evidence)].slice(-30)}
    else if(action==='case-resolve'){
     if(workspaceId==='pocket')fail('Resolve Pocket cases in the customer conversation.',409)
     if(c.escalation?.status==='pending')fail('Wait for the review decision before resolving this case.',409)
     if(text.length<10)fail('Enter a resolution of at least 10 characters.');c.status='resolved'
    }else if(action!=='case-create')fail('Unknown case action.')
    c.caseHistory=[...c.caseHistory||[],{id:d.uuid(),action,...(['case-escalate','case-review'].includes(action)?{destination:c.escalation?.destination}:{}),actor:identity.email,at:now,text:action==='case-create'?c.summary:text}]
    c.updatedAt=Math.max(now,c.updatedAt+1);s.cases[c.id]=c;saved=caseView(c);return s
   })
   return res.json({ok:true,case:saved})
  }catch(e){const status=(e as {status?:number}).status||503;return res.status(status).json({ok:false,error:status<500?(e as Error).message:'Cases are temporarily unavailable. Try again.'})}
 }
}
export default createOperationsCasesHandler()
