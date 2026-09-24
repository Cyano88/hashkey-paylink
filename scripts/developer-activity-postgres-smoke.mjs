import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

// Destructive checks are restricted to this disposable loopback database and role.
const target=process.env.TEST_ACTIVITY_DATABASE_URL
if(!target)throw Error('TEST_ACTIVITY_DATABASE_URL is required.')
const url=new URL(target)
if(url.hostname!=='127.0.0.1'||url.port!=='55439'||url.pathname!=='/activity_test'||url.username!=='activity_app')throw Error('Refusing a non-disposable database.')
process.env.DATABASE_URL=target
const storage=await import('../api/render-durable-store.ts')
const journal=await import('../api/developer-activity-store.ts')
const identity=(await storage.queryDurablePostgres('select current_database() as db, current_user as role, host(inet_server_addr()) as host')).rows[0]
assert.equal(identity.db,'activity_test');assert.equal(identity.role,'activity_app');assert.equal(identity.host,'127.0.0.1')
if(process.argv.includes('--schema-child')) {await journal.ensureDeveloperActivitySchema();process.exit(0)}

await storage.writeDurableJson('activity-test-bootstrap',{})
await storage.queryDurablePostgres('drop table if exists developer_activity_events')
await storage.queryDurablePostgres('truncate render_durable_kv')
const child=()=>new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'--schema-child'],{env:process.env,stdio:['ignore','pipe','pipe']})
 let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b)
 p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error('Schema worker failed: '+output)))
})
await Promise.all(Array.from({length:4},child))
await journal.ensureDeveloperActivitySchema()
await journal.backfillDeveloperActivity('agreement','activity-test-absent')
assert.equal(await storage.readDurableJson('activity-test-absent'),undefined,'backfill must not create an empty operational store')
const projectId='dev_pgactivity12345678',stamp='2026-09-24T12:00:00Z',key='activity-test-concurrent'
const row=i=>({id:'chk_pgactivity'+String(i).padStart(4,'0'),partnerId:projectId,createdAt:stamp,amount:'10',network:'arc',arcMainnetChainId:5042})
await Promise.all(Array.from({length:24},(_,i)=>journal.mutateWithDeveloperActivity('checkout',key,current=>({checkouts:{...(current?.checkouts??{}),[row(i).id]:row(i)}}))))
assert.equal(Object.keys((await storage.readDurableJson(key)).checkouts).length,24)
let page=await journal.listDeveloperActivity({projectId,environment:'live',limit:7}),events=[...page.events]
while(page.nextCursor){page=await journal.listDeveloperActivity({projectId,environment:'live',limit:7,cursor:page.nextCursor});events.push(...page.events)}
assert.equal(events.length,24);assert.equal(new Set(events.map(e=>e.id)).size,24)
assert.equal((await journal.listDeveloperActivity({projectId:'dev_otherproject1234',environment:'live'})).events.length,0)
assert.equal((await journal.listDeveloperActivity({projectId,environment:'test'})).events.length,0)
assert.equal((await journal.listDeveloperActivity({projectId,environment:'live',recordId:row(0).id})).events.length,1)
await journal.backfillDeveloperActivity('checkout',key);await journal.backfillDeveloperActivity('checkout',key)
assert.equal(Number((await storage.queryDurablePostgres('select count(*) from developer_activity_events')).rows[0].count),24)

// A rejected source update must roll back the journal insertion made in that transaction.
await storage.queryDurablePostgres(`create or replace function activity_test_fail_source() returns trigger language plpgsql as $$ begin if new.store_key='activity-test-source-fail' then raise exception 'synthetic source failure'; end if; return new; end $$;
create trigger activity_test_source_failure before update on render_durable_kv for each row execute function activity_test_fail_source();`)
await assert.rejects(journal.mutateWithDeveloperActivity('checkout','activity-test-source-fail',()=>({checkouts:{failed:row(99)}})),/synthetic source failure/)
assert.equal(await storage.readDurableJson('activity-test-source-fail'),undefined)
assert.equal((await journal.listDeveloperActivity({projectId,environment:'live',recordId:row(99).id})).events.length,0)
await storage.queryDurablePostgres('drop trigger activity_test_source_failure on render_durable_kv; drop function activity_test_fail_source()')

// A failed journal insert must leave the original source row unchanged.
await storage.queryDurablePostgres(`create or replace function activity_test_fail_journal() returns trigger language plpgsql as $$ begin if new.record_id='chk_pgactivity0098' then raise exception 'synthetic journal failure'; end if; return new; end $$;
create trigger activity_test_journal_failure before insert on developer_activity_events for each row execute function activity_test_fail_journal();`)
await assert.rejects(journal.mutateWithDeveloperActivity('checkout',key,current=>({checkouts:{...current.checkouts,failed:row(98)}})),/synthetic journal failure/)
assert.equal(Object.keys((await storage.readDurableJson(key)).checkouts).length,24)
await storage.queryDurablePostgres('drop trigger activity_test_journal_failure on developer_activity_events; drop function activity_test_fail_journal()')
await journal.mutateWithDeveloperActivity('checkout',key,()=>({checkouts:{}}))
assert.equal(Number((await storage.queryDurablePostgres('select count(*) from developer_activity_events')).rows[0].count),24)

// Fresh inserts and concurrent repeats cannot create multiple financial observations.
const creation={projectId,environment:'live',product:'funding',recordId:'pmf_pgtest1234',event:'funding.funded',occurredAt:stamp,details:{amount:'10',asset:'USDC',evidence:'provider_observation'}}
await Promise.all(Array.from({length:16},()=>storage.withDurablePostgresTransaction(client=>journal.appendDeveloperActivity(client,[creation]))))
assert.equal((await journal.listDeveloperActivity({projectId,environment:'live',recordId:creation.recordId})).events.length,1)
await storage.withDurablePostgresTransaction(client=>journal.appendDeveloperActivity(client,[{...creation,environment:'test'}]))
assert.equal((await journal.listDeveloperActivity({projectId,environment:'test'})).events.length,1)
console.log(JSON.stringify({passed:true,postgres:(await storage.queryDurablePostgres('show server_version')).rows[0].server_version,checks:['four-process schema initialization','24 concurrent source writes','16 concurrent event retries','source/journal atomic rollback','project/environment isolation','cursor pagination','backfill idempotency','retention after pruning']}))
process.exit(0)
