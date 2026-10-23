// Read-only production compatibility check. Only aggregate counts/booleans are printed.
import pg from 'pg'
import {renderDurableStoreConnectionConfig} from '../api/render-durable-store.ts'
import {projectActivitySnapshots} from '../api/developer-activity-events.ts'
import {arcMainnetStoreKey} from '../api/arc-mainnet-boundary.ts'
async function main() {
 const connection=(process.env.DATABASE_URL??process.env.POSTGRES_URL??'').trim()
 if(!connection)throw Error('Storage configuration missing')
 const pool=new pg.Pool({...renderDurableStoreConnectionConfig(connection),max:1,connectionTimeoutMillis:10000,statement_timeout:15000})
 const client=await pool.connect()
 try {
  await client.query('begin read only')
  const metadata=(await client.query("select has_schema_privilege(current_user,current_schema(),'CREATE') as can_create, current_setting('server_version_num') as version")).rows[0]
  const sources=[['checkout',(process.env.HOSTED_CHECKOUT_STORE_KEY??'hashpaylink:hosted-checkouts:v2').trim()],['funding',(process.env.POLYMARKET_FUNDING_CHECKOUT_STORE_KEY??'hashpaylink:polymarket-funding-checkouts:v1').trim()],['agreement',arcMainnetStoreKey('agreements',process.env.ARC_AGREEMENT_STORE_KEY_MAINNET)],['agreement_event',arcMainnetStoreKey('webhooks',process.env.ARC_AGREEMENT_WEBHOOK_STORE_KEY_MAINNET)]]
  const results=[]
  for(const [source,key]of sources){const value=(await client.query('select value from render_durable_kv where store_key=$1',[key])).rows[0]?.value;try{results.push({source,compatible:true,snapshots:projectActivitySnapshots(source,value).length})}catch{results.push({source,compatible:false})}}
  const ok=metadata.can_create&&results.every(r=>r.compatible)
  console.log(JSON.stringify({ok,canCreateJournal:metadata.can_create,postgresVersion:metadata.version,sources:results}))
  if(!ok)process.exitCode=1
 } finally {await client.query('rollback').catch(()=>{});client.release();await pool.end()}
}
main().catch(()=>{console.error(JSON.stringify({ok:false,error:'Read-only activity preflight failed; no source data or credentials emitted.'}));process.exitCode=1})
