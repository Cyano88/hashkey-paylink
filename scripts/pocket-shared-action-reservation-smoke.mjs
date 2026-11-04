import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'

// Exercise the production journal/controller against an isolated transactional
// store. No DB credentials, provider requests, approval UI or funds are used.
const rows=new Map();let queue=Promise.resolve(),durable=true,broken=false
globalThis.sharedActionFixture={
 ready:()=>durable,
 read:async key=>{if(broken)throw Error('store unavailable');return structuredClone(rows.get(key))},
 mutate:(key,fn)=>{const task=queue.then(async()=>{if(broken)throw Error('store unavailable');const next=await fn(structuredClone(rows.get(key)));rows.set(key,structuredClone(next));return next});queue=task.catch(()=>{});return task},
}
await mkdir('.codex-temp',{recursive:true})
await build({stdin:{contents:`export * from './api/circle-pocket-action-journal.ts';export {createCircleKitOperations} from './api/pocket/circle-bridge-operations.ts'`,resolveDir:process.cwd()},outfile:'.codex-temp/shared-action-fixture.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'durable-fixture',setup(b){b.onResolve({filter:/render-durable-store\.js$/},()=>({path:'store',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const f=globalThis.sharedActionFixture;export const hasRenderDurableStore=f.ready,readDurableJson=f.read,mutateDurableJson=f.mutate;export const writeDurableJson=async()=>{throw Error('Unexpected fallback write')}`,loader:'js'}))}}]})
const j=await import('../.codex-temp/shared-action-fixture.mjs')
const wallet='0x'+'a'.repeat(40),otherWallet='0x'+'b'.repeat(40)
const ownerKey=owner=>'pocket:circle-kit-operations:v1:'+createHash('sha256').update(owner).digest('hex')
function fixture(owner='owner',network='base',address=wallet){
 const quote={id:randomUUID(),ownerId:owner,expiresAt:Date.now()+30000,wallets:{ownerId:owner,source:{network,address}},input:{source:network}}
 let dispatches=0,preflight=async()=>{},recover=null
 const deps={now:Date.now,open:async()=>({quote}),read:()=>j.readCircleKitActionStore(ownerKey(owner)),mutate:fn=>j.mutateCircleKitActionStore(ownerKey(owner),fn),approve:async()=>true,preflight:q=>preflight(q),dispatch:async()=>{dispatches++;throw Error('lost response')},recover:async()=>recover}
 return {quote,owner,deps,service:j.createCircleKitOperations(deps),count:()=>dispatches,setPreflight:fn=>preflight=fn,setRecovery:value=>recover=value}
}
const claim=(action='wallet.native-send',ownerId='owner',network='base',address=wallet)=>j.claimCirclePocketAction({ownerId,action,idempotencyKey:randomUUID(),metadata:{network,walletAddress:address}})
const busy=error=>error.status===409&&error.code==='wallet_action_pending'
for(const action of ['reservation.direct-cctp','wallet.native-send','wallet.native-swap','wallet.usdt-bridge','wallet.xlayer-bridge','wallet.bsc-bridge','wallet.swap','wallet.cash-conversion']){
 for(const kitFirst of [true,false]){
  rows.clear();const f=fixture()
  const prepare=()=>f.service.prepare('sealed',f.owner,'pin')
  const results=await Promise.allSettled(kitFirst?[prepare(),claim(action)]:[claim(action),prepare()])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,action)
  assert.ok(busy(results.find(r=>r.status==='rejected').reason));assert.equal(f.count(),0)
 }
 rows.clear();const first=fixture();await first.service.prepare('sealed',first.owner,'pin')
 await assert.rejects(()=>claim(action),busy)
}
// Existing send and swap claims now conflict atomically in either order.
rows.clear();const race=await Promise.allSettled([claim(),claim('wallet.native-swap')]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
const winner=race.find(r=>r.status==='fulfilled').value.record
assert.equal((await j.claimCirclePocketAction(winner)).claimed,false,'idempotent retry must not reserve again')
await j.recordCirclePocketAction({...winner,status:'completed'})
const afterCompletion=fixture();await afterCompletion.service.prepare('sealed','owner','pin')
rows.clear();const f=fixture();await f.service.prepare('sealed',f.owner,'pin')
await assert.rejects(()=>claim('wallet.native-send','owner','base',wallet.toUpperCase().replace('0X','0x')),busy)
await claim('wallet.native-send','other');await claim('wallet.native-send','owner','arbitrum');await claim('wallet.native-send','owner','base',otherWallet)
// Cancellation releases only an unsigned reservation and preserves other claims.
await f.service.cancel(f.quote.id,f.owner);const next=await claim();assert.equal(next.claimed,true)
assert.equal((await j.listCirclePocketActions('owner')).length,3)
// Preflight cancellation races cannot dispatch after the reservation is released.
rows.clear();const c=fixture();await c.service.prepare('sealed',c.owner,'pin')
let entered,release;const waiting=new Promise(r=>entered=r)
c.setPreflight(async()=>{entered();await new Promise(r=>release=r)})
const submit=c.service.submit(c.quote.id,c.owner,'private-session');await waiting
await c.service.cancel(c.quote.id,c.owner);await claim();release();await submit;assert.equal(c.count(),0)
// Lost responses, elapsed review expiry and restart never release or redispatch.
rows.clear();const u=fixture();await u.service.prepare('sealed',u.owner,'pin')
await Promise.all([u.service.submit(u.quote.id,u.owner,'private-session'),u.service.submit(u.quote.id,u.owner,'private-session')]);assert.equal(u.count(),1)
u.quote.expiresAt=0
const restarted=j.createCircleKitOperations(u.deps)
await restarted.resume(u.quote.id,u.owner,'session');await restarted.cancel(u.quote.id,u.owner);await restarted.submit(u.quote.id,u.owner,'session')
await assert.rejects(()=>claim(),busy);assert.equal(u.count(),1)
assert.ok(!JSON.stringify([...rows.values()]).includes('private-session'))
u.setRecovery({challengeId:'confirmed-challenge',txHash:'0x'+'c'.repeat(64)})
await restarted.resume(u.quote.id,u.owner,'session');u.setRecovery({notSubmitted:true});await restarted.resume(u.quote.id,u.owner,'session');await assert.rejects(()=>claim(),busy)
// Safe unsigned expiry permits another flow; submitting remains blocked above.
rows.clear();const expired=fixture();expired.quote.expiresAt=Date.now()-1
await j.mutateCircleKitActionStore(ownerKey('owner'),()=>({operations:{[expired.quote.id]:{id:expired.quote.id,ownerId:'owner',quote:expired.quote,state:'prepared'}}}))
await claim();await assert.rejects(()=>expired.service.submit(expired.quote.id,'owner','session'))
// Historical pending rows without a wallet address conservatively block network.
rows.clear();await j.recordCirclePocketAction({ownerId:'owner',action:'wallet.bridge',idempotencyKey:'history',status:'submitted',metadata:{source:'base',destination:'arc',amount:'1'}})
const historical=fixture();await assert.rejects(()=>historical.service.prepare('sealed','owner','pin'),busy)
// Kit state survives ordinary journal writes and can't be filed under another owner.
rows.clear();const keep=fixture();await keep.service.prepare('sealed','owner','pin')
await j.recordCirclePocketAction({ownerId:'other',action:'wallet.bridge',idempotencyKey:'other',status:'completed'})
assert.equal((await keep.service.read(keep.quote.id,'owner')).state,'prepared')
await assert.rejects(()=>j.mutateCircleKitActionStore(ownerKey('foreign'),()=>({operations:{x:{id:'x',ownerId:'owner',quote:keep.quote,state:'prepared'}}})),/owner mismatch/)
// Storage outage and an earlier draft store both fail closed.
broken=true;await assert.rejects(()=>claim(),/store unavailable/);await assert.rejects(()=>keep.service.read(keep.quote.id,'owner'));broken=false
durable=false;await assert.rejects(()=>keep.service.read(keep.quote.id,'owner'),/storage is unavailable/);durable=true
rows.set(ownerKey('owner'),{operations:{x:{state:'submitting'}}});await assert.rejects(()=>keep.service.read(keep.quote.id,'owner'),/reconciliation/)
console.log('PASS shared action reservations: cross-flow atomic claims, owner/network/wallet scope, cancellation race, lost response/restart, unknown outcomes, source hash retention, unsigned expiry, historical pending records and fail-closed storage. Isolated transactional fixtures only.')
