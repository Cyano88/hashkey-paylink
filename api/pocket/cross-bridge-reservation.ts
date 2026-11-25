import type {BridgeSpend} from './cross-bridge-operations.js'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {crossBridgeReservationReleased} from './cross-bridge-release.js'
import {activeBridgeReservation} from './cross-bridge-reservation-guard.js'
import {xlayerReservationFinalized} from './xlayer-reservation-finality.js'
import {bindManualBridgeRetry} from './cross-bridge-manual-retry.js'
import type {PoolClient} from 'pg'
import {withDurablePostgresTransaction,readDurableJson} from '../render-durable-store.js'
export const crossBridgeJournalKey=()=> (process.env.CIRCLE_POCKET_ACTION_STORE_KEY??'hashpaylink:circle-pocket-actions').trim()
export const CROSS_BRIDGE_BSC_KEYS=['pocket:bsc-bridge-operations:v1','pocket:bsc-operations:v1','pocket:bsc-payment-operations:v1','pocket:bsc-send-operations:v1'] as const
export const XLAYER_RESERVATION_KEY='pocket:xlayer-sponsorship:v1'
import {walletReservationActions,assertNoCrossBridgeReservation,crossBridgeReservationTerminal as terminal,type CrossBridgeReservation,type CrossBridgeJournal as Journal} from './cross-bridge-reservation-guard.js'
export {assertNoCrossBridgeReservation,type CrossBridgeReservation} from './cross-bridge-reservation-guard.js'
const same=(network:string,a:string,b:string)=>network==='solana'?a===b:a.toLowerCase()===b.toLowerCase()
const invalid=():never=>{throw Object.assign(Error('Bridge reservation storage needs reconciliation.'),{status:503})}
const busy=():never=>{throw Object.assign(Error('Another action from this wallet is still being confirmed.'),{status:409,code:'wallet_action_pending'})}
// Called inside the journal row lock, for a new bridge or its single dispatch claim.
export async function assertBridgeFunds(journal:Journal,next:CrossBridgeReservation,spend:BridgeSpend,now:number,manualException?:string){
 const needs=[spend,...(spend.extra?[spend.extra]:[])]
 const reserved=new Map<string,bigint>()
 for(const old of Object.values(journal.crossBridge??{})){
  if(old.id===next.id||old.id===manualException||old.source!==next.source||!same(next.source,old.walletAddress,next.walletAddress)||crossBridgeReservationReleased(journal,old,now))continue
  const retiredDuringRead=spend.readAt!==undefined&&Number(old.updatedAt)>=spend.readAt&&['source_confirmed','completed','refunded'].includes(old.state)
  if(!activeBridgeReservation(old,now)&&!retiredDuringRead)continue
  if(old.sourceHash&&spend.included?.[old.id]===old.sourceHash)continue
  let prior=old.spend as BridgeSpend|undefined
  if(!prior){
   // Previously saved operations retain their authenticated, fee-inclusive review.
   const r=await openCrossBridgeReview(String(old.quoteToken),old.ownerId,{recovery:true})
   if(r.quote.id!==old.id||r.quote.input.source!==old.source||!same(old.source,r.quote.input.sender,old.walletAddress))invalid()
   prior={asset:r.quote.input.from,units:r.quote.totalUnits,balance:'0',...(r.route.provider==='lifi'&&r.route.lifi.nativeValueUnits!=='0'?{extra:{asset:'CELO',units:r.route.lifi.nativeValueUnits,balance:'0'}}:{})}
  }
  for(const part of [prior,...(prior.extra?[prior.extra]:[])])reserved.set(part.asset,(reserved.get(part.asset)??0n)+BigInt(part.units))
 }
 for(const part of needs){
  if(BigInt(part.balance)<BigInt(part.units)+(reserved.get(part.asset)??0n))throw Object.assign(Error('Insufficient available '+part.asset+' for this bridge and fee.'),{status:422,code:'insufficient_balance'})
 }
}
export async function lockBridgeJournal(client:PoolClient):Promise<Journal>{
 const key=crossBridgeJournalKey()
 await client.query("insert into render_durable_kv (store_key,value,updated_at) values ($1,'{}'::jsonb,now()) on conflict (store_key) do nothing",[key])
 const r=await client.query('select value from render_durable_kv where store_key=$1 for update',[key])
 const value=r.rows[0]?.value
 if(value!==undefined&&value!==null&&(typeof value!=='object'||Array.isArray(value)))invalid()
 return value??{}
}
/** Existing X Layer writer participates in the same lock order as new bridges.
 * Recovery updates are allowed; only newly reserved requests compete. */
