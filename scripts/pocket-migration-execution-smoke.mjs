import assert from 'node:assert/strict'
import { createMigrationExecutor, migrationTransfersConfirmed } from '../api/pocket/wallet-migration-execution.ts'
import { createPaymentExecutionRepository } from '../api/pocket/payment-execution-intents.ts'
import { buildMigrationPlan } from '../api/pocket/wallet-migration-plan.ts'
const networks=['base','arbitrum','arc'], attemptId='11111111-1111-4111-8111-111111111111'
const address='0x1111111111111111111111111111111111111111', old='0x2222222222222222222222222222222222222222'
const input={userId:'owner',attemptId,wallets:networks.map((n,i)=>({id:'new-'+n,address,blockchain:['BASE','ARB','ARC'][i],accountType:'SCA',state:'LIVE',refId:'pocket:evm-candidate:v2:'+attemptId})),links:Object.fromEntries(networks.map(chain=>[chain,{privyUserId:'owner',chain,circleWalletId:'old-'+chain,circleWalletAddress:old}])),units:{base:2000000n,arbitrum:0n,arc:0n}}
function fixture(overrides={}) {
  let stored=buildMigrationPlan(input), providerCalls=0, approvals=0, proof=null, data
  const snapshot=structuredClone(stored)
  const ledger=createPaymentExecutionRepository({durable:true,now:()=>100_000,mutateDurable:async(_key,fn)=>data=await fn(data),readDurable:async()=>data,appendLedger:async()=>undefined})
  const io={mutate:async(_owner,fn)=>stored=fn(stored),ledger,now:()=>101_000,preflight:async()=>({revision:stored.revision,checkedAt:101_000,ownershipVerified:true,noPendingOperations:true,assetsAccountedFor:true,feeApproved:true,sourceUnits:'2000000'}),approve:async()=>{approvals++;return true},createChallenge:async()=>{providerCalls++;return {challengeId:'challenge'}},verifyReceipt:async()=>proof,...overrides}
  return {executor:createMigrationExecutor(io),snapshot,context:{userId:'owner',revision:stored.revision,network:'base'},get stored(){return stored},get providerCalls(){return providerCalls},get approvals(){return approvals},setProof:p=>proof=p,ledger}
}
const f=fixture()
const results=await Promise.all([f.executor.start(f.context,f.snapshot),f.executor.start(f.context,f.snapshot)])
assert.deepEqual(results.map(r=>r.state).sort(),['approval','reconcile'])
assert.equal(f.providerCalls,1)
assert.equal((await f.ledger.get('owner',f.stored.transfers.base.executionId)).state,'authorized')
assert.equal(migrationTransfersConfirmed(f.stored),false)
assert.equal((await f.executor.reconcile(f.context,f.stored)).state,'pending')
assert.equal((await f.executor.start(f.context,f.stored)).state,'reconcile')
assert.equal(f.providerCalls,1)
f.setProof({transactionHash:'0x'+'a'.repeat(64),confirmedAt:101_000})
assert.equal((await f.executor.reconcile(f.context,f.stored)).state,'confirmed')
assert.equal((await f.ledger.get('owner',f.stored.transfers.base.executionId)).state,'completed')
assert.equal(migrationTransfersConfirmed(f.stored),true)
assert.equal((await f.executor.reconcile(f.context,f.stored)).state,'confirmed')
// An ambiguous provider timeout leaves a durable reservation and never resubmits.
let attempts=0
const lost=fixture({createChallenge:async()=>{attempts++;throw Error('timeout')}})
await assert.rejects(lost.executor.start(lost.context,lost.snapshot),/timeout/)
assert.equal((await lost.executor.start(lost.context,lost.snapshot)).state,'reconcile')
assert.equal((await lost.executor.reconcile(lost.context,lost.stored)).state,'needs_review')
assert.equal(attempts,1)
for (const bad of [{ownershipVerified:false},{noPendingOperations:false},{assetsAccountedFor:false},{feeApproved:false},{sourceUnits:'1'},{checkedAt:0},{revision:'stale'}]) {
  const denied=fixture({preflight:async()=>({revision:f.context.revision,checkedAt:101_000,ownershipVerified:true,noPendingOperations:true,assetsAccountedFor:true,feeApproved:true,sourceUnits:'2000000',...bad})})
  await assert.rejects(denied.executor.start(denied.context,denied.snapshot),/preflight/)
  assert.equal(denied.providerCalls,0)
  assert.equal(denied.approvals,0)
}
const denied=fixture({approve:async()=>false})
await assert.rejects(denied.executor.start(denied.context,denied.snapshot),/Approve/)
assert.equal(denied.providerCalls,0)
assert.deepEqual(denied.stored.transfers,{})
await assert.rejects(f.executor.start({...f.context,userId:'other'},f.snapshot),/changed/)
console.log('PASS: existing ledger integration, approval gating, concurrent start, ambiguous timeout, receipt reconciliation and completion guard. Synthetic only.')

