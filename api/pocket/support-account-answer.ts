import {supportPaymentLabel,supportPaymentAmount} from './support-payment-format.js'
import {supportInvestigationAnswer,type SupportInvestigation} from './support-investigation.js'
import type {SupportChainFinding} from './support-investigation-chain.js'
import {supportOptions,type SupportOption} from '../../src/pocket/lib/pocketSupportActions.js'
import type { PocketActivityRow } from '../../src/pocket/models/pocketActivity.js'
import { requestsPocketHuman } from '../../src/pocket/lib/pocketSupportContent.js'
import { pocketReceiptKind } from '../../src/pocket/lib/pocketReceipt.js'
export type SupportAccountContext = {kind:'profile'|'payment'|'clarify'|'investigation';investigation?:SupportInvestigation;transaction?:{eventId:string;chain:string;txHash:string};readAt:number;providerCheckedAt?:number}
export type SupportAccountAnswer = {options?:SupportOption[];text:string;handoff:boolean;accountContext:SupportAccountContext;receipt?:{eventId:string}}
type Case = {profileId:string;status:string;humanSupport?:boolean;assignedTo?:string;updatedAt:number;messages:Array<{author:string;createdAt?:number;requestId?:string;accountContext?:SupportAccountContext;options?:SupportOption[]}>}
type Input = {identity:{kind:string;subject:string};profileId:string;selectedEventId?:string;question:string;requestId:string;caseId?:string;newConversation?:boolean;cases:Record<string,Case>}
type Dependencies = {profile:(owner:string)=>Promise<{resolvedName?:string;firstName?:string;lastName?:string}|undefined>;payments:(owner:string)=>Promise<PocketActivityRow[]>;payoutStatus?:(row:PocketActivityRow)=>Promise<{status:string;checkedAt:number}>;now?:()=>number;chainCheck?:(owner:string,network:string,hash:string)=>Promise<SupportChainFinding>}
export async function supportAccountAnswer(input:Input,deps:Dependencies):Promise<SupportAccountAnswer|undefined>{
 if(input.identity.kind!=='privy'||!input.identity.subject||!input.question.trim()||input.question.length>1500||! /^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)||requestsPocketHuman(input.question))return
 const mine=Object.values(input.cases).filter(c=>c.profileId===input.profileId)
 const current=input.caseId?input.cases[input.caseId]:input.newConversation?undefined:mine.sort((a,b)=>b.updatedAt-a.updatedAt).find(c=>c.status!=='resolved')
 if(input.caseId&&(!current||current.profileId!==input.profileId))return
 if(current&&(current.status==='resolved'||current.humanSupport!==false||current.assignedTo||current.messages.some(m=>m.author==='staff')))return
 if(mine.some(c=>c.messages.some(m=>m.requestId===input.requestId)))return
 let q=input.question.trim().toLowerCase().replace(/[\u2018\u2019]/g,"'")
 q=q.replace(/\bit's(?=\s+(?:status|chain|network|receipt)\b)/g,'its')
 const name=/^(?:(?:what(?: is|'s| are)|show me|tell me) my (?:full+ |first |last )?name(?:s|'s)?|where (?:can i|do i) (?:find|see|view) my (?:full+ |first |last )?name(?:s|'s)?)[?.! ]*$/.test(q)
 const prior=current?.messages.slice().reverse().find(m=>m.author==='agent'&&m.accountContext)?.accountContext
 if(mine.flatMap(c=>c.messages).filter(m=>m.author==='user'&&(deps.now?.()??Date.now())-(m.createdAt||0)<60000).length>=10)return
 const investigation=await supportInvestigationAnswer({question:input.question,owner:input.identity.subject,prior:prior?.investigation,selectedEventId:input.selectedEventId,offered:current?.messages.slice().reverse().find(m=>m.author==='agent')?.options,now:deps.now?.()??Date.now()},{...deps,chainCheck:async(...args)=>{const checks=new Set(mine.flatMap(c=>c.messages).map(m=>m.accountContext?.investigation?.checkedAt).filter((at):at is number=>!!at&&(deps.now?.()??Date.now())-at<3600000));return checks.size>=3?{status:'unavailable',text:'The live-check limit has been reached for this hour. Your reference is saved; Pocket Support can continue the investigation.'}:deps.chainCheck?deps.chainCheck(...args):{status:'unavailable',text:'A live network check is not available here. Pocket Support can investigate with your reference.'}}})
 if(investigation)return investigation
 const follow=!!prior && /^(?:(?:and )?(?:what(?: is|'s| was| about)|which|show|view|open|check|how about) (?:the |its |that |this )?(?:status|chain|network|receipt)(?: of (?:it|that|this payment))?|(?:is|was) (?:it|that|this payment) (?:successful|completed|delivered)|yes)[?.! ]*$/.test(q)
 const payment=/\b(my|the|last|latest|recent)\b/.test(q)&&/\b(payment|transfer|transaction|airtime|bill|gift|pay|paid)\b/.test(q)&&/\b(chain|network|status|receipt|last|latest|recent)\b/.test(q)
 const list=/^(show my (?:recent|incoming|outgoing) payments|check a payment)$/i.test(q)
 const incoming=/incoming/.test(q)
 if(list&&!/incoming|outgoing/.test(q))return {text:'Which payments would you like to check?',handoff:false,options:supportOptions(['incoming','outgoing','missing_payment','human']),accountContext:{kind:'clarify',readAt:deps.now?.()??Date.now()}}
 const selection=!!input.selectedEventId
 if(!name&&!follow&&!payment&&!list&&!selection)return
 const readAt=deps.now?.()??Date.now()
 if(mine.flatMap(c=>c.messages).filter(m=>m.author==='user'&&readAt-(m.createdAt||0)<60000).length>=10)return
 const answer=(text:string,kind:SupportAccountContext['kind']='payment',row?:PocketActivityRow):SupportAccountAnswer=>({text,handoff:false,accountContext:{kind,readAt,...(row?{transaction:{eventId:row.eventId,chain:row.chain,txHash:row.txHash}}:{})},...(row?{receipt:{eventId:row.eventId}}:{})})
 if(/\b(ignore|instructions?|prompt|system|someone|another|their|his|her|send|refund|reverse|cancel|approve)\b/.test(q))return
 // Read-only details about the same payment share one owned lookup.
 const clauses=q.split(/\b(?:(?:and\s+)?also|and|plus|but)\b/).map(part=>part.trim())
 const paymentDetail=/^(?:(?:what(?: is|'s| was)|which|show|view|open|check)\s+)?(?:(?:the|its|that|this|my)\s+)?(?:status|chain|network|receipt)(?:\s+of\s+(?:it|that|this payment|my last payment))?[?.! ]*$/
 if(clauses.length>1&&!follow&&(!payment||!clauses.slice(1).every(part=>paymentDetail.test(part))))return answer('I can check the network, recorded status and receipt for one payment. Which payment would you like me to check?','clarify')
 try{
  if(name){const profile=await deps.profile(input.identity.subject);const value=(profile?.resolvedName||[profile?.firstName,profile?.lastName].filter(Boolean).join(' ')).trim();return answer(value?'Your profile name is '+value+'.':'Your profile does not have a full name saved yet. You can add it in Profile.','profile')}
  if(/\b(xstocks?|stocks?|xlayer|x layer)\b/.test(q))return answer('This lookup covers Stablecoins payments. Open XStocks Activity for your stock transactions.','clarify')
  if(/[\d@]|https?:|0x/.test(q)||/\b(to|for|yesterday|today|ago|before|after|between)\b/.test(q))return answer('Please open the specific payment in Activity and use Report a problem to attach it. I cannot safely identify it from those details alone.','clarify')
  const latest=/\b(last|latest|recent)\b/.test(q)||(q.replace(/[?.! ]/g,'')==='yes'&&prior?.kind==='clarify')
  if(!list&&!selection&&!latest&&!prior?.transaction)return answer('Do you mean your latest Stablecoins payment?','clarify')
  const rows=(await deps.payments(input.identity.subject)).filter(row=>(selection||(!list&&!latest&&!!prior?.transaction)||row.direction===(incoming?'in':'out'))&&!row.fundingOnly&&!row.fundingParent&&pocketReceiptKind(row)&&Number.isFinite(row.ts)&&row.ts>0)
  const bank=/\bbank\b/.test(q),bills=/\b(bill|airtime|electricity|data|tv)\b/.test(q)
  const wanted=q.match(/\b(?:last|latest|recent) (successful|completed|failed|pending) (?:payment|transfer|transaction)\b/)?.[1]
  const gift=/\bgift\b/.test(q)
  const candidates=rows.filter(row=>(!gift||row.source==='gift')).filter(row=>(!bank||row.source?.replace(/_/g,'-').startsWith('bank-'))&&(!bills||row.source==='bills')).filter(row=>{const state=row.bankSettlementStatus||row.paycrestStatus||'';return !wanted||(wanted==='successful'||wanted==='completed'?['settled','successful','completed','confirmed','delivered','paid'].includes(state):state===wanted)}).sort((a,b)=>b.ts-a.ts)
  if(list)return {...answer(candidates.length?'Choose a'+(incoming?'n incoming':'n outgoing')+' payment to check.':'No '+(incoming?'incoming':'outgoing')+' payments are saved yet. Open Activity to refresh your records.','clarify'),options:[...candidates.slice(0,5).map(row=>({id:'payment_details' as const,eventId:row.eventId,label:supportPaymentLabel(row)+' · '+new Date(row.ts).toLocaleDateString('en-GB',{timeZone:'UTC'})})),...supportOptions(['human'])]}
  if(selection&&!current?.messages.slice().reverse().find(m=>m.author==='agent')?.options?.some(option=>option.id==='payment_details'&&option.eventId===input.selectedEventId))return answer('Choose a payment from the list first.','clarify')
  const row=selection?candidates.find(row=>row.eventId===input.selectedEventId):latest?candidates[0]:candidates.find(row=>row.eventId===prior!.transaction!.eventId&&row.chain===prior!.transaction!.chain&&row.txHash===prior!.transaction!.txHash)
  if(!row)return answer(latest?'I could not find a matching outgoing payment in your saved Stablecoins activity. Open Activity to refresh it, then ask again.':'That payment is not available in your saved activity right now. Open Activity to check it.','clarify')
  if(!selection&&latest&&candidates[1]?.ts===row.ts&&candidates[1].eventId!==row.eventId)return answer('There are multiple payments recorded at the same time. Open the one you mean in Activity and use Report a problem to attach it.','clarify')
  const chains:Record<string,string>={base:'Base',arbitrum:'Arbitrum',arc:'Arc',ethereum:'Ethereum',polygon:'Polygon',solana:'Solana'}
  const chain=chains[row.chain.toLowerCase()]||'an unrecognized network'
  const date=new Date(row.ts).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' UTC'
  const status=String(row.bankSettlementStatus||row.paycrestStatus||'status unavailable').toLowerCase()
  const known=new Set(['completed','confirmed','delivered','paid','refunded','reversed','settled','successful','failed','expired','pending','processing','bridging','submitted','deposited','fulfilling','fulfilled','settling','refund available','refunding','refund pending','needs review'])
  const recorded=known.has(status)?status:'not available'
  const localRail=row.source?.replace(/_/g,'-').startsWith('bank-')||row.source==='bills'
  const subject=row.source==='gift'?'gift funding':row.direction==='in'?'incoming USDC transfer':'Stablecoins payment'
  const heading=/\b(chain|network)\b/.test(q)?'Your '+(latest?'latest saved ':'')+subject+' used '+chain+'.':'Your '+(latest?'latest saved ':'')+subject+' was on '+chain+'.'
  const label=row.source==='gift'?'Gift funding':localRail?(row.source==='bills'?'Bill delivery':'Bank payout'):'Payment'
  const nextStep=['pending','processing','bridging','submitted','deposited','fulfilling','settling'].includes(recorded)?'\nCompletion is not confirmed in the saved record. Do not repeat the payment while its outcome is uncertain. If it is overdue, ask Pocket Support to check the provider.':recorded==='failed'?'\nThe saved record says this attempt failed. A refund is not confirmed unless the original record shows it.':['settled','fulfilled','delivered','completed','confirmed','successful','paid'].includes(recorded)?'\nIf the recipient still cannot see it, Pocket Support should review the delivery evidence.':''
  const result=answer(heading+'\n'+supportPaymentAmount(row)+'\n'+date+'\n'+label+' status on record: '+recorded+'.'+(row.source==='gift'&&['funded','claimed','refunded'].includes(row.giftState||'')?'\nGift state: '+row.giftState+'.':''), 'payment', row)
  result.text+=nextStep
  if(selection&&row.source?.replace(/_/g,'-').startsWith('bank-')&&row.bankOrderId&&deps.payoutStatus){
   const checks=mine.flatMap(c=>c.messages).filter(m=>m.accountContext?.providerCheckedAt&&readAt-m.accountContext.providerCheckedAt<3600000)
   if(checks.length>=3)result.text+='\nThe live payout-check limit has been reached for this hour. Support can continue the investigation.'
   else {result.accountContext.providerCheckedAt=readAt;try{const live=await deps.payoutStatus(row);const allowed=new Set(['initiated','pending','processing','deposited','settling','settled','failed','expired','refunded','refunding','cancelled']);if(!allowed.has(live.status))throw Error('Unknown status');result.text=supportPaymentLabel(row)+'\n'+date+'\nLive bank payout status reported by the provider: '+live.status+'.\nChecked '+new Date(live.checkedAt).toLocaleString('en-GB',{timeZone:'UTC'})+' UTC.'+(live.status==='settled'?'\nThe provider reports settlement. If the money is still missing, Pocket Support can trace it.':'\nDo not repeat this payment while delivery or a refund is unresolved.')+(live.status!==recorded?'\nThe saved receipt has not yet caught up with this provider result.':'')}catch{result.text+='\nThe live payout check is unavailable. The status above is the saved record only; support can investigate.'}}
  }
  result.options=supportOptions(['incoming','outgoing','human']);return result
 }catch{return answer('I could not read your account records right now. Please try again shortly.','clarify')}
}