export function createCrossAwareXLayerMutator(transaction=withDurablePostgresTransaction,now=Date.now){return async<T>(fn:(s:T|undefined)=>T)=>transaction(async client=>{
 const journal=await lockBridgeJournal(client)
 await client.query("insert into render_durable_kv (store_key,value,updated_at) values ($1,'null'::jsonb,now()) on conflict (store_key) do nothing",[XLAYER_RESERVATION_KEY])
 const result=await client.query('select value from render_durable_kv where store_key=$1 for update',[XLAYER_RESERVATION_KEY]),before=result.rows[0]?.value??undefined
 const next=fn(structuredClone(before)) as T&{requests:Record<string,{wallet:string}>}
 for(const [id,r] of Object.entries(next.requests))if(!before?.requests?.[id])assertNoCrossBridgeReservation(journal,{network:'xlayer',address:r.wallet},now())
 await client.query('update render_durable_kv set value=$2::jsonb,updated_at=now() where store_key=$1',[XLAYER_RESERVATION_KEY,JSON.stringify(next)])
 return next
})}
export const mutateCrossAwareXLayer=createCrossAwareXLayerMutator()
/** The new lifecycle is embedded in the existing action journal. No copied
 * reservation store. Lock order: journal, four BSC rows, X Layer requests. */
