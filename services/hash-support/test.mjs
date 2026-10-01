import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {PGlite} from '@electric-sql/pglite'
import {createStore} from './store.mjs'
import {createApp} from './app.mjs'
import {sessionToken,sessionClaims,digest} from './auth.mjs'

test('real PostgreSQL engine and HTTP isolation',async()=>{
 const db=new PGlite();await db.waitReady
 const query=async(sql,params)=>{if(!params&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,params);return {...r,rowCount:sql.trim().startsWith("SELECT")?r.rows.length:r.affectedRows}}
 const pool={query,connect:async()=>({query,release(){}})};const store=createStore(pool);await store.migrate();await store.migrate()
 await db.exec('CREATE ROLE hash_test_runtime NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO hash_test_runtime; GRANT ALL ON ALL TABLES IN SCHEMA public TO hash_test_runtime; SET ROLE hash_test_runtime;')
 const adminSecret='a'.repeat(48),sessionSecret='b'.repeat(48);let now=Date.now()
 const server=http.createServer(createApp({store,adminSecret,sessionSecret,now:()=>now}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port
 const call=async(path,token='',method='GET',data)=>{const r=await fetch(url+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()}}
 try{
  assert.equal((await call('/healthz')).status,200)
  assert.equal((await call('/internal/workspaces','', 'POST',{name:'Denied'})).status,401)
  const a=(await call('/internal/workspaces',adminSecret,'POST',{name:'Business A'})).body
  const b=(await call('/internal/workspaces',adminSecret,'POST',{name:'Business B'})).body
  const stored=await query('SELECT key_hash FROM hash_api_keys WHERE id=$1',[a.keyId]);assert.equal(stored.rows[0].key_hash,digest(a.apiKey));assert.notEqual(stored.rows[0].key_hash,a.apiKey)
  const session=async(key,customerId)=>(await call('/v1/customer-sessions',key,'POST',{customerId,workspaceId:'attacker'})).body.token
  const sa=await session(a.apiKey,'customer-1'),sb=await session(b.apiKey,'customer-1'),sa2=await session(a.apiKey,'customer-2')
  assert.equal((await call('/v1/integration-state',sa)).status,401)
  const state={cases:{synthetic:{messages:[{text:'Private synthetic history'}]}},staffNames:{fixture:'Support'}}
  assert.equal((await call('/v1/integration-state',a.apiKey)).body.revision,0)
  assert.equal((await call('/v1/integration-state',a.apiKey,'PUT',{revision:0,value:state})).body.revision,1)
  assert.equal((await call('/v1/integration-state',a.apiKey,'PUT',{revision:0,value:state})).body.revision,1)
  assert.equal((await call('/v1/integration-state',a.apiKey,'PUT',{revision:0,value:{cases:{}}})).status,409)
  assert.equal((await call('/v1/integration-state',b.apiKey)).body.value,null)
  assert.deepEqual((await call('/v1/integration-state',a.apiKey)).body.value,state)
  assert.equal((await query('SELECT * FROM hash_integration_state')).rows.length,0)
  const ca=await call('/v1/conversations',sa,'POST');assert.equal(ca.status,201);const id=ca.body.conversation.id
  const message={requestId:'test-message-00000001',message:'Synthetic test message'}
  const first=await call('/v1/conversations/'+id+'/messages',sa,'POST',message);assert.equal(first.status,201)
  const retry=await call('/v1/conversations/'+id+'/messages',sa,'POST',message);assert.equal(first.body.message.id,retry.body.message.id)
  assert.equal((await call('/v1/conversations/'+id+'/messages',sa,'POST',{...message,message:'Changed'})).status,409)
  assert.equal((await call('/v1/conversations/'+id,sb)).status,404)
  assert.equal((await call('/v1/conversations/'+id,sa2)).status,404)
  assert.equal((await call('/v1/conversations/'+id,sb,'DELETE')).status,404)
  assert.equal((await call('/v1/conversations/'+id,sa)).body.conversation.messages.length,1)
  // Database policy itself protects rows, even if an application query omits WHERE.
  assert.equal((await query('SELECT * FROM hash_conversations')).rows.length,0)
  assert.equal((await query('SELECT * FROM hash_messages')).rows.length,0)
  await query('BEGIN');await query("SELECT set_config('hash.workspace_id',$1,true),set_config('hash.customer_id',$2,true)",[b.workspaceId,'customer-1']);assert.equal((await query('SELECT * FROM hash_conversations')).rows.length,0);await query('ROLLBACK')
  await query('BEGIN');await query("SELECT set_config('hash.workspace_id',$1,true),set_config('hash.customer_id',$2,true)",[b.workspaceId,'customer-1']);await assert.rejects(query('INSERT INTO hash_messages(id,workspace_id,conversation_id,request_id,content) VALUES($1,$2,$3,$4,$5)',['11111111-1111-4111-8111-111111111111',a.workspaceId,id,'cross-business-write','Denied']),e=>e.code==='42501');await query('ROLLBACK')
  assert.equal((await call('/v1/conversations/'+id+'/messages',sa,'POST',{requestId:'test-oversized-0001',message:'x'.repeat(20000)})).status,413)
  assert.equal((await call('/v1/conversations',sa+'x','POST')).status,401)
  now+=301000;assert.equal((await call('/v1/conversations/'+id,sa)).status,401)
  const fresh=await session(a.apiKey,'customer-1');assert.equal((await call('/v1/conversations/'+id,fresh,'DELETE')).status,200);assert.equal((await call('/v1/conversations/'+id,fresh)).status,404)
  assert.equal((await call('/internal/keys/'+a.keyId,adminSecret,'DELETE')).status,200)
  assert.equal((await call('/v1/conversations',fresh,'POST')).status,401)
  assert.equal((await call('/v1/customer-sessions',a.apiKey,'POST',{customerId:'customer-1'})).status,401)
  assert.throws(()=>sessionClaims(sessionSecret,sessionToken('wrong',{workspaceId:a.workspaceId,keyId:a.keyId,customerId:'customer-1'},now),now))
 }finally{await new Promise(r=>server.close(r));await db.close()}
})
