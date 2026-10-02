/** Business-scoped, reviewed support knowledge. No transcript ingestion or external storage. */
export type HashKnowledge = {
 id:string; tenantId:string; question:string; answer:string; sourceCaseId:string;
 status:'draft'|'approved'|'retired'; version:number; createdBy:string; createdAt:number;
 updatedAt:number; retiredBy?:string; retiredAt?:number; reviewedBy?:string; reviewedAt?:number; expiresAt?:number
}
export type KnowledgeStore = Record<string,HashKnowledge>
export const POCKET_SUPPORT_TENANT = 'pocket'
const REVIEW_VALIDITY = 90 * 24 * 60 * 60 * 1000
const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status})}
export const knowledgeQuestion=(text:string)=>text.trim().toLowerCase().replace(/\s+/g,' ').replace(/[?.!]+$/,'')
function text(value:unknown,max:number,label:string){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${label} must contain 1 to ${max} characters.`);return (value as string).trim()}
export function validateKnowledge(question:unknown,answer:unknown,privateValues:string[]=[]){
 const q=text(question,180,'Question'),a=text(answer,1500,'Answer'),combined=q+'\n'+a
 // A conservative screen, not a claim of complete anonymisation. Staff review is required.
 if(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b|\b0x[a-f\d]{16,}\b|\b\d[\d ()+-]{7,}\d\b|\b(?:sk-|pk_live_|Bearer\s+)[a-z\d_-]+/i.test(combined))fail('Remove personal details, account numbers, wallet addresses and credentials.')
 if(privateValues.filter(v=>v.trim().length>=4).some(v=>combined.toLowerCase().includes(v.trim().toLowerCase())))fail('Remove details belonging to the customer or transaction.')
 if(/\byour\s+(?:payment|transfer|deposit|refund|transaction|verification)\s+(?:is|was|has|succeeded|failed|completed|arrived|passed)\b/i.test(a))fail('Save general guidance only. Individual payment and verification status must be checked live.')
 return {question:q,answer:a}
}
export function createKnowledge(store:KnowledgeStore,input:{tenantId:string;actorId:string;id:string;sourceCaseId:string;question:unknown;answer:unknown;privateValues?:string[]},now:number){
 if(!input.tenantId||!input.actorId||!input.id||!input.sourceCaseId)fail('Verified business, staff and source case are required.',403)
 if(store[input.id])fail('This draft already exists.',409)
 const content=validateKnowledge(input.question,input.answer,input.privateValues)
 const item:HashKnowledge={...content,id:input.id,tenantId:input.tenantId,sourceCaseId:input.sourceCaseId,status:'draft',version:1,createdBy:input.actorId,createdAt:now,updatedAt:now}
 store[item.id]=item;return item
}
export function reviewKnowledge(store:KnowledgeStore,input:{tenantId:string;actorId:string;id:string;version:number;action:'approve'|'retire';reviewConfirmed?:boolean},now:number){
 if(!input.tenantId||!input.actorId)fail('Verified business and staff are required.',403)
 const item=store[input.id];if(!item||item.tenantId!==input.tenantId)fail('Knowledge entry not found.',404)
 if(item.version!==input.version)fail('This entry changed. Refresh before reviewing it.',409)
 if(input.action==='approve'){
  if(item.status!=='draft')fail('Only a draft can be approved.',409)
  if(!input.reviewConfirmed)fail('Confirm that this answer is accurate, general and contains no customer details.')
  validateKnowledge(item.question,item.answer)
  if(Object.values(store).some(other=>other.tenantId===input.tenantId&&other.status==='approved'&&(other.expiresAt||0)>now&&knowledgeQuestion(other.question)===knowledgeQuestion(item.question)))fail('An approved answer already exists. Withdraw it before publishing a replacement.',409)
  item.status='approved';item.reviewedBy=input.actorId;item.reviewedAt=now;item.expiresAt=now+REVIEW_VALIDITY
 }else if(input.action==='retire'){item.status='retired';item.retiredBy=input.actorId;item.retiredAt=now}
 else fail('Unknown knowledge action.')
 item.version++;item.updatedAt=now;return item
}
export function findApprovedKnowledge(store:KnowledgeStore,tenantId:string,message:string,now:number):HashKnowledge|undefined{
 if(!tenantId)return undefined
 // A remembered answer must never establish a current account or payment state.
 if(/\b(my|mine|missing|deducted|debited|stuck|not received|not arrived|not delivered|refund status|payment status|transaction status)\b/i.test(message))return undefined
 const question=knowledgeQuestion(message)
 return Object.values(store).find(item=>item.tenantId===tenantId&&item.status==='approved'&&!!item.reviewedBy&&(item.expiresAt||0)>now&&knowledgeQuestion(item.question)===question)
}
