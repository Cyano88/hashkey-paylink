import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const url=process.env.MIGRATION_TEST_DATABASE_URL
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw Error('Isolated local database required.')
process.env.DATABASE_URL=url
const { withCircleSession, migrateCircleSession, readCircleSessionFiles, circleCliSessionStoreKey, restoreCircleSession, circleCommandKind } = await import('../api/circle-cli-durable-session.ts')
const { queryDurablePostgres } = await import('../api/render-durable-store.ts')
if(process.argv[2]==='--restart-probe') {
 await withCircleSession({key:process.argv[3],source:join(tmpdir(),'missing-hpl-source-'+randomUUID()),args:['wallet','list']},async home=>{
  assert.equal(JSON.parse(await readFile(join(home,'.circle-cli','session.json'),'utf8')).token,'synthetic-updated')
 })
 console.log('Restart restore passed');process.exit(0)
}
const source=await mkdtemp(join(tmpdir(),'hpl-cli-source-test-'))
await mkdir(join(source,'.circle-cli'))
await writeFile(join(source,'.circle-cli','session.json'),JSON.stringify({token:'synthetic-only'}))
const key='synthetic-'+randomUUID()
assert.equal((await migrateCircleSession(key,source)).restored,true)
const homes=[]
await withCircleSession({key,source,args:['wallet','list']},async home=>{
 homes.push(home);assert.equal(JSON.parse(await readFile(join(home,'.circle-cli','session.json'),'utf8')).token,'synthetic-only')
 await writeFile(join(home,'.circle-cli','session.json'),JSON.stringify({token:'synthetic-updated'}))
})
await assert.rejects(access(homes[0]))
await withCircleSession({key,source:join(source,'missing-source'),args:['wallet','list']},async home=>{
 homes.push(home);assert.equal(JSON.parse(await readFile(join(home,'.circle-cli','session.json'),'utf8')).token,'synthetic-updated')
})
const restart=spawnSync(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'--restart-probe',key],{env:process.env,encoding:'utf8',windowsHide:true,timeout:30000})
assert.equal(restart.status,0,restart.stderr);assert.match(restart.stdout,/Restart restore passed/)
assert.notEqual(homes[0],homes[1]);assert.equal(JSON.parse(await readFile(join(source,'.circle-cli','session.json'),'utf8')).token,'synthetic-only')
let entered;const enteredPromise=new Promise(r=>entered=r);let release;const gate=new Promise(r=>release=r)
const pending=withCircleSession({key,source,args:['wallet','list']},async()=>{entered();await gate})
await enteredPromise
let ran=false
await assert.rejects(withCircleSession({key,source,args:['wallet','list']},async()=>{ran=true}),/another request/)
assert.equal(ran,false);release();await pending
await assert.rejects(withCircleSession({key,source,args:['wallet','execute']},async home=>{
 await mkdir(join(home,'.circle-cli','payments'))
 await writeFile(join(home,'.circle-cli','payments','payment-test.json'),'synthetic-payment-evidence')
 throw Error('synthetic uncertain network failure')
}),/uncertain network/)
assert.ok((await readCircleSessionFiles(key))['.circle-cli/payments/payment-test.json'])
await assert.rejects(withCircleSession({key,source,args:['wallet','execute']},async()=>{throw Error('must never execute')}),/reconciliation/)
await withCircleSession({key,source,args:['wallet','list']},async()=>{})
await assert.rejects(withCircleSession({key,source,args:['gateway','deposit']},async()=>{}),/reconciliation/)
const second='synthetic-'+randomUUID()
await migrateCircleSession(second,source)
await queryDurablePostgres(`update render_durable_kv set value=jsonb_set(value,'{phase}','"running"') where store_key=$1`,[circleCliSessionStoreKey(second)])
await assert.rejects(withCircleSession({key:second,source,args:['services','pay']},async()=>{}),/reconciliation/)
await assert.rejects(restoreCircleSession({'../escape':'eA=='}),/Unsafe/)
await assert.rejects(restoreCircleSession({'/absolute':'eA=='}),/Unsafe/)
await assert.rejects(restoreCircleSession({'file':'invalid base64'}),/Invalid/)
assert.equal(circleCommandKind(['services','pay','--estimate']),'read')
assert.equal(circleCommandKind(['wallet','execute']),'financial')
assert.equal(circleCommandKind(['unknown','command']),'financial')
const fresh='synthetic-'+randomUUID()
await withCircleSession({key:fresh,source:join(source,'missing'),args:['wallet','login','--init']},async home=>{await writeFile(join(home,'login.json'),'{}')})
await queryDurablePostgres('alter table render_durable_kv rename to migration_test_unavailable')
let executedDuringOutage=false
try { await assert.rejects(withCircleSession({key,source,args:['wallet','list']},async()=>{executedDuringOutage=true}));assert.equal(executedDuringOutage,false) }
finally { await queryDurablePostgres('alter table migration_test_unavailable rename to render_durable_kv') }
for(const k of [key,second,fresh]) await queryDurablePostgres('delete from render_durable_kv where store_key=$1',[circleCliSessionStoreKey(k)])
console.log('PASS: Circle session restore after source loss, isolated temporary homes, unchanged original, concurrent lock, uncertain/crashed payment barrier, retained diagnostics, path validation and new login.')
process.exit(0)
