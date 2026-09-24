import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
// Transaction model: no real database/network. A failed source write must discard both journal and source changes.
let committed={kv:{},events:[]},draft,failSource=false,failJournal=false
const query=async(sql,values=[])=>{
  if(sql==='begin'){draft=structuredClone(committed);return {rows:[]}}
  if(sql==='commit'){committed=draft;draft=undefined;return {rows:[]}}
  if(sql==='rollback'){draft=undefined;return {rows:[]}}
  const db=draft??committed
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]}
  if(sql.includes('create table'))return {rows:[]}
  if(sql.includes('select value'))return {rows:[{value:db.kv[values[0]]}]}
  if(sql.includes('insert into render_durable_kv')) {if(values.length===2){if(failSource)throw Error('source write failed');db.kv[values[0]]=JSON.parse(values[1])}return {rows:[]}}
  if(sql.includes('select sequence::text')) {const [project,environment,cursor,record,limit]=values;return {rows:db.events.map((e,index)=>({...e,id:e.key,cursor:String(index+1)})).filter(e=>e.projectId===project&&e.environment===environment&&(!cursor||BigInt(e.cursor)<BigInt(cursor))&&(!record||e.recordId===record)).reverse().slice(0,limit)}}
  if(sql.includes('insert into developer_activity_events')){if(failJournal)throw Error('journal write failed');for(const row of JSON.parse(values[0]))if(!db.events.some(e=>e.key===row.key))db.events.push(row);return {rows:[]}}
  throw Error('Unexpected test query')
}
globalThis.__activityPool={query,connect:async()=>({query,release(){}})}
const dir=await mkdtemp(join(tmpdir(),'activity-atomic-'))
const previous=process.env.DATABASE_URL
process.env.DATABASE_URL='postgres://synthetic@localhost/synthetic'
try {
  const outfile=join(dir,'journal.mjs')
  await build({entryPoints:['api/developer-activity-store.ts'],bundle:true,platform:'node',format:'esm',outfile,plugins:[{name:'fake-postgres',setup(b){b.onResolve({filter:/^pg$/},()=>({path:'pg',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export default {Pool:class {constructor(){return globalThis.__activityPool}}}',loader:'js'}))}}]})
  const {mutateWithDeveloperActivity,appendDeveloperActivity,listDeveloperActivity,backfillDeveloperActivity}=await import(pathToFileURL(outfile).href)
  const row={id:'chk_12345678',partnerId:'dev_activity12345678',createdAt:'2026-09-24T12:00:00Z',amount:'10',network:'arc',arcMainnetChainId:5042}
  await mutateWithDeveloperActivity('checkout','synthetic',()=>({checkouts:{[row.id]:row}}))
  assert.equal(committed.events.length,1)
  await mutateWithDeveloperActivity('checkout','synthetic',current=>structuredClone(current))
  assert.equal(committed.events.length,1)
  failSource=true
  await assert.rejects(mutateWithDeveloperActivity('checkout','synthetic',current=>({checkouts:{[row.id]:{...current.checkouts[row.id],payment:{status:'paid',confirmedAt:row.createdAt,txHash:'synthetic',amount:'10'}}}})),/source write failed/)
  assert.equal(committed.events.length,1);assert.equal(committed.kv.synthetic.checkouts[row.id].payment,undefined)
  failSource=false
  failJournal=true
  await assert.rejects(mutateWithDeveloperActivity('checkout','synthetic',()=>({checkouts:{[row.id]:{...row,amount:'20'}}})),/journal write failed/)
  assert.equal(committed.kv.synthetic.checkouts[row.id].amount,'10')
  failJournal=false
  const existing=committed.events[0]
  await appendDeveloperActivity({query},[{...existing,projectId:'dev_other12345678'},{...existing,environment:'test'},{...existing,event:'payment.processing'}])
  const first=await listDeveloperActivity({projectId:row.partnerId,environment:'live',limit:1})
  assert.equal(first.events.length,1);assert(first.nextCursor)
  const second=await listDeveloperActivity({projectId:row.partnerId,environment:'live',limit:1,cursor:first.nextCursor})
  assert.equal(second.events.length,1);assert.equal(second.nextCursor,null)
  assert.notEqual(first.events[0].id,second.events[0].id)
  assert.equal((await listDeveloperActivity({projectId:row.partnerId,environment:'test'})).events.length,1)
  assert.equal((await listDeveloperActivity({projectId:row.partnerId,environment:'live',recordId:'absent'})).events.length,0)
  const count=committed.events.length
  await backfillDeveloperActivity('checkout','synthetic')
  await backfillDeveloperActivity('checkout','synthetic')
  assert.equal(committed.events.length,count)
  await mutateWithDeveloperActivity('checkout','synthetic',()=>({checkouts:{}}))
  assert.equal(committed.events.length,count,'source pruning does not delete history')
  console.log('Atomic history/source commit, rollback, retry deduplication and pruning preservation passed (transaction model).')
} finally {if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;delete globalThis.__activityPool;if(!resolve(dir).startsWith(resolve(tmpdir())+sep)||!resolve(dir).split(sep).pop().startsWith('activity-atomic-'))throw Error('Unexpected temporary directory');await rm(dir,{recursive:true,force:true})}
