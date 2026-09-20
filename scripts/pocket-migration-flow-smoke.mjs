import assert from 'node:assert/strict'
import { createMigrationFlowHandler, migrationSnapshot } from '../api/pocket/wallet-migration-flow.ts'
const rows=['base','arbitrum','arc'].map(network=>({network,units:network==='base'?'1000000':'0',source:{walletId:'old-'+network,address:'0x'+'1'.repeat(40)},target:{walletId:'new-'+network,address:'0x'+'2'.repeat(40)}}))
let plan={version:1,userId:'owner',attemptId:'attempt',revision:'revision',reviewedAt:1,phase:'review',rows,transfers:{}}
let enabled=false,completed=false,starts=0,reconciles=0,quotes=0
const handler=createMigrationFlowHandler({
 verify:async req=>{if(req.headers.authorization!=='Bearer test')throw Object.assign(Error('Unauthorized'),{status:401});return {userId:'owner'}},
 read:async()=>plan,enabled:()=>enabled,completed:async()=>completed,
 quote:async()=>{quotes++;return {id:'fee',revision:plan.revision,network:'base',amount:'0.001',asset:'ETH',expiresAt:Date.now()+60000}},
 executor:()=>({start:async()=>{starts++;return {state:'reconcile'}},recover:async()=>({state:'reconcile'}),resume:async()=>({state:'approval',challengeId:'saved'}),reconcile:async()=>{reconciles++;return {state:'pending'}}}),
 activate:async()=>{completed=true},
})
async function call(body,authorization='Bearer test',method='POST') {
 const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(data){this.data=data;return this}}
 await handler({method,body,headers:{authorization}},res);assert.equal(res.headers['Cache-Control'],'no-store');return res
}
const request={revision:'revision',network:'base',userToken:'synthetic-token'}
assert.equal((await call({action:'status'},'')).code,401)
assert.equal((await call({action:'status'},'Bearer test','GET')).code,405)
assert.equal((await call({action:'status',recipient:'arbitrary'})).code,400)
let result=await call({action:'status'});assert.equal(result.data.snapshot.phase,'review');assert.equal(result.data.snapshot.rows[0].amount,'1');assert.equal(starts,0)
assert.equal((await call({...request,action:'start',revision:'stale'})).code,409)
assert.equal((await call({...request,action:'start'})).code,503);assert.equal(starts,0)
assert.equal((await call({...request,action:'resume'})).code,503)
assert.equal((await call({...request,action:'recover'})).code,503)
assert.equal((await call({...request,action:'quote'})).code,200);assert.equal(quotes,1)
assert.equal((await call({...request,action:'reconcile'})).code,200);assert.equal(reconciles,1);assert.equal(starts,0)
assert.equal((await call({...request,action:'activate'})).code,409)
const owned=plan;plan={...owned,userId:'other'};assert.equal((await call({action:'status'})).code,409);plan=owned
enabled=true
assert.equal((await call({...request,action:'recover'})).data.state,'reconcile')
assert.equal((await call({...request,action:'start'})).data.state,'reconcile');assert.equal(starts,1)
plan={...owned,transfers:{base:{state:'reserved',units:'1000000',idempotencyKey:'saved'}}}
assert.equal(migrationSnapshot(plan,true).phase,'pending')
await call({action:'status'});await call({action:'status'});assert.equal(starts,1)
assert.equal(migrationSnapshot({...owned,rows:rows.map(row=>({...row,units:'0'}))},true).phase,'ready-to-activate')
assert.notEqual(migrationSnapshot(plan,true).phase,'completed')
completed=true;result=await call({action:'status'});assert.equal(result.data.snapshot.phase,'completed')
assert.equal((await call({...request,action:'start'})).data.snapshot.phase,'completed');assert.equal(starts,1)
console.log('PASS: migration HTTP authentication, ownership, strict fields, stale reviews, disabled transfers, read-only refresh, reconciliation, and server completion. Synthetic only; no funds moved.')

// Exercise the real release default and stop switch, without provider mutations.
const priorGate=process.env.POCKET_WALLET_MIGRATION_ENABLED
try {
 const release=createMigrationFlowHandler({verify:async()=>({userId:'owner'}),read:async()=>owned,completed:async()=>false})
 for(const [setting,expected] of [[undefined,true],['true',true],['false',false],['invalid',false],['',false]]) {
  if(setting===undefined)delete process.env.POCKET_WALLET_MIGRATION_ENABLED
  else process.env.POCKET_WALLET_MIGRATION_ENABLED=setting
  const res={setHeader(){},status(){return this},json(data){this.data=data;return this}}
  await release({method:'POST',body:{action:'status'},headers:{}},res)
  assert.equal(res.data.snapshot.enabled,expected)
 }
} finally {
 if(priorGate===undefined)delete process.env.POCKET_WALLET_MIGRATION_ENABLED
 else process.env.POCKET_WALLET_MIGRATION_ENABLED=priorGate
}
console.log('PASS: released migration is enabled by default; explicit stop and invalid settings disable execution.')
