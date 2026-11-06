import assert from 'node:assert/strict'
import {crossBridgeReservationReleased} from '../api/pocket/cross-bridge-release.ts'
import {assertNoCrossBridgeReservation} from '../api/pocket/cross-bridge-reservation-guard.ts'
import {assertCrossBridgeCoverageReady,crossBridgeCollectedCoverage} from '../api/pocket/cross-bridge-coverage.ts'
const now=1793950000000,wallet='0x'+'a'.repeat(40)
const row={id:'old',ownerId:'owner',source:'bsc',walletAddress:wallet,fingerprint:'b'.repeat(64),expiresAt:now-10000,createdAt:now-20000,state:'submitting',quoteToken:'sealed'}
const grant={operationId:'old',ownerId:'owner',source:'bsc',walletAddress:wallet,fingerprint:row.fingerprint,authorizedAt:now-1000,reason:'owner_accepted_unresolved_execution_risk'}
const journal=()=>({crossBridge:{old:structuredClone(row)},crossBridgeReleases:{old:structuredClone(grant)}})
const scope={network:'bsc',address:wallet,ownerId:'owner'}
const pending=e=>e.code==='wallet_action_pending'
let j=journal();const before=JSON.stringify(j.crossBridge)
assert(crossBridgeReservationReleased(j,j.crossBridge.old,now))
assert.doesNotThrow(()=>assertNoCrossBridgeReservation(j,scope,now))
const deps={read:async()=>j,now:()=>now,open:async()=>{throw Error('unexpected provider read')}}
await assertCrossBridgeCoverageReady(wallet,deps)
assert.deepEqual(await crossBridgeCollectedCoverage(wallet,deps),[],'no invented fee credit for released unknown')
assert.equal(JSON.stringify(j.crossBridge),before,'release never rewrites original evidence')
for(const change of [g=>g.ownerId='other',g=>g.operationId='other',g=>g.fingerprint='c'.repeat(64),g=>g.source='xlayer',g=>g.walletAddress='0x'+'d'.repeat(40),g=>g.authorizedAt=now+1,g=>g.authorizedAt=row.expiresAt,g=>g.reason='unapproved',g=>g.revokedAt=now]){
 j=journal();change(j.crossBridgeReleases.old)
 assert(!crossBridgeReservationReleased(j,j.crossBridge.old,now))
 assert.throws(()=>assertNoCrossBridgeReservation(j,scope,now),pending)
 await assert.rejects(()=>assertCrossBridgeCoverageReady(wallet,deps),e=>e.code==='previous_bridge_pending')
}
for(const field of ['sourceHash','transactionId','userOperationHash','challengeId']){
 j=journal();j.crossBridge.old[field]='discovered-reference'
 assert(!crossBridgeReservationReleased(j,j.crossBridge.old,now))
 assert.throws(()=>assertNoCrossBridgeReservation(j,scope,now),pending)
 await assert.rejects(()=>crossBridgeCollectedCoverage(wallet,deps),e=>e.code==='previous_bridge_pending')
}
j=journal();j.crossBridge.next={...row,id:'next'}
assert.throws(()=>assertNoCrossBridgeReservation(j,scope,now),pending,'another pending transaction remains blocking')
await assert.rejects(()=>assertCrossBridgeCoverageReady(wallet,deps),e=>e.code==='previous_bridge_pending')
j=journal();j.crossBridge.old.state='submitted';j.crossBridge.old.sourceHash='0x'+'e'.repeat(64)
assert(!crossBridgeReservationReleased(j,j.crossBridge.old,now))
await assert.rejects(()=>crossBridgeCollectedCoverage(wallet,deps),/unexpected provider read/,'discovered source returns to evidence checks')
console.log('PASS exact BNB incident release, original evidence preserved, invalid/revoked grants fail closed, other pending operations blocked, discovered references restore accounting. No live mutations.')
