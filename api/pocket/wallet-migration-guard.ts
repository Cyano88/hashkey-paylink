import { hasRenderDurableStore, withDurablePostgresTransaction } from '../render-durable-store.js'
import type { MigrationPlan } from './wallet-migration-plan.js'
export type MigrationWalletHold={userId:string;revision:string;walletId:string;createdAt:number}
const key=(walletId:string)=>'pocket:migration-wallet-hold:v1:'+walletId
export function assertWalletHoldAllowed(hold:MigrationWalletHold|undefined,expected?:Pick<MigrationWalletHold,'userId'|'revision'>) {
 if(hold && (!expected || hold.userId!==expected.userId || hold.revision!==expected.revision))throw Object.assign(new Error('This wallet is being updated. Check your wallet migration before making another payment.'),{status:409})
}
export async function withOrdinaryWalletMutation<T>(walletId:string,run:()=>Promise<T>):Promise<T> {
 if(!hasRenderDurableStore())return run()
 return withDurablePostgresTransaction(async client=>{
  await client.query('select pg_advisory_xact_lock(hashtext($1))',[key(walletId)])
  const result=await client.query('select value from render_durable_kv where store_key=$1',[key(walletId)])
  assertWalletHoldAllowed(result.rows[0]?.value)
  return run()
 })
}
export async function holdMigrationWallets(plan:MigrationPlan) {
 return withDurablePostgresTransaction(async client=>{
  for(const row of [...plan.rows].sort((a,b)=>a.source.walletId.localeCompare(b.source.walletId))) {
   const storeKey=key(row.source.walletId)
   await client.query('select pg_advisory_xact_lock(hashtext($1))',[storeKey])
   const result=await client.query('select value from render_durable_kv where store_key=$1',[storeKey])
   assertWalletHoldAllowed(result.rows[0]?.value,plan)
   if(!result.rows[0]?.value)await client.query('insert into render_durable_kv(store_key,value) values($1,$2::jsonb) on conflict(store_key) do update set value=excluded.value,updated_at=now()',[storeKey,JSON.stringify({userId:plan.userId,revision:plan.revision,walletId:row.source.walletId,createdAt:Date.now()})])
  }
 })
}
export async function withMigrationOperation<T>(userId:string,run:()=>Promise<T>):Promise<T> {
 return withDurablePostgresTransaction(async client=>{
  await client.query('select pg_advisory_xact_lock(hashtext($1))',['pocket:migration-operation:v1:'+userId])
  return run()
 })
}
// Only called while the owner operation lock is held and no reservation exists.
export async function releaseUnstartedMigration(plan:MigrationPlan) {
 return withDurablePostgresTransaction(async client=>{
  const current=await client.query('select value from render_durable_kv where store_key=$1',['pocket:wallet-migration-plan:v1:'+plan.userId])
  if(!current.rows[0]?.value || current.rows[0].value.revision!==plan.revision || Object.keys(current.rows[0].value.transfers??{}).length)return
  for(const row of [...plan.rows].sort((a,b)=>a.source.walletId.localeCompare(b.source.walletId))) {
   await client.query('select pg_advisory_xact_lock(hashtext($1))',[key(row.source.walletId)])
   await client.query("delete from render_durable_kv where store_key=$1 and value->>'userId'=$2 and value->>'revision'=$3",[key(row.source.walletId),plan.userId,plan.revision])
  }
 })
}
