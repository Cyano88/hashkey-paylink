import {withDurablePostgresTransaction} from './render-durable-store.js'
import {ensureDeveloperActivitySchema} from './developer-activity-store.js'
import {developerProjectStoreKey} from './developer-app-lifecycle.js'
import {randomUUID} from 'node:crypto'
type Row=Record<string,any>
export type AppRemovalReview={allowed:boolean;mode:'deleted'|'closed';blockingReason:string;pending:number;history:number}
const fail=(message:string,status=409):never=>{throw Object.assign(Error(message),{status})}
const own=(rows:Row[],id:string)=>rows.filter(row=>row.partnerId===id)
export function reviewAppRemoval(project:Row,input:{checkouts:Row[];funding:Row[];executions:Row[];events:Row[];outbox:Row[];legacyRecords?:number},now=Date.now()):AppRemovalReview{
 const checkouts=own(input.checkouts,project.id),funding=own(input.funding,project.id),ids=new Set([...checkouts,...funding].map(r=>r.id))
 const events=input.events.filter(e=>e.projectId===project.id),executions=input.executions.filter(e=>e.metadata?.partnerId===project.id||e.ownerId==='partner:'+project.id)
 const history=ids.size+events.filter(e=>!ids.has(e.recordId)).length
 let pending=0,reason=''
 const block=(text:string)=>{pending++;reason||=text}
 if(project.operationalStatus==='suspended'&&!project.removal)block('This app is paused. Contact support before removing it.')
 if(input.legacyRecords)block('This app has legacy payment records that need a support review before removal.')
 if((project.capabilities??[]).some((c:string)=>!['hosted_checkout','polymarket_funding'].includes(c))&&(project.keys?.length||events.some(e=>e.product==='agreement')))block('This app has legacy products that need a support review before removal.')
 for(const r of checkouts){
  const attempts=r.paymentAttempts??[]
  if(r.payment?.status==='processing'||attempts.some((a:Row)=>a.status==='processing')){block('Wait for pending payments to finish before removing this app.');continue}
  if(r.payment?.status==='paid'){
   if(r.settlement&&!['delivered','refunded'].includes(r.payout?.status))block('A bank payout or refund is still unresolved.')
   if(r.payment.referenceType==='circle_gateway_transfer'&&!['delivered','refunded'].includes(r.payout?.status)&&!funding.some(f=>f.checkoutId===r.id&&f.observation?.status==='funded'))block('A payment still needs final settlement confirmation.')
   continue
  }
  if(r.agenticAttempts?.length||attempts.some((a:Row)=>a.status==='paid'))block('A payment attempt still needs confirmation.')
  else if(!Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)>now)block('Active payment links must finish or expire before removing this app.')
 }
 for(const r of funding){
  if(['funded','refunded'].includes(r.observation?.status))continue
  const checkout=checkouts.find(c=>c.id===r.checkoutId)
  if(!checkout||checkout.payment?.status==='paid'||checkout.payment?.status==='processing'||!Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)>now)block('An account funding request is still unresolved.')
 }
 for(const e of executions){
  if(['completed','failed','expired'].includes(e.state))continue
  block('A payment execution still needs to finish or be reviewed.')
 }
 if(events.some(e=>!ids.has(e.recordId)))block('Some historical records need a support review before this app can be closed.')
 if(input.outbox.some(e=>(e.partnerId===project.id||checkouts.some(c=>c.id===e.checkoutId))&&!(e.status==='delivered'||e.delivered===true)))block('Payment notifications are still pending. Resolve them before closing this app.')
 const retained=history>0||executions.length>0||project.businessVerification?.documents?.length>0||['submitted','approved'].includes(project.businessVerification?.status)
 return {allowed:pending===0,mode:retained?'closed':'deleted',blockingReason:reason,pending,history}
}
const keys=()=>[(process.env.HOSTED_CHECKOUT_STORE_KEY??'hashpaylink:hosted-checkouts:v2').trim(),(process.env.POLYMARKET_FUNDING_CHECKOUT_STORE_KEY??'hashpaylink:polymarket-funding-checkouts:v1').trim(),'hashpaylink:hosted-stock-checkouts:v1',(process.env.POCKET_PAYMENT_EXECUTION_STORE_KEY??'hashpaylink:pocket-payment-executions').trim(),'hashpaylink:hosted-bsc-checkouts:v1']
export function createAppRemovalManager(transaction=withDurablePostgresTransaction,ensure=ensureDeveloperActivitySchema){return async(input:{projectId:string;ownerId:string;confirmName?:string;remove?:boolean})=>{
 await ensure()
 return transaction(async client=>{
  const row=await client.query('select value from render_durable_kv where store_key=$1 for update',[developerProjectStoreKey()])
  const store=row.rows[0]?.value,project=store?.projects?.[input.projectId]
  if(!project||project.ownerId!==input.ownerId)fail('App not found.',404)
  if(input.remove&&input.confirmName!==project.name)fail('Type the app name exactly to confirm.',400)
  if(project.removal)return {ok:true,removed:true,replayed:true,mode:project.removal.status}
  const sourceKeys=keys(),sources=await client.query('select store_key,value from render_durable_kv where store_key=any($1::text[])',[sourceKeys])
  const stores=Object.fromEntries(sources.rows.map(r=>[r.store_key,r.value??{}]))
  const checkout=stores[sourceKeys[0]]??{},funding=stores[sourceKeys[1]]??{},stock=stores[sourceKeys[2]]??{},execution=stores[sourceKeys[3]]??{},bsc=stores[sourceKeys[4]]??{}
  const events=await client.query('select distinct record_id as "recordId",project_id as "projectId",product from developer_activity_events where project_id=$1',[project.id])
  const legacy=await client.query("select count(*)::int as count from render_durable_kv where (store_key like 'hashpaylink:xstocks-agreement:v1:%' or store_key like 'hashpaylink:arc-hosted-trade:v1:%' or store_key like 'hashpaylink:wallet-swap:v1:%') and (value->>'partnerId'=$1 or value->>'projectId'=$1)",[project.id])
  const review=reviewAppRemoval(project,{checkouts:[...Object.values(checkout.checkouts??{}),...Object.values(stock.checkouts??{}),...Object.values(bsc.checkouts??{})] as Row[],funding:Object.values(funding.records??{}),executions:Object.values(execution.intents??{}),events:events.rows,legacyRecords:Number(legacy.rows[0]?.count??0),outbox:[...(checkout.outbox??[]),...Object.values(stock.outbox??{}),...Object.values(bsc.outbox??{})] as Row[]})
  if(!input.remove)return {ok:true,review}
  if(!review.allowed)fail(review.blockingReason)
  const at=new Date().toISOString()
  store.projects[project.id]={...project,removal:{status:review.mode,at,by:input.ownerId},operationalStatus:'suspended',keys:(project.keys??[]).map((key:Row)=>({...key,revokedAt:key.revokedAt??at})),directoryProfile:{...project.directoryProfile,enabled:false},webhookUrl:'',webhookSecretCipher:'',updatedAt:at,operations:[...(project.operations??[]),{id:randomUUID(),action:'app_'+review.mode,createdAt:at,actor:input.ownerId}]}
  await client.query('update render_durable_kv set value=$2::jsonb,updated_at=now() where store_key=$1',[developerProjectStoreKey(),JSON.stringify(store)])
  return {ok:true,removed:true,mode:review.mode,replayed:false}
 })
}}
export const manageAppRemoval=createAppRemovalManager()