export function createCrossBridgeReservationStore(transaction=withDurablePostgresTransaction,now=Date.now,readJournal?:()=>Promise<Journal|undefined>,legacyFinalized=xlayerReservationFinalized){return {
 read:async(id:string)=>readJournal?structuredClone((await readJournal())?.crossBridge?.[id]):(await readDurableJson<CrossBridgeReservation>(crossBridgeJournalKey(),['crossBridge',id]))??undefined,
 mutate:async(id:string,fn:(r:CrossBridgeReservation|undefined)=>CrossBridgeReservation,claimOnCreate=false)=>transaction(async client=>{
  const journal=await lockBridgeJournal(client),before=journal.crossBridge?.[id],next=fn(structuredClone(before))
  if(next.id!==id||!next.ownerId||!next.walletAddress||!next.source||!Number.isFinite(next.expiresAt)||!next.fingerprint)invalid()
  if(before&&(before.ownerId!==next.ownerId||before.fingerprint!==next.fingerprint||before.source!==next.source||before.walletAddress!==next.walletAddress))invalid()
  if(before&&terminal(before.state)&&JSON.stringify(before)!==JSON.stringify(next)){
   // Terminal payment evidence stays immutable. Only the first successful
   // publication acknowledgement may be added after the ledger write.
   const {ledgerPublishedAt,...proof}=next
   if(!['completed','refunded'].includes(before.state)||before.ledgerPublishedAt!==undefined||!Number.isSafeInteger(ledgerPublishedAt)||Number(ledgerPublishedAt)<=0||JSON.stringify(before)!==JSON.stringify(proof))invalid()
  }
  if(before&&JSON.stringify(before)===JSON.stringify(next))return structuredClone(next)
  const reserve=!before||before.state==='prepared'&&next.state==='submitting'
  if(reserve){
   if(!before&&next.state!=='prepared'&&!(claimOnCreate&&next.state==='submitting'))invalid()
   const scope={network:next.source,address:next.walletAddress,ownerId:next.ownerId}
   // Circle Solana signs raw bytes; only our signed relay can broadcast them.
   // Retire expired unsigned attempts atomically with a new reservation. A late
   // signature then sees a terminal record and cannot race the replacement.
   if(!before&&next.source==='solana')for(const [oldId,old] of Object.entries(journal.crossBridge??{})){
    if(oldId!==id&&old.ownerId===next.ownerId&&old.source==='solana'&&old.walletAddress===next.walletAddress
     &&['prepared','submitting','pending'].includes(old.state)&&Number.isFinite(old.expiresAt)&&old.expiresAt<=now()
     &&typeof old.solanaTransaction==='string'&&old.solanaTransaction.length>0
     &&!old.signedTransaction&&!old.sourceHash&&!old.transactionId&&!old.userOperationHash){
     journal.crossBridge![oldId]={...old,state:'cancelled',updatedAt:now()}
    }
   }
   const manualException=bindManualBridgeRetry(journal,next,now())
   if(next.spend)await assertBridgeFunds(journal,next,next.spend as BridgeSpend,now(),manualException)
   else assertNoCrossBridgeReservation(journal,scope,now(),id,manualException)
   for(const r of Object.values(journal.actions??{}))if(walletReservationActions.has(r.action)&&['started','submitted'].includes(r.status)&&r.ownerId===next.ownerId&&(!r.metadata?.source&&!r.metadata?.network||(r.metadata.source||r.metadata.network)===next.source)&&(!r.metadata?.walletAddress||same(next.source,r.metadata.walletAddress,next.walletAddress)))busy()
   for(const bucket of Object.values(journal.circleKit??{}))for(const op of Object.values(bucket.operations??{}) as any[]){
    if(['cancelled','not_submitted'].includes(op.state)||op.state==='prepared'&&op.quote.expiresAt<=now())continue
    const wallet=op.quote.wallets.source
    if(wallet.network===next.source&&same(next.source,wallet.address,next.walletAddress))busy()
   }
  }
  if(reserve&&next.source==='bsc')for(const key of CROSS_BRIDGE_BSC_KEYS){
   await client.query("insert into render_durable_kv (store_key,value,updated_at) values ($1,'null'::jsonb,now()) on conflict (store_key) do nothing",[key])
   const rows=await client.query('select value from render_durable_kv where store_key=$1 for update',[key])
   for(const op of Object.values(rows.rows[0]?.value?.operations??{}) as any[]){
    if(['completed','failed','refunded','cancelled','not_submitted'].includes(op.state)||op.state==='prepared'&&op.quote.expiresAt<=now()&&!op.hash&&!op.transactionId&&!op.userOperationHash)continue
    if(same('bsc',op.quote.walletAddress,next.walletAddress))busy()
   }
  }
  if(reserve&&next.source==='xlayer'){
   await client.query("insert into render_durable_kv (store_key,value,updated_at) values ($1,'null'::jsonb,now()) on conflict (store_key) do nothing",[XLAYER_RESERVATION_KEY])
   const rows=await client.query('select value from render_durable_kv where store_key=$1 for update',[XLAYER_RESERVATION_KEY])
   const legacyRows=Object.entries(rows.rows[0]?.value?.requests??{}) as [string,any][]
   const finalizedLegacy=new Set<string>()
   await Promise.all(legacyRows.filter(([,r])=>same('xlayer',r.wallet,next.walletAddress)&&!r.bridgeQuoteToken&&r.hash).map(async([id,r])=>{if(await legacyFinalized(r))finalizedLegacy.add(id)}))
   for(const [requestId,r] of legacyRows){
    if(!same('xlayer',r.wallet,next.walletAddress))continue
    const notSent=!r.hash&&!r.transactionId&&!r.userOperationHash&&r.providerFailure?.status===400&&r.providerFailure?.code==='transaction_broadcast_failure'
    const settled=Object.values(journal.actions??{}).some(a=>a.resourceId===requestId&&a.ownerId===r.owner&&a.metadata?.source==='xlayer'&&a.metadata?.execution==='privy'&&['completed','failed'].includes(a.status))
    if(!notSent&&!settled&&!finalizedLegacy.has(requestId))busy()
   }
  }
  journal.crossBridge={...journal.crossBridge,[id]:next}
  await client.query('update render_durable_kv set value=$2::jsonb,updated_at=now() where store_key=$1',[crossBridgeJournalKey(),JSON.stringify(journal)])
  return structuredClone(next)
 })
}}
export const crossBridgeReservationStore=createCrossBridgeReservationStore()
