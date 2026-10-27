import {isBscCheckoutId,readBscCheckout} from './hosted-bsc-checkouts.js'
import {isStockCheckoutId,readStockCheckout} from './hosted-stock-checkouts.js'
import {ensureDeveloperActivitySchema} from './developer-activity-store.js'
import {queryDurablePostgres} from './render-durable-store.js'
import {readVerifiedCheckoutActivityRecords} from './hosted-checkouts.js'
import {readVerifiedFundingActivityRecords} from './polymarket-funding-checkouts.js'
import {paymentStatus,type PaymentGroup,type StatusCheckout} from './developer-payment-status.js'
export function paymentPageQuery(input:{projectId:string;cursor?:string;recordId?:string;limit?:number}){
 const fail=()=>{throw Object.assign(Error('Invalid payment list request.'),{status:400})}
 if(!/^dev_[a-z0-9]{8,64}$/i.test(input.projectId)||input.recordId&&!/^[a-zA-Z0-9_-]{1,100}$/.test(input.recordId))fail()
 const limit=input.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)fail()
 let cursor:{time:string;id:string}|undefined
 if(input.cursor){try{if(input.cursor.length>300)fail();cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString());if(!cursor||!Number.isFinite(Date.parse(cursor.time))||!/^[a-zA-Z0-9_-]{1,100}$/.test(cursor.id))fail()}catch{fail()}}
 return {limit,text:`with grouped as (
 select e.record_id as "recordId",e.product,min(e.occurred_at) as "createdAt",max(e.occurred_at) as "updatedAt",
 jsonb_agg(jsonb_build_object('event',e.event,'occurredAt',e.occurred_at,'details',e.details) order by e.occurred_at,e.sequence) as events
 from developer_activity_events e
 where e.project_id=$1 and e.environment='live' and e.product in ('checkout','funding')
 and ($2::text is null or e.record_id=$2 or e.details->>'checkoutId'=$2)
 and not (e.product='checkout' and exists (select 1 from developer_activity_events f where f.project_id=e.project_id and f.environment=e.environment
 and ((f.product='funding' and f.details->>'checkoutId'=e.record_id) or (f.record_id=e.record_id and f.details ? 'requestId'))))
 group by e.record_id,e.product)
 select * from grouped where ($3::timestamptz is null or ("createdAt","recordId")<($3::timestamptz,$4::text))
 order by "createdAt" desc,"recordId" desc limit $5`,values:[input.projectId,input.recordId||null,cursor?.time??null,cursor?.id??null,limit+1]}
}
export async function listDeveloperPayments(input:Parameters<typeof paymentPageQuery>[0]){
 const query=paymentPageQuery(input);await ensureDeveloperActivitySchema()
 const result=await queryDurablePostgres(query.text,query.values),rows=result.rows.slice(0,query.limit) as PaymentGroup[]
 const funding=await readVerifiedFundingActivityRecords(rows.filter(r=>r.product==='funding').map(r=>r.recordId),input.projectId)
 const ids=[...new Set(rows.map(r=>r.product==='checkout'?r.recordId:funding.get(r.recordId)?.checkoutId??r.events.find(e=>e.details.checkoutId)?.details.checkoutId).filter((id):id is string=>Boolean(id)))]
 const checkouts=new Map<string,StatusCheckout>(await readVerifiedCheckoutActivityRecords(ids,input.projectId))
 await Promise.all(ids.filter(id=>isBscCheckoutId(id)||isStockCheckoutId(id)).map(async id=>{
  const record=isBscCheckoutId(id)?await readBscCheckout(id,true):await readStockCheckout(id,true)
  if(record?.partnerId===input.projectId)checkouts.set(id,record)
 }))
 const linked=ids.length?await queryDurablePostgres("select record_id as id,event,occurred_at as \"occurredAt\",details from developer_activity_events where project_id=$1 and environment='live' and product='checkout' and record_id=any($2::text[]) order by occurred_at,sequence",[input.projectId,ids]):{rows:[]}
 const payments=rows.map(row=>{const record=funding.get(row.recordId),checkoutId=row.product==='checkout'?row.recordId:record?.checkoutId??row.events.find(e=>e.details.checkoutId)?.details.checkoutId;const combined=row.product==='funding'?{...row,events:[...row.events,...linked.rows.filter(e=>e.id===checkoutId).map(e=>({event:String(e.event),occurredAt:new Date(e.occurredAt).toISOString(),details:e.details as Record<string,string>}))].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt))}:row;return paymentStatus(combined,checkoutId?checkouts.get(checkoutId):undefined,record)})
 const last=rows.at(-1)
 return {payments,nextCursor:result.rows.length>query.limit&&last?Buffer.from(JSON.stringify({time:new Date(last.createdAt).toISOString(),id:last.recordId})).toString('base64url'):null,coverage:'Current records and retained payment evidence. Older payments without sufficient evidence show Status unavailable.'}
}
