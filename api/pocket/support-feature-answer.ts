import type {SupportFeature,SupportFeatureRecord} from './support-feature-records.js'
import type {SupportAccountAnswer} from './support-account-answer.js'
import {supportOptions,type SupportOption} from '../../src/pocket/lib/pocketSupportActions.js'
const prefix='support-feature:'
export async function supportFeatureAnswer(input:{owner:string;question:string;prior?:{kind:SupportFeature;id:string};selected?:string;offered?:SupportOption[];now:number},read?:(owner:string,kind:SupportFeature,selected?:string)=>Promise<SupportFeatureRecord[]>):Promise<SupportAccountAnswer|undefined>{
 const q=input.question.toLowerCase()
 const follow=!input.selected&&input.prior&&/^(?:(?:and )?(?:what(?: is|'s| about)|check|show) )?(?:(?:its|the|that) )?(?:status|refund|claim|payments|contributions)[?.! ]*$/.test(q)
 if(follow)input={...input,selected:prefix+input.prior!.kind+':'+encodeURIComponent(input.prior!.id)}
 const selection=input.selected?.startsWith(prefix)
 const kind:SupportFeature|undefined=selection?input.selected!.slice(prefix.length).split(':')[0] as SupportFeature:/\bcollections?\b/.test(q)?'collections':/\b(xpay|pos|terminals?)\b/.test(q)?'xpay':/\brequests?\b/.test(q)?'requests':/\bgifts?\b/.test(q)?'gifts':undefined
 if(!kind||!['requests','gifts','xpay','collections'].includes(kind))return
 if(!selection&&!/\b(my|our|latest|last|recent|status|missing|not arrived|not received|not claimed|not paid)\b/.test(q))return
 if(!selection&&/\b(ignore|system|instructions|another|their|his|her|delete|cancel|approve|issue|execute)\b/.test(q))return
 const answer=(text:string,options=supportOptions(['human'])):SupportAccountAnswer=>({text,options,handoff:false,accountContext:{kind:'clarify',readAt:input.now}})
 if(!read)return answer('This feature lookup is unavailable here. Open its history in Pocket or ask Support to check the record.')
 if(selection&&!follow&&!input.offered?.some(o=>o.id==='payment_details'&&o.eventId===input.selected))return answer('Choose a record from the offered list first.')
 try{
  const id=selection?decodeURIComponent(input.selected!.slice(prefix.length+kind.length+1)):undefined
  const records=await read(input.owner,kind,id)
  if(selection){const row=records.find(r=>r.id===id);if(!row)return answer('That record is unavailable for this account. Support can help locate it.');const result=answer(row.title+'\nSaved status: '+row.status+'.\n'+(row.details||[]).join('\n')+'\nRecorded '+new Date(row.updatedAt).toLocaleString('en-GB',{timeZone:'UTC'})+' UTC.\nThis is saved evidence, not a new live delivery check. If it conflicts with what you see, ask Support to investigate.');result.accountContext.featureRecord={kind,id:row.id};return result}
  return answer(records.length?'Choose the '+(kind==='xpay'?'terminal':kind==='collections'?'collection':kind==='gifts'?'gift':'request')+' to check. These are your saved records.':'No matching saved '+kind+' were found. This does not prove a payment failed. Open the feature in Pocket or ask Support.',[...records.slice(0,5).map(r=>({id:'payment_details' as const,eventId:prefix+kind+':'+encodeURIComponent(r.id),label:r.title+' · '+r.status})),...supportOptions(['human'])])
 }catch{return answer('These saved records are temporarily unavailable. No payment was retried or changed. Try again shortly or ask Support.')}
}
