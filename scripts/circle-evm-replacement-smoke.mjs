import assert from 'node:assert/strict'
import { replacementBatchRequest, inspectEvmReplacement, prepareEvmReplacement } from '../src/lib/circleEvmReplacement.ts'
import { auditPocketProductionEvmWallets } from '../src/lib/circleEvmWalletTopology.ts'
import { verifyCircleLinkWallet } from '../api/privy-circle-link.ts'
const id = '22222222-2222-4222-8222-222222222222'
const payload = replacementBatchRequest(id)
const address = '0x1111111111111111111111111111111111111111'
const records = payload.blockchains.map((blockchain, index) => ({ id: String(index), blockchain, address, accountType: 'SCA', state: 'LIVE', refId: payload.metadata[index].refId }))
assert.deepEqual(payload.blockchains, ['BASE', 'ARB', 'ARC'])
assert.equal(payload.idempotencyKey, id)
assert.throws(() => replacementBatchRequest('bad'))
assert.equal(inspectEvmReplacement(records, id).status, 'matching')
assert.equal(inspectEvmReplacement(records.slice(0, 2), id).status, 'incomplete')
assert.equal(inspectEvmReplacement([...records, records[0]], id).status, 'incomplete')
assert.equal(inspectEvmReplacement(records.map((w,i) => i===2 ? {...w, address:'0x2222222222222222222222222222222222222222'} : w), id).status, 'split')
for (const change of [{state:'FROZEN'}, {state:undefined}, {accountType:'EOA'}, {address:'bad'}, {id:''}, {id:'0'}]) {
  assert.equal(inspectEvmReplacement(records.map((w,i) => i===2 ? {...w,...change} : w), id).status, 'invalid')
}
assert.equal(inspectEvmReplacement(records.map(w => ({...w,refId:'other'})), id).status, 'absent')
assert.equal(auditPocketProductionEvmWallets(records).status, 'empty')
const old = records.slice(0,2).map(w => ({...w,id:'old-'+w.id,refId:'pocket:canonical-evm:v1'}))
assert.equal(auditPocketProductionEvmWallets([...records,...old]).wallets.base.id, 'old-0')
await assert.rejects(verifyCircleLinkWallet({ userToken:'synthetic', chain:'arc', wallet:records[2], listWallets:async()=>records }), e=>e.status===409)
const calls=[]
let approved=false
const result=await prepareEvmReplacement(id, {
  list:async()=>{calls.push('list');return approved?records:[]},
  create:async request=>{assert.deepEqual(request,payload);calls.push('create');return {challengeId:'test'}},
  approve:async challenge=>{assert.equal(challenge,'test');calls.push('approve');approved=true},
})
assert.equal(result.status,'matching')
assert.deepEqual(calls,['list','create','approve','list'])
for (const existing of [records, records.slice(0,1)]) {
  await prepareEvmReplacement(id,{list:async()=>existing, create:async()=>{throw Error('must not recreate')},approve:async()=>{throw Error('must not approve')}})
}
await assert.rejects(prepareEvmReplacement(id,{list:async()=>[],create:async()=>({}),approve:async()=>{throw Error('must not approve')}}),/challenge/)
await assert.rejects(prepareEvmReplacement(id,{list:async()=>[],create:async()=>({challengeId:'test'}),approve:async()=>{throw Error('cancelled')}}),/cancelled/)
console.log('Replacement checks passed: 3 chains, isolation, mismatches, invalid records, link rejection, retry and cancellation. No live calls.')
import circleHandler from '../api/circle-solana-email.ts'
for (const action of ['prepareEvmReplacement', 'alignEvmReplacement', 'listEvmReplacement', 'reviewEvmReplacement', 'restoreActivatedEvmWallets']) {
  const response = {code:200, setHeader(){return this}, status(code){this.code=code;return this}, json(body){this.body=body;return this}}
  const realFetch=globalThis.fetch
  let providerCalls=0
  globalThis.fetch=async()=>{providerCalls++;throw Error('Unexpected provider call')}
  try {
    await circleHandler({method:'POST',headers:{},body:{action,userToken:'synthetic',attemptId:id,walletId:'synthetic',walletAddress:address}},response)
    assert.equal(response.code,401)
    assert.equal(providerCalls,0)
  } finally {globalThis.fetch=realFetch}
}
console.log('Replacement endpoints reject unauthenticated requests before provider calls.')
