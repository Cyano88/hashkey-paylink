import type { PocketActivityRow } from '../../src/pocket/models/pocketActivity.js'
import { requestsPocketHuman } from '../../src/pocket/lib/pocketSupportContent.js'
import { pocketReceiptKind } from '../../src/pocket/lib/pocketReceipt.js'
export type SupportAccountContext = {kind:'profile'|'payment'|'clarify';transaction?:{eventId:string;chain:string;txHash:string};readAt:number}
export type SupportAccountAnswer = {text:string;handoff:false;accountContext:SupportAccountContext;receipt?:{eventId:string}}
type Case = {profileId:string;status:string;humanSupport?:boolean;assignedTo?:string;updatedAt:number;messages:Array<{author:string;createdAt?:number;requestId?:string;accountContext?:SupportAccountContext}>}
type Input = {identity:{kind:string;subject:string};profileId:string;question:string;requestId:string;caseId?:string;newConversation?:boolean;cases:Record<string,Case>}
type Dependencies = {profile:(owner:string)=>Promise<{resolvedName?:string;firstName?:string;lastName?:string}|undefined>;payments:(owner:string)=>Promise<PocketActivityRow[]>;now?:()=>number}
export async function supportAccountAnswer(input:Input,deps:Dependencies):Promise<SupportAccountAnswer|undefined>{
 if(input.identity.kind!=='privy'||!input.identity.subject||!input.question.trim()||input.question.length>1500||! /^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)||requestsPocketHuman(input.question))return
 const mine=Object.values(input.cases).filter(c=>c.profileId===input.profileId)
 const current=input.caseId?input.cases[input.caseId]:input.newConversation?undefined:mine.sort((a,b)=>b.updatedAt-a.updatedAt).find(c=>c.status!=='resolved')
 if(input.caseId&&(!current||current.profileId!==input.profileId))return
 if(current&&(current.status==='resolved'||current.humanSupport!==false||current.assignedTo||current.messages.some(m=>m.author==='staff')))return
 if(mine.some(c=>c.messages.some(m=>m.requestId===input.requestId)))return
 const q=input.question.trim().toLowerCase().replace(/[\u2018\u2019]/g,"'")
 const name=/^(?:(?:what(?: is|'s| are)|show me|tell me) my (?:full+ |first |last )?name(?:s|'s)?|where (?:can i|do i) (?:find|see|view) my (?:full+ |first |last )?name(?:s|'s)?)[?.! ]*$/.test(q)
 const prior=current?.messages.slice().reverse().find(m=>m.author==='agent'&&m.accountContext)?.accountContext
 const follow=!!prior && /^(?:(?:and )?(?:what(?: is|'s| about)|which|show|view|open|check|how about) (?:the |its |that |this )?(?:status|chain|network|receipt)(?: of (?:it|that|this payment))?|(?:is|was) (?:it|that|this payment) (?:successful|completed|delivered)|yes)[?.! ]*$/.test(q)
 const payment=/\b(my|the|last|latest|recent)\b/.test(q)&&/\b(payment|transfer|transaction|airtime|bill|pay|paid)\b/.test(q)&&/\b(chain|network|status|receipt|last|latest|recent)\b/.test(q)
 if(!name&&!follow&&!payment)return
 const readAt=deps.now?.()??Date.now()
 if(mine.flatMap(c=>c.messages).filter(m=>m.author==='user'&&readAt-(m.createdAt||0)<60000).length>=10)return
 const answer=(text:string,kind:SupportAccountContext['kind']='payment',row?:PocketActivityRow):SupportAccountAnswer=>({text,handoff:false,accountContext:{kind,readAt,...(row?{transaction:{eventId:row.eventId,chain:row.chain,txHash:row.txHash}}:{})},...(row?{receipt:{eventId:row.eventId}}:{})})
 if(/\b(and|also|plus|but|ignore|instructions?|prompt|system|someone|another|their|his|her|send|refund|reverse|cancel|approve)\b/.test(q)&&!follow)return
 try{
  if(name){const profile=await deps.profile(input.identity.subject);const value=(profile?.resolvedName||[profile?.firstName,profile?.lastName].filter(Boolean).join(' ')).trim();return answer(value?'Your profile name is '+value+'.':'Your profile does not have a full name saved yet. You can add it in Profile.','profile')}
  if(/\b(xstocks?|stocks?|xlayer|x layer)\b/.test(q))return answer('This lookup covers Stablecoins payments. Open XStocks Activity for your stock transactions.','clarify')
  if(/[\d@]|https?:|0x/.test(q)||/\b(to|for|yesterday|today|ago|before|after|between)\b/.test(q))return answer('Please open the specific payment in Activity and use Report a problem to attach it. I cannot safely identify it from those details alone.','clarify')
  const latest=/\b(last|latest|recent)\b/.test(q)||(q.replace(/[?.! ]/g,'')==='yes'&&prior?.kind==='clarify')
  if(!latest&&!prior?.transaction)return answer('Do you mean your latest Stablecoins payment?','clarify')
  const rows=(await deps.payments(input.identity.subject)).filter(row=>row.direction==='out'&&!row.fundingOnly&&!row.fundingParent&&pocketReceiptKind(row)&&Number.isFinite(row.ts)&&row.ts>0)
  const bank=/\bbank\b/.test(q),bills=/\b(bill|airtime|electricity|data|tv)\b/.test(q)
  const wanted=q.match(/\b(?:last|latest|recent) (successful|completed|failed|pending) (?:payment|transfer|transaction)\b/)?.[1]
  const candidates=rows.filter(row=>(!bank||row.source?.replace(/_/g,'-').startsWith('bank-'))&&(!bills||row.source==='bills')).filter(row=>{const state=row.bankSettlementStatus||row.paycrestStatus||'';return !wanted||(wanted==='successful'||wanted==='completed'?['settled','successful','completed','confirmed','delivered','paid'].includes(state):state===wanted)}).sort((a,b)=>b.ts-a.ts)
  const row=latest?candidates[0]:candidates.find(row=>row.eventId===prior!.transaction!.eventId&&row.chain===prior!.transaction!.chain&&row.txHash===prior!.transaction!.txHash)
  if(!row)return answer(latest?'I could not find a matching outgoing payment in your saved Stablecoins activity. Open Activity to refresh it, then ask again.':'That payment is not available in your saved activity right now. Open Activity to check it.','clarify')
  if(latest&&candidates[1]?.ts===row.ts&&candidates[1].eventId!==row.eventId)return answer('There are multiple payments recorded at the same time. Open the one you mean in Activity and use Report a problem to attach it.','clarify')
  const chains:Record<string,string>={base:'Base',arbitrum:'Arbitrum',arc:'Arc',ethereum:'Ethereum',polygon:'Polygon',solana:'Solana'}
  const chain=chains[row.chain.toLowerCase()]||'an unrecognized network'
  const date=new Date(row.ts).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' UTC'
  const status=String(row.bankSettlementStatus||row.paycrestStatus||'status unavailable').toLowerCase()
  const known=new Set(['completed','confirmed','delivered','paid','refunded','reversed','settled','successful','failed','expired','pending','processing','bridging','submitted','deposited','fulfilling','fulfilled','settling','refund available','refunding','refund pending','needs review'])
  const recorded=known.has(status)?status:'not available'
  const localRail=row.source?.replace(/_/g,'-').startsWith('bank-')||row.source==='bills'
  const heading=/\b(chain|network)\b/.test(q)?'Your '+(latest?'latest saved ':'')+'Stablecoins payment used '+chain+'.':'Your '+(latest?'latest saved ':'')+'Stablecoins payment was on '+chain+'.'
  const label=localRail?(row.source==='bills'?'Bill delivery':'Bank payout'):'Payment'
  return answer(heading+'\n'+date+'\n'+label+' status on record: '+recorded+'.', 'payment', row)
 }catch{return answer('I could not read your account records right now. Please try again shortly.','clarify')}
}