// Resuming uses only the already saved provider challenge, with a fresh approval.
let challengeState='approval_required'
const resume=fixture({inspectChallenge:async()=>challengeState})
await resume.executor.start(resume.context,resume.snapshot)
assert.equal((await resume.executor.reconcile(resume.context,resume.stored)).state,'approval_required')
assert.deepEqual(await resume.executor.resume(resume.context,resume.stored),{state:'approval',challengeId:'challenge'})
assert.equal(resume.providerCalls,1)
assert.equal(resume.approvals,2)
challengeState='pending'
assert.equal((await resume.executor.resume(resume.context,resume.stored)).state,'pending')
challengeState='needs_review'
assert.equal((await resume.executor.resume(resume.context,resume.stored)).state,'needs_review')
assert.equal(resume.providerCalls,1)
await assert.rejects(resume.executor.resume({...resume.context,userId:'other'},resume.stored),/changed/)
assert.equal((await lost.executor.resume(lost.context,lost.stored)).state,'needs_review')
assert.equal(attempts,1)
assert.equal((await f.executor.resume(f.context,f.stored)).state,'needs_review')
console.log('PASS: saved approval resumes with fresh security approval, no new provider submission, and closed handling for unknown, in-progress and completed transfers.')

// Lost response recovery is an explicit replay of the saved request, not a new transfer.
const recoveredKeys=[]
const recoverable=fixture({challengeFingerprint:(row,key)=>JSON.stringify({row,key}),createChallenge:async(row,key)=>{recoveredKeys.push(key);if(recoveredKeys.length===1)throw Error('lost response');return {challengeId:'original-challenge'}}})
await assert.rejects(recoverable.executor.start(recoverable.context,recoverable.snapshot),/lost response/)
const recoverySnapshot=structuredClone(recoverable.stored)
assert.equal((await recoverable.executor.reconcile(recoverable.context,recoverySnapshot)).state,'recovery_required')
const recovered=await Promise.all([recoverable.executor.recover(recoverable.context,recoverySnapshot),recoverable.executor.recover(recoverable.context,recoverySnapshot)])
assert.deepEqual(recovered.map(r=>r.state).sort(),['pending','reconcile'])
assert.equal(new Set(recoveredKeys).size,1)
assert.equal(recoveredKeys.length,2)
assert.equal(recoverable.stored.transfers.base.challengeId,'original-challenge')
assert.equal((await recoverable.executor.recover(recoverable.context,recoverable.stored)).state,'needs_review')
assert.equal(recoveredKeys.length,2)
assert.equal((await recoverable.executor.recover(recoverable.context,{...recoverySnapshot,rows:recoverySnapshot.rows.map(r=>({...r,units:'1'}))})).state,'needs_review')
assert.equal((await lost.executor.recover(lost.context,lost.stored)).state,'needs_review')
await assert.rejects(recoverable.executor.recover({...recoverable.context,userId:'other'},recoverySnapshot),/changed/)
let retries=0
const retryFailure=fixture({challengeFingerprint:()=> 'fingerprint',createChallenge:async()=>{retries++;throw Error('timeout')}})
await assert.rejects(retryFailure.executor.start(retryFailure.context,retryFailure.snapshot),/timeout/)
await assert.rejects(retryFailure.executor.recover(retryFailure.context,retryFailure.stored),/timeout/)
assert.equal((await retryFailure.executor.recover(retryFailure.context,retryFailure.stored)).state,'pending')
assert.equal(retries,2)
console.log('PASS: lost-response recovery preserves request/key, prevents concurrent replay and rapid retry, rejects changed amounts/owners and never signs or replaces a challenge.')
let allowRecovery=true, denialCalls=0
const approvalRecovery=fixture({challengeFingerprint:()=> 'saved-request',approve:async()=>allowRecovery,createChallenge:async()=>{denialCalls++;throw Error('lost')}})
await assert.rejects(approvalRecovery.executor.start(approvalRecovery.context,approvalRecovery.snapshot),/lost/)
allowRecovery=false
await assert.rejects(approvalRecovery.executor.recover(approvalRecovery.context,approvalRecovery.stored),/Approve/)
assert.equal(denialCalls,1)
console.log('PASS: lost-response recovery cannot contact the mutation endpoint without fresh Pocket approval.')

