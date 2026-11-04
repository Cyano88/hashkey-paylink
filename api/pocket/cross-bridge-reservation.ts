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
export function createCrossBridgeReservationStore(transaction=withDurablePostgresTransaction,now=Date.now,readJournal=()=>readDurableJson<Journal>(crossBridgeJournalKey())){return {
 read:async(id:string)=>structuredClone((await readJournal())?.crossBridge?.[id]),
 mutate:async(id:string,fn:(r:CrossBridgeReservation|undefined)=>CrossBridgeReservation)=>transaction(async client=>{
  const journal=await lockBridgeJournal(client),before=journal.crossBridge?.[id],next=fn(structuredClone(before))
  if(next.id!==id||!next.ownerId||!next.walletAddress||!next.source||!Number.isFinite(next.expiresAt)||!next.fingerprint)invalid()
  if(before&&(before.ownerId!==next.ownerId||before.fingerprint!==next.fingerprint||before.source!==next.source||before.walletAddress!==next.walletAddress))invalid()
  if(before&&terminal(before.state)&&JSON.stringify(before)!==JSON.stringify(next)){
   // Terminal payment evidence stays immutable. Only the first successful
   // publication acknowledgement may be added after the ledger write.
   const {ledgerPublishedAt,...proof}=next
   if(!['completed','refunded'].includes(before.state)||before.ledgerPublishedAt!==undefined||!Number.isSafeInteger(ledgerPublishedAt)||Number(ledgerPublishedAt)<=0||JSON.stringify(before)!==JSON.stringify(proof))invalid()
  }
  const reserve=!before||before.state==='prepared'&&next.state==='submitting'
  if(reserve){
   if(!before&&next.state!=='prepared')invalid()
   const scope={network:next.source,address:next.walletAddress,ownerId:next.ownerId}
   assertNoCrossBridgeReservation(journal,scope,now(),id)
   for(const r of Object.values(journal.actions??{}))if(walletReservationActions.has(r.action)&&['started','submitted'].includes(r.status)&&r.ownerId===next.ownerId&&(!r.metadata?.source&&!r.metadata?.network||(r.metadata.source||r.metadata.network)===next.source)&&(!r.metadata?.walletAddress||same(next.source,r.metadata.walletAddress,next.walletAddress)))busy()
   for(const bucket of Object.values(journal.circleKit??{}))for(const op of Object.values(bucket.operations??{}) as any[]){
    if(['cancelled','not_submitted'].includes(op.state)||op.state==='prepared'&&op.quote.expiresAt<=now())continue
    const wallet=op.quote.wallets.source
    if(wallet.network===next.source&&same(next.source,wallet.address,next.walletAddress))busy()
   }
  }
  for(const key of CROSS_BRIDGE_BSC_KEYS){
   await client.query("insert into render_durable_kv (store_key,value,updated_at) values ($1,'null'::jsonb,now()) on conflict (store_key) do nothing",[key])
   const rows=await client.query('select value from render_durable_kv where store_key=$1 for update',[key])
   if(reserve&&next.source==='bsc')for(const op of Object.values(rows.rows[0]?.value?.operations??{}) as any[]){
    if(['completed','failed','refunded','cancelled','not_submitted'].includes(op.state)||op.state==='prepared'&&op.quote.expiresAt<=now()&&!op.hash&&!op.transactionId&&!op.userOperationHash)continue
    if(same('bsc',op.quote.walletAddress,next.walletAddress))busy()
   }
  }
  await client.query("insert into render_durable_kv (store_key,value,updated_at) values ($1,'null'::jsonb,now()) on conflict (store_key) do nothing",[XLAYER_RESERVATION_KEY])
  const rows=await client.query('select value from render_durable_kv where store_key=$1 for update',[XLAYER_RESERVATION_KEY])
  if(reserve&&next.source==='xlayer')for(const [requestId,r] of Object.entries(rows.rows[0]?.value?.requests??{}) as [string,any][]){
   if(!same('xlayer',r.wallet,next.walletAddress))continue
   const notSent=!r.hash&&!r.transactionId&&!r.userOperationHash&&r.providerFailure?.status===400&&r.providerFailure?.code==='transaction_broadcast_failure'
   const settled=Object.values(journal.actions??{}).some(a=>a.resourceId===requestId&&a.ownerId===r.owner&&a.metadata?.source==='xlayer'&&a.metadata?.execution==='privy'&&['completed','failed'].includes(a.status))
   if(!notSent&&!settled)busy()
  }
  journal.crossBridge={...journal.crossBridge,[id]:next}
  await client.query('update render_durable_kv set value=$2::jsonb,updated_at=now() where store_key=$1',[crossBridgeJournalKey(),JSON.stringify(journal)])
  return structuredClone(next)
 })
}}
export const crossBridgeReservationStore=createCrossBridgeReservationStore()
