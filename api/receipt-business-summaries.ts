import {createHash} from 'node:crypto'
import {PrivyClient} from '@privy-io/server-auth'
import {readDurableJson,mutateDurableJson,queryDurablePostgres,hasRenderDurableStore} from './render-durable-store.js'
import {activeReceiptSettings} from './developer-receipt-settings.js'
import {ensureDeveloperActivitySchema} from './developer-activity-store.js'
import {readReceiptCheckout,checkoutReceipt,type ReceiptCheckout} from './checkout-receipts.js'
import {readVerifiedCheckoutActivityRecords} from './hosted-checkouts.js'
import {queuePreparedReceiptEmail,type ReceiptSummaryGuard} from './checkout-receipt-emails.js'
import {nextReceiptSummaryPeriod} from './receipt-summary-periods.js'
import {businessReceiptReport} from './receipt-business-report.js'
import {businessSummaryEmail,businessSummaryPdf} from './receipt-business-summary-document.js'
import type {BusinessSummaryPreferences} from '../src/lib/businessSummaryPreferences.js'
import type {ReceiptEmailSettings} from '../src/lib/receiptEmailSettings.js'
import type {SellerIdentityStore} from './marketplace/seller-identity.js'
import type {MarketplaceStore} from './marketplace/repository.js'

type Project={ownerId:string;name:string;receiptEmails?:ReceiptEmailSettings;removal?:unknown;operationalStatus?:string;checkoutMode?:string;capabilities?:string[]}
type State={projects:Record<string,Project>;links:SellerIdentityStore['links']}
type Candidate={projectId:string;ownerId:string;sellerId?:string;name:string;preferences:BusinessSummaryPreferences}
type Cursors={ends:Record<string,number>}
const KEY='hashpaylink:receipt-business-summaries:v1'
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
async function state():Promise<State>{
 const [projects,identities]=await Promise.all([readDurableJson<{projects:State['projects']}>((process.env.DEVELOPER_PROJECT_STORE_KEY??'hashpaylink:developer-projects:v1').trim()),readDurableJson<SellerIdentityStore>('hashpaylink:marketplace-seller-identities:v1')])
 return {projects:projects?.projects??{},links:identities?.links??[]}
}
async function verifiedEmail(owner:string){
 const app=process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET
 if(!app||!secret)return null
 const user=await new PrivyClient(app,secret).getUserById(owner)
 const emails=user.linkedAccounts.filter(a=>a.type==='email'&&a.latestVerifiedAt instanceof Date&&Number.isFinite(a.latestVerifiedAt.getTime()))
 return emails.length===1&&emails[0].type==='email'?emails[0].address:null
}
export function businessSummaryCandidates(s:State):Candidate[]{
 const result:Candidate[]=[]
 const add=(projectId:string,p:Project,ownerId:string,preferences?:BusinessSummaryPreferences,sellerId?:string)=>{
  if(preferences?.enabled&&preferences.subscriberId===ownerId&&Number.isFinite(Date.parse(preferences.startedAt||'')))result.push({projectId,name:p.name,ownerId,preferences,...(sellerId?{sellerId}:{})})
 }
 for(const [id,p] of Object.entries(s.projects)){
  if(!activeReceiptSettings(p))continue
  add(id,p,p.ownerId,p.receiptEmails?.businessSummary)
  if(!p.capabilities?.includes('marketplace_payments'))continue
  const links=s.links.filter(l=>l.projectId===id&&!l.revokedAt)
  for(const link of links)if(links.filter(l=>l.sellerId===link.sellerId).length===1)add(id,p,link.owner,link.reporting,link.sellerId)
 }
 return result
}
const guardFor=(c:Candidate):ReceiptSummaryGuard=>({projectId:c.projectId,ownerId:c.ownerId,...(c.sellerId?{sellerId:c.sellerId}:{}),startedAt:c.preferences.startedAt!,frequency:c.preferences.frequency,timeZone:c.preferences.timeZone})
export async function canDeliverReceiptSummary(guard:ReceiptSummaryGuard,to:string,d={state,email:verifiedEmail}){
 const candidate=businessSummaryCandidates(await d.state()).find(c=>digest(guardFor(c))===digest(guard))
 if(!candidate)return false
 const email=await d.email(candidate.ownerId)
 return !!email&&email.toLowerCase()===to.toLowerCase()
}
/** First durable observation is the recognition date, including late reconciliation.
 * Never silently issue a partial statement when retained payment proof is missing. */