function expiryFixture({checkChange={},...overrides}={}) {
 let invalidations=0
 const f=fixture({challengeFingerprint:()=> 'bound-request',inspectChallenge:async()=> 'expired',verifyExpiry:async(plan)=>({revision:plan.revision,checkedAt:101_000,providerExpired:true,ownershipVerified:true,noPendingOperations:true,sourceUnits:'2000000',...checkChange}),invalidateFeeQuote:async()=>{invalidations++},...overrides})
 return {f,get invalidations(){return invalidations}}
}
const expiry=expiryFixture();await expiry.f.executor.start(expiry.f.context,expiry.f.snapshot)
const oldTransfer=structuredClone(expiry.f.stored.transfers.base)
assert.equal((await expiry.f.executor.reconcile(expiry.f.context,expiry.f.stored)).state,'review_required')
assert.equal(expiry.f.stored.transfers.base,undefined)
assert.equal(expiry.f.stored.expiredTransfers.length,1)
assert.equal(expiry.f.stored.expiredTransfers[0].challengeId,oldTransfer.challengeId)
assert.equal((await expiry.f.ledger.get('owner',oldTransfer.executionId)).state,'expired')
assert.equal(expiry.invalidations,1)
assert.equal(expiry.f.providerCalls,1,'expiry reconciliation must not create a replacement')
assert.equal(migrationTransfersConfirmed(expiry.f.stored),false)
await expiry.f.executor.start(expiry.f.context,expiry.f.stored)
assert.notEqual(expiry.f.stored.transfers.base.idempotencyKey,oldTransfer.idempotencyKey)
assert.equal(expiry.f.providerCalls,2)
assert.equal(expiry.f.approvals,2,'replacement requires a separate fresh approval')
for(const checkChange of [{providerExpired:false},{ownershipVerified:false},{noPendingOperations:false},{sourceUnits:'1'},{revision:'stale'},{checkedAt:0},{checkedAt:102_000}]){
 const {f:blocked}=expiryFixture({checkChange});await blocked.executor.start(blocked.context,blocked.snapshot)
 await assert.rejects(blocked.executor.reconcile(blocked.context,blocked.stored),/needs reconciliation/)
 assert.ok(blocked.stored.transfers.base);assert.equal(blocked.stored.expiredTransfers,undefined);assert.equal(blocked.providerCalls,1)
 assert.equal((await blocked.ledger.get('owner',blocked.stored.transfers.base.executionId)).state,'authorized')
}
const missing=expiryFixture({challengeFingerprint:undefined}).f;await missing.executor.start(missing.context,missing.snapshot)
await assert.rejects(missing.executor.reconcile(missing.context,missing.stored),/verified transfer review/)
const partial=expiryFixture().f;await partial.executor.start(partial.context,partial.snapshot)
const partialId=partial.stored.transfers.base.executionId
await partial.ledger.update({ownerId:'owner',intentId:partialId,state:'expired',expectedState:'authorized',failureCode:'MIGRATION_APPROVAL_EXPIRED'})
assert.equal((await partial.executor.reconcile(partial.context,partial.stored)).state,'review_required','retry safely completes ledger-first retirement')
const hashed=expiryFixture().f;await hashed.executor.start(hashed.context,hashed.snapshot)
await hashed.ledger.update({ownerId:'owner',intentId:hashed.stored.transfers.base.executionId,transactionHash:'0x'+'a'.repeat(64)})
assert.equal((await hashed.executor.reconcile(hashed.context,hashed.stored)).state,'pending');assert.ok(hashed.stored.transfers.base)
console.log('PASS: verified expiry archives without submission, invalidates fees, requires new approval, survives partial writes and blocks changed evidence or hashes.')
