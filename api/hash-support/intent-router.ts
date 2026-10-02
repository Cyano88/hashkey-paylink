import {allowedIntentCandidates,safeIntentQuestion} from './intent-policy.mjs'
import {requestsPocketHuman} from '../../src/pocket/lib/pocketSupportContent.js'
export async function routeSupportIntent(input:{message:string;profileId:string;requestId:string;caseId?:string;newConversation?:boolean;cases:Record<string,any>;privateValues?:string[]}){
 if(process.env.HASH_SUPPORT_AI_ENABLED!=='true'||requestsPocketHuman(input.message)||! /^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId))return
 if(input.privateValues?.some(value=>value.trim().length>=3&&input.message.toLowerCase().includes(value.trim().toLowerCase())))return
 const mine=Object.values(input.cases).filter(item=>item.profileId===input.profileId)
 const current=input.caseId?input.cases[input.caseId]:input.newConversation?undefined:mine.sort((a,b)=>b.updatedAt-a.updatedAt).find(item=>item.status!=='resolved')
 if(input.caseId&&(!current||current.profileId!==input.profileId))return
 if(current&&(current.status==='resolved'||current.humanSupport!==false||current.assignedTo||current.messages.some((m:any)=>m.author==='staff')))return
 if(mine.some(item=>item.messages.some((m:any)=>m.requestId===input.requestId)))return
 if(mine.flatMap(item=>item.messages).filter((m:any)=>m.author==='user'&&Date.now()-m.createdAt<60000).length>=10)return
 const hasPayment=Boolean(current?.messages.slice().reverse().find((m:any)=>m.author==='agent'&&m.accountContext)?.accountContext?.transaction)
 if(!hasPayment&&!/\b(my|latest|last|recent|profile)\b/i.test(input.message))return
 const question=safeIntentQuestion(input.message);if(!question)return
 try{
  const url=new URL(process.env.HASH_SUPPORT_URL||'');if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash||!process.env.HASH_SUPPORT_API_KEY)return
  const response=await fetch(new URL('/v1/support-intent',url),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+process.env.HASH_SUPPORT_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({customerId:input.profileId,requestId:input.requestId,question,hasPayment}),signal:AbortSignal.timeout(10000)})
  if(!response.ok)return
  const data=await response.json();if(data.ok&&allowedIntentCandidates(question,hasPayment).some(item=>item.id===data.selectedId)&&(data.selectedId!=='selected_payment'||hasPayment))return data.selectedId as 'latest_payment'|'latest_gift'|'selected_payment'|'name'|'payments'
 }catch{}
}