async function checkouts(projectId:string,from:number,to:number):Promise<Array<{record:ReceiptCheckout;recordedAt:number}>>{
 await ensureDeveloperActivitySchema()
 const rows=await queryDurablePostgres<{id:string;paid:Date|null;settled:Date|null}>(`select record_id as id,
 min(recorded_at) filter(where event='payment.paid') as paid,
 min(recorded_at) filter(where event in ('payout.validated','payout.settled')) as settled
 from developer_activity_events where project_id=$1 and environment='live' and product='checkout'
 and not (details ? 'requestId') group by record_id
 having min(recorded_at) filter(where event='payment.paid') >= $2 and min(recorded_at) filter(where event='payment.paid') < $3
 or min(recorded_at) filter(where event in ('payout.validated','payout.settled')) >= $2 and min(recorded_at) filter(where event in ('payout.validated','payout.settled')) < $3`,[projectId,new Date(from),new Date(to)])
 const result:Array<{record:ReceiptCheckout;recordedAt:number}>=[]
 for(let offset=0;offset<rows.rows.length;offset+=100){
  const batch=rows.rows.slice(offset,offset+100),verified=await readVerifiedCheckoutActivityRecords(batch.map(r=>r.id),projectId)
  for(const row of batch){
   const record=verified.get(row.id)??await readReceiptCheckout(row.id)
   if(!record||record.partnerId!==projectId)throw Error('Summary payment evidence unavailable.')
   if(record.checkoutMode==='agentic'||'providerFunding' in record&&record.providerFunding)continue
   const local='settlement' in record&&!!record.settlement,time=local?row.settled:row.paid
   if(!time)continue
   const recordedAt=new Date(time).getTime();if(recordedAt<from||recordedAt>=to)continue
   if(checkoutReceipt(record)?.status!=='confirmed')throw Error('Summary payment outcome requires review.')
   result.push({record,recordedAt})
  }
 }
 return result
}
const defaults={enabled:()=>hasRenderDurableStore()&&process.env.CHECKOUT_RECEIPT_EMAIL_ENABLED==='true'&&!!(process.env.RECEIPT_FROM_EMAIL||process.env.ALERT_FROM_EMAIL),now:Date.now,state,email:verifiedEmail,
 read:async()=>await readDurableJson<Cursors>(KEY)??{ends:{}},mutate:(fn:(s:Cursors)=>Cursors)=>mutateDurableJson<Cursors>(KEY,s=>fn(s??{ends:{}})),
 marketplace:()=>readDurableJson<MarketplaceStore>('hashpaylink:marketplace-accounting-foundation:v1'),checkouts,pdf:businessSummaryPdf,
 queue:async(id:string,projectId:string,message:Parameters<typeof queuePreparedReceiptEmail>[2],guard:ReceiptSummaryGuard)=>queuePreparedReceiptEmail(id,projectId,message,undefined,guard)}
let running=false
export async function reconcileBusinessReceiptSummaries(d=defaults){
 if(!d.enabled()||running)return
 running=true
 try{
  const candidates=businessSummaryCandidates(await d.state()),cursors=await d.read(),now=d.now()
  if(!candidates.length)return
  const marketplace=await d.marketplace();let prepared=0
  for(const c of candidates){
   if(prepared>=20)break
   const guard=guardFor(c),key=digest(guard),period=nextReceiptSummaryPeriod(c.preferences,now,cursors.ends[key]);if(!period)continue
   try{
    const records=c.sellerId?[]:await d.checkouts(c.projectId,period.from,period.to)
    const report=businessReceiptReport({...period,projectId:c.projectId,name:c.name,audience:c.sellerId?'seller':'operator',sellerId:c.sellerId,generatedAt:now,marketplace,checkouts:records})
    if(report.activityCount){
     const to=await d.email(c.ownerId);if(!to)continue
     const pdf=await d.pdf(report),id='business-summary-'+key+'-'+period.to
     await d.queue(id,c.projectId,{...businessSummaryEmail(report),to,attachments:[{filename:'Sales-summary-'+new Date(period.to).toISOString().slice(0,10)+'.pdf',content:pdf.toString('base64'),content_type:'application/pdf'}]},guard)
     prepared++
    }
    await d.mutate(s=>{s.ends[key]=Math.max(s.ends[key]??0,period.to);return s})
   }catch{console.warn('[business-summary] statement preparation deferred')}
  }
 }finally{running=false}
}
