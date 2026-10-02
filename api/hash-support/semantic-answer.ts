import {pocketSupportAnswer,pocketSupportFaqs,requestsPocketHuman} from '../../src/pocket/lib/pocketSupportContent.js'
import {findApprovedKnowledge,type KnowledgeStore} from './knowledge.js'
export type SupportKnowledgeMatch={source:'faq';index:number;question:string}|{source:'knowledge';id:string;version:number}
export function resolveSupportMatch(match:SupportKnowledgeMatch|undefined,entries:KnowledgeStore,tenantId:string,now:number){
 if(!match)return undefined
 if(match.source==='faq'){
  const faq=pocketSupportFaqs[match.index]
  return faq&&faq.question===match.question?{answer:faq.answer,id:'pocket-faq-'+match.index,version:1}:undefined
 }
 const entry=entries[match.id]
 return entry&&entry.tenantId===tenantId&&entry.status==='approved'&&!!entry.reviewedBy&&(entry.expiresAt||0)>now&&entry.version===match.version?{answer:entry.answer,id:entry.id,version:entry.version}:undefined
}
export async function matchSupportQuestion(input:{profileId:string;message:string;requestId:string;caseId?:string;cases:Record<string,any>;entries:KnowledgeStore;tenantId:string;privateValues?:string[]}):Promise<SupportKnowledgeMatch|undefined>{
 if(process.env.HASH_SUPPORT_AI_ENABLED!=='true'||!input.profileId||! /^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)||input.message.length>320)return
 if(requestsPocketHuman(input.message)||!pocketSupportAnswer(input.message).handoff||findApprovedKnowledge(input.entries,input.tenantId,input.message,Date.now()))return
 if(input.privateValues?.some(v=>v.trim().length>=4&&input.message.toLowerCase().includes(v.trim().toLowerCase())))return
 // Requests containing transaction identifiers, credentials or particular payment problems never reach inference.
 if(/[\d@]|https?:|0x/i.test(input.message)||/\b(failed|failing|missing|stuck|deducted|debited|not received|not delivered|not arrived|status|charged|scam|stolen|unauthori[sz]ed|bvn|nin|passport|password|otp|private key|recovery phrase)\b/i.test(input.message))return
 if(/\b(my|our|did|happened|went|ago|yesterday|today|earlier|already|yet|and|also|plus|or|check|investigate|trace|track|confirm|reverse|cancel|approve|release)\b/i.test(input.message)||/\b(my|our)\s+(money|funds|payments?|transfers?|deposits?|refunds?|verification|account|balance|transactions?)\b/i.test(input.message))return
 const mine=Object.values(input.cases).filter(c=>c.profileId===input.profileId).sort((a,b)=>b.updatedAt-a.updatedAt)
 const current=input.caseId?input.cases[input.caseId]:mine.find(c=>c.status!=='resolved')
 if(input.caseId&&(!current||current.profileId!==input.profileId))return
 if(current&&(current.status==='resolved'||current.humanSupport!==false||current.assignedTo||current.messages.some((m:any)=>m.author==='staff')))return
 if(mine.some(c=>c.messages.some((m:any)=>m.requestId===input.requestId)))return
 const refs=new Map<string,SupportKnowledgeMatch>()
 const candidates:Array<{id:string;question:string}>=[]
 for(const [index,faq]of pocketSupportFaqs.entries()){
  const id='faq_'+index;refs.set(id,{source:'faq',index,question:faq.question});candidates.push({id,question:faq.question})
 }
 for(const item of Object.values(input.entries).filter(k=>k.tenantId===input.tenantId&&k.status==='approved'&&!!k.reviewedBy&&(k.expiresAt||0)>Date.now()).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,20-candidates.length)){
  const id='knowledge_'+candidates.length;refs.set(id,{source:'knowledge',id:item.id,version:item.version});candidates.push({id,question:item.question})
 }
 try{
  const url=new URL(process.env.HASH_SUPPORT_URL||'')
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!process.env.HASH_SUPPORT_API_KEY)return
  const response=await fetch(new URL('/v1/knowledge-match',url),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+process.env.HASH_SUPPORT_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({customerId:input.profileId,requestId:input.requestId,question:input.message,candidates}),signal:AbortSignal.timeout(10000)})
  if(!response.ok)return
  const result=await response.json()
  return result.ok&&typeof result.selectedId==='string'?refs.get(result.selectedId):undefined
 }catch{return undefined}
}
