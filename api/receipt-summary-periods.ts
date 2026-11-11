import type {BusinessSummaryPreferences} from '../src/lib/businessSummaryPreferences.js'
const day=86400_000
function parts(time:number,timeZone:string){
 const values=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(time).map(p=>[p.type,p.value]))
 return {year:+values.year,month:+values.month,date:+values.day,hour:+values.hour,minute:+values.minute,second:+values.second}
}
function midnight(calendar:number,timeZone:string){
 const date=new Date(calendar),wanted=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());let candidate=wanted
 for(let i=0;i<4;i++){const p=parts(candidate,timeZone),actual=Date.UTC(p.year,p.month-1,p.date,p.hour,p.minute,p.second);const delta=wanted-actual;if(!delta)return candidate;candidate+=delta}
 throw Error('Reporting timezone boundary could not be resolved.')
}
/** One closed calendar period at a time, including a partial enrollment period.
 * Advancing from the saved end catches up after outages without skipping days. */
export function nextReceiptSummaryPeriod(preferences:BusinessSummaryPreferences,now:number,lastEnd?:number){
 const activated=Date.parse(preferences.startedAt||'')
 if(!preferences.enabled||!Number.isFinite(activated)||!Number.isFinite(now))return
 const cursor=Math.max(activated,lastEnd??activated),p=parts(cursor,preferences.timeZone)
 let calendar=Date.UTC(p.year,p.month-1,p.date)
 if(preferences.frequency==='weekly')calendar-=((new Date(calendar).getUTCDay()+6)%7)*day
 const start=midnight(calendar,preferences.timeZone),end=midnight(calendar+(preferences.frequency==='weekly'?7:1)*day,preferences.timeZone)
 if(end<=cursor||end+15*60_000>now)return
 return {from:Math.max(start,activated,cursor),to:end,timeZone:preferences.timeZone,frequency:preferences.frequency}
}
