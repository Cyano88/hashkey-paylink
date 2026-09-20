import assert from 'node:assert/strict'
import { migrationActivationComplete } from '../api/pocket/wallet-update-status.ts'
const userId='synthetic'
const targets=Object.fromEntries(['base','arbitrum','arc'].map(network=>[network,{walletId:'new-'+network,address:'0x1111111111111111111111111111111111111111'}]))
const record={version:2,userId,phase:'completed',sources:{},targets,completedAt:3,replacementVerifiedAt:1,executionVerifiedAt:2}
const links=Object.entries(targets).map(([chain,t])=>({privyUserId:userId,chain,purpose:'payment',circleWalletId:t.walletId,circleWalletAddress:t.address}))
assert.equal(migrationActivationComplete(userId,record,links),true)
assert.equal(migrationActivationComplete(userId,{...record,phase:'prepared'},links),false)
assert.equal(migrationActivationComplete(userId,{...record,targets:undefined},links),false)
assert.equal(migrationActivationComplete(userId,record,links.slice(0,2)),false)
assert.equal(migrationActivationComplete('other',record,links),false)
assert.equal(migrationActivationComplete(userId,record,links.map((l,i)=>i===1?{...l,circleWalletId:'old'}:l)),false)
assert.equal(migrationActivationComplete(userId,{...record,executionVerifiedAt:undefined},links),false)
console.log('Completion requires the correct account, confirmed completion record and all three activated wallet links.')
