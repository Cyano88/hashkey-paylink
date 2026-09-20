import assert from 'node:assert/strict'
import {buildLegacyRecoveryPlan,retainLegacyRecovery} from '../api/pocket/wallet-migration-recovery.ts'
const networks=['base','arbitrum','arc'],old='0x1111111111111111111111111111111111111111',fresh='0x2222222222222222222222222222222222222222'
const legacy=networks.map(network=>({network,walletId:'old-'+network,walletAddress:old}))
const links=Object.fromEntries(networks.map(chain=>[chain,{privyUserId:'owner',chain,purpose:'payment',circleWalletId:'new-'+chain,circleWalletAddress:fresh}]))
const input={userId:'owner',network:'base',units:1000000n,legacy,links,attemptId:'11111111-1111-4111-8111-111111111111',now:1}
const plan=buildLegacyRecoveryPlan(input)
assert.equal(plan.rows[0].source.walletId,'old-base')
assert.equal(plan.rows[0].target.walletId,'new-base')
assert.equal(plan.rows[0].units,'1000000')
assert.equal(plan.rows[1].units,'0')
assert.throws(()=>buildLegacyRecoveryPlan({...input,units:0n}),/balance/)
assert.throws(()=>buildLegacyRecoveryPlan({...input,legacy:legacy.slice(0,2)}),/ownership/)
assert.throws(()=>buildLegacyRecoveryPlan({...input,links:{...links,base:{...links.base,privyUserId:'other'}}}),/ownership/)
assert.throws(()=>buildLegacyRecoveryPlan({...input,links:{...links,base:{...links.base,purpose:'agent'}}}),/ownership/)
const pending={...plan,phase:'transferring',transfers:{base:{idempotencyKey:'fixed',units:'1000000',state:'reserved'}}}
const next=buildLegacyRecoveryPlan({...input,units:2000000n})
assert.strictEqual(retainLegacyRecovery(pending,next),pending)
const completed={...pending,transfers:{base:{...pending.transfers.base,state:'confirmed',executionId:'saved',challengeId:'saved',transactionHash:'0x'+'a'.repeat(64),confirmedAt:10}}}
assert.strictEqual(retainLegacyRecovery(completed,next),next)
assert.throws(()=>retainLegacyRecovery({...pending,userId:'other'},next),/owner/)
console.log('PASS: old-wallet recovery targets only the current owned Pocket wallet, preserves pending operations and permits later deposits after confirmation. Synthetic only.')
