import {supportPaymentLabel,supportEvidenceTime} from './support-payment-format.js'
import {supportOptions,type SupportOption} from '../../src/pocket/lib/pocketSupportActions.js'
import type {PocketActivityRow} from '../../src/pocket/models/pocketActivity.js'
import type {SupportAccountAnswer} from './support-account-answer.js'
import type {SupportChainFinding} from './support-investigation-chain.js'
export type SupportInvestigation={issue:'missing'|'balance';product?:'usdc'|'bank'|'stocks'|'bills';network?:string;reference?:string;asset?:string;amount?:string;currency?:'USDC'|'NGN'|'UGX';date?:string;details?:string;finding?:string;checkedAt?:number}
type Input={question:string;owner:string;prior?:SupportInvestigation;selectedEventId?:string;offered?:SupportOption[];now:number}
type Dependencies={payments:(owner:string)=>Promise<PocketActivityRow[]>;balanceCheck?:(owner:string,network:string,asset?:string)=>Promise<{text:string;observedAt?:number}>;chainCheck?:(owner:string,network:string,hash:string)=>Promise<SupportChainFinding>}
const types=supportOptions(['investigate_usdc','investigate_bank','investigate_stocks','investigate_bills','human'])
const missing=/\b(?:not|haven't|have not|hasn't|has not|never|isn't|is not|didn't|did not)\b.{0,36}\b(?:arriv\w*|receiv\w*|reciev\w*|seen|see|reflect\w*|deliver\w*)\b|\bmissing\s+(?:payment|money|usdc|deposit|transfer)|\binvestigate missing\b/i
const balance=/\bbalance\b.{0,40}\b(?:tally|match|wrong|incorrect|missing|different)|\b(?:wrong|incorrect|missing)\b.{0,20}\bbalance\b/i
function product(q:string):SupportInvestigation['product']{return /\b(bank|opay|mobile money|airtel money|mtn mobile money)\b/.test(q)?'bank':/\b(bill|airtime|electricity|data bundle|tv)\b/.test(q)?'bills':/\b(stocks?|xstocks?|xlayer|x layer)\b/.test(q)?'stocks':/\busdc|stablecoins?\b/.test(q)?'usdc':undefined}
export async function supportInvestigationAnswer(input:Input,deps:Dependencies):Promise<SupportAccountAnswer|undefined>{
 const q=input.question.trim().toLowerCase().replace(/[\u2018\u2019]/g,"'")
 const isMissing=missing.test(q),isBalance=balance.test(q)||/\b(?:what|show|check|current|available)\b.{0,28}\bbalance\b/.test(q)
 // An explicit topic change releases the investigation; do not trap the chat in a wizard.
 if(!isMissing&&!isBalance&&/\b(latest|last|recent|profile|my name|account safe|trust|gift|request|outgoing payments|incoming payments)\b/.test(q))return
 if(!isMissing&&!isBalance&&!input.prior)return
 if(input.selectedEventId)return
 if(/^(?:hi|hello|thanks|thank you|okay|ok)[.! ]*$/.test(q))return
 if(/\b(stolen|unauthori[sz]ed|scam|hacked|ignore|system prompt|instructions)\b/.test(q))return
 const state:SupportInvestigation=isMissing||isBalance?{issue:isBalance?'balance':'missing'}:{...input.prior!}
 const p=input.prior?.product==='stocks'&&/^(usdc|okb)$/.test(q)?'stocks':product(q);if(p&&p!==state.product){state.product=p;delete state.reference;delete state.network;delete state.finding;delete state.checkedAt}
 if(state.product==='stocks')state.network='xlayer'
 const asset=q.match(/\b([a-z0-9]+x|usdc|okb)\b/i)?.[1];if(asset){if(state.asset!==asset){delete state.finding;delete state.checkedAt};state.asset=asset}
 const names=[...q.matchAll(/\b(base|arbitrum|arc|ethereum|polygon|solana|x\s?layer)\b/g)].map(m=>m[1].replace(/\s/g,''))
 const answer=(text:string,options:SupportOption[]=supportOptions(['human']),handoff=false):SupportAccountAnswer=>({text,handoff,options:handoff?undefined:options,accountContext:{kind:'investigation',readAt:input.now,investigation:state}})
 if(new Set(names).size>1)return answer('Which network was this payment sent on? Choose the original sending network, so I check the right transaction.')
 if(names[0]&&state.network!==names[0]){state.network=names[0];delete state.finding;delete state.checkedAt}
 if(!state.product&&state.network)state.product=state.network==='xlayer'?'stocks':'usdc'
 const hash=input.question.match(/\b0x[a-fA-F0-9]{64}\b/)?.[0]||input.question.match(/\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/)?.[0]
 const ref=hash||input.question.match(/\b(?:reference|ref)\s*[:#]?\s+([a-zA-Z0-9_-]{6,120})\b/i)?.[1]
 if(ref&&ref!==state.reference){state.reference=ref;delete state.finding;delete state.checkedAt}
 const amountMatch=q.match(/(?:\b(\d[\d,]*(?:\.\d{1,6})?)\s*(usdc|ngn|ugx|naira|ugandan shillings)\b)|(?:(₦|ngn|ugx|ush)\s*(\d[\d,]*(?:\.\d{1,6})?))/i)
 if(amountMatch){state.amount=(amountMatch[1]||amountMatch[4]).replaceAll(',','');const unit=(amountMatch[2]||amountMatch[3]).toLowerCase();state.currency=unit==='usdc'?'USDC':['₦','ngn','naira'].includes(unit)?'NGN':'UGX';if(state.currency!=='USDC'&&!state.product)state.product='bank'}
 const iso=input.question.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})\b/i)?.[0]
 const date=q.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{2,4})(?:[t ](?:at )?\d{1,2}:\d{2}(?:\s*(?:utc|gmt|wat|eat)(?:[+-]\d{1,2})?)?)?\b/i)?.[0]
 if(iso||date)state.date=(iso||date)!.replace(/ at /i," ")
 if(state.issue==='balance'&&/\d/.test(q)&&!hash)state.details=input.question.slice(0,300)
 if(!state.product)return answer(state.issue==='balance'?'Is the balance mismatch in Stablecoins or XStocks?':'Were you expecting USDC, stocks, a bank payment or a bill purchase?',state.issue==='balance'?supportOptions(['investigate_usdc','investigate_stocks','human']):types)
 if(state.issue==='balance'){
  if(state.product==='stocks'&&!state.asset)return answer('Which asset balance looks wrong? Enter its ticker, such as NVDAx, USDC or OKB. I will check only that asset on X Layer.')
  if(state.network&&deps.balanceCheck){
   if(state.finding&&state.checkedAt&&input.now-state.checkedAt<60000)return answer(state.finding)
   try{const finding=await deps.balanceCheck(input.owner,state.network,state.product==='stocks'?state.asset:'USDC');state.finding=finding.text;state.checkedAt=finding.observedAt||input.now;return answer(finding.text+'\nChecked '+new Date(state.checkedAt).toLocaleString('en-GB',{timeZone:'UTC'})+' UTC.')}catch{state.checkedAt=input.now;return answer('The fresh balance check is unavailable. I have not replaced your balance with zero or a saved figure. You can retry shortly or ask Pocket Support to compare your wallet and app records.')}
  }
  if(!state.network&&state.product==='usdc')return answer('Which network balance looks wrong? Tell me the amount shown and the amount you expected. You can also share the related transaction hash. I will not calculate your balance from incomplete activity.')
  if(!state.details&&!state.reference)return answer('What balance do you see, and what did you expect? If a particular payment is missing, share its transaction hash or reference.')
  if(!state.reference)return answer('I have saved the balance discrepancy for this conversation. A saved transaction list cannot establish your current spendable balance. Choose Incoming or Outgoing to inspect recent movements, or send these details to Pocket Support.',supportOptions(['incoming','outgoing','human']))
 }
 if(!state.reference){
  if(/(?:no reference|do not have|don't have)/.test(q))return answer('Tell me the amount and currency, where it was sent, and approximately when. For example: 1,000 naira, 02-10-2026 at 12:00 WAT. Do not share your PIN or OTP.',supportOptions(['incoming','outgoing','human']))
  if(state.amount||state.date){
   try{const exactTime=supportEvidenceTime(state.date);const rows=(await deps.payments(input.owner)).filter(r=>!r.fundingOnly&&!r.fundingParent&&r.direction===(state.product==='usdc'||state.product==='stocks'?'in':'out')).filter(r=>!state.network||r.chain===state.network).filter(r=>!state.amount||(state.currency==='USDC'?Number(r.amount)===Number(state.amount):(r.fiatCurrency||(r.source==='bills'?'NGN':undefined))===state.currency&&Number(r.amountNgn)===Number(state.amount))).filter(r=>!Number.isFinite(exactTime)||Math.abs(r.ts-exactTime)<=2*3600000).filter(r=>state.product==='bank'?r.source?.replace(/_/g,'-').startsWith('bank-'):state.product==='bills'?r.source==='bills':true).sort((a,b)=>b.ts-a.ts)
    return answer(rows.length?'These saved records may help. Check the date and amount before selecting a record; these are possible matches, not proof of delivery.':'I could not find a matching saved record. This does not prove the payment failed. Share its transaction hash or ask Pocket Support to investigate.',[...rows.slice(0,5).map(r=>({id:'payment_details' as const,eventId:r.eventId,label:supportPaymentLabel(r)+' · '+new Date(r.ts).toLocaleString('en-GB',{timeZone:'UTC'})+' UTC'})),...supportOptions(['human'])])
   }catch{return answer('Your account records could not be checked right now. Your details are saved in this conversation. Try again shortly or ask Pocket Support to investigate.')}
  }
  return answer('Share the transaction hash or payment reference. If you do not have it, tell me the amount, network and approximate date and time, including your time zone.',supportOptions(['incoming','outgoing','investigate_no_reference','human']))
 }
 if(!state.network&&state.product!=='bank'&&state.product!=='bills')return answer('Which network was it sent on? I have kept the reference, so you do not need to paste it again.')
 try{
  const rows=(await deps.payments(input.owner)).filter(r=>!r.fundingOnly&&!r.fundingParent)
  const matches=rows.filter(r=>[r.txHash,r.eventId,r.bankOrderId,r.providerReference,r.billReference,r.supportReference].some(v=>v&&(/^0x/i.test(v)?v.toLowerCase()===state.reference!.toLowerCase():v===state.reference))).filter(r=>!state.network||r.chain===state.network)
  if(matches.length){return answer('I found '+matches.length+' matching record'+(matches.length===1?'':'s')+' in your Pocket activity. Select it to inspect the recorded status. This is saved evidence, not a new provider delivery confirmation.',[...matches.slice(0,5).map(r=>({id:'payment_details' as const,eventId:r.eventId,label:supportPaymentLabel(r)})),...supportOptions(['human'])])}
  if((state.product==='usdc'||state.product==='stocks')&&state.network&&(state.network==='solana'?/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(state.reference):/^0x[a-f0-9]{64}$/i.test(state.reference))){
   if(state.finding&&state.checkedAt&&input.now-state.checkedAt<60000)return answer(state.finding+'\nLast checked '+new Date(state.checkedAt).toISOString()+'.')
   const result=await deps.chainCheck?.(input.owner,state.network,state.reference)
   state.finding=result?.text||'A live check is not available for this network in Support yet. I have kept your reference for the team.';state.checkedAt=input.now
   return answer(state.finding+'\nChecked '+new Date(input.now).toISOString()+'.',supportOptions(['incoming','human']))
  }
  return answer('I could not match this reference to your saved Pocket records. I cannot confirm delivery or failure from that alone. Pocket Support can investigate with the reference and details already in this conversation.',supportOptions(['human']))
 }catch{return answer('The check is temporarily unavailable. That does not mean the payment failed. Your reference is saved here; try again shortly or ask Pocket Support to investigate.')}
}
