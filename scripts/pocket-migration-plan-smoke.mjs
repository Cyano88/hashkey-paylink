import assert from 'node:assert/strict'
import { buildMigrationPlan, retainMigrationPlan, reserveMigrationTransfer, existingMigrationReview } from '../api/pocket/wallet-migration-plan.ts'
const networks=['base','arbitrum','arc']
const attemptId='11111111-1111-4111-8111-111111111111'
const target='0x1111111111111111111111111111111111111111'
const source='0x2222222222222222222222222222222222222222'
const wallets=networks.map((n,i)=>({id:'new-'+n,address:target,blockchain:['BASE','ARB','ARC'][i],accountType:'SCA',state:'LIVE',refId:'pocket:evm-candidate:v2:'+attemptId}))
const links=Object.fromEntries(networks.map(chain=>[chain,{privyUserId:'owner',chain,purpose:'payment',circleWalletId:'old-'+chain,circleWalletAddress:source}]))
const input={userId:'owner',attemptId,wallets,links,units:{base:9007199254740993n,arbitrum:0n,arc:1234567n},now:100}
const plan=buildMigrationPlan(input)
assert.equal(plan.rows[0].units,'9007199254740993')
assert.equal(plan.phase,'review')
assert.equal(buildMigrationPlan({...input,now:200}).revision,plan.revision)
assert.throws(()=>buildMigrationPlan({...input,links:{...links,arc:null}}),/Reconnect/)
assert.throws(()=>buildMigrationPlan({...input,links:{...links,base:{...links.base,privyUserId:'other'}}}),/Reconnect/)
assert.throws(()=>buildMigrationPlan({...input,links:{...links,base:{...links.base,purpose:'agent'}}}),/Reconnect/)
assert.throws(()=>buildMigrationPlan({...input,units:{...input.units,arc:-1n}}),/Exact/)
assert.throws(()=>buildMigrationPlan({...input,units:{...input.units,arc:1.2}}),/Exact/)
assert.throws(()=>buildMigrationPlan({...input,wallets:wallets.slice(0,2)}),/match/)
assert.throws(()=>buildMigrationPlan({...input,wallets:wallets.map((w,i)=>i===2?{...w,address:source}:w)}),/match/)
assert.throws(()=>reserveMigrationTransfer(plan,'other',plan.revision,'base'),/changed/)
assert.throws(()=>reserveMigrationTransfer(plan,'owner','stale','base'),/changed/)
assert.throws(()=>reserveMigrationTransfer(plan,'owner',plan.revision,'arbitrum'),/No balance/)
let allocations=0
const reserve=p=>reserveMigrationTransfer(p,'owner',plan.revision,'base',()=>{allocations++;return attemptId})
const reserved=reserve(plan)
assert.equal(reserved.phase,'transferring')
assert.equal(reserved.transfers.base.units,'9007199254740993')
assert.strictEqual(reserve(reserved),reserved)
assert.equal(allocations,1)
// Simulate loss of a provider response and a process restart from persisted JSON.
const recovered=JSON.parse(JSON.stringify(reserved))
assert.equal(reserve(recovered).transfers.base.idempotencyKey,attemptId)
assert.equal(allocations,1)
assert.strictEqual(retainMigrationPlan(reserved,plan),reserved)
const changed=buildMigrationPlan({...input,units:{...input.units,arc:42n}})
assert.equal(retainMigrationPlan(plan,changed).revision,changed.revision)
assert.throws(()=>retainMigrationPlan(reserved,changed),/reconciled/)
assert.throws(()=>retainMigrationPlan({...reserved,phase:'confirmed'},changed),/reconciled/)
assert.throws(()=>retainMigrationPlan({...plan,userId:'other'},plan),/owner/)
console.log('PASS: exact units, ownership, candidate topology, missing balances, immutable reservations, restart retry, stale review and terminal protection. No provider calls or transfers.')

assert.equal(existingMigrationReview(plan,'owner',attemptId,wallets),null)
assert.equal(existingMigrationReview(reserved,'owner',attemptId,wallets).rows[0].amountUnits,'9007199254740993')
assert.throws(()=>existingMigrationReview(reserved,'other',attemptId,wallets),/match/)
assert.throws(()=>existingMigrationReview(reserved,'owner',attemptId,wallets.map(w=>({...w,id:'changed-'+w.id}))),/match/)
console.log('PASS: restart resumes original transfer amounts and rejects mismatched replacement wallets.')
