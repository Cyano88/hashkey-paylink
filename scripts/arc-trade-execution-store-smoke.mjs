import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {encodeFunctionData,keccak256,parseAbi} from 'viem'
import {createArcTradeExecutionStore} from '../api/trade-agreement/arc-execution-store.ts'
const a=n=>'0x'+n.repeat(40),h=n=>'0x'+n.repeat(64)
const data=encodeFunctionData({abi:parseAbi(['function approve(address,uint256) returns(bool)']),functionName:'approve',args:[a('2'),1250000n]})
const reservation={agreementId:'tag_'+'a'.repeat(64),projectId:'dev_testproject',participantId:'did:privy:buyer',walletId:randomUUID(),requestId:randomUUID(),termsHash:h('c'),action:'approve',call:{chainId:5042,account:a('1'),to:a('3'),data,value:'0'},preparedAfterBlock:'99'}
let row,mutations=0,tail=Promise.resolve()
// Model the database's per-key serializable mutation, including concurrent first writes.
const deps={read:async()=>structuredClone(row),mutate:async(_key,update)=>{
 const task=tail.then(()=>{const result=update(structuredClone(row));row=structuredClone(result);mutations++;return structuredClone(result)})
 tail=task.catch(()=>{});return task
},now:()=>new Date('2026-10-03T12:00:00Z'),uuid:randomUUID}
let store=createArcTradeExecutionStore(deps)
const [first,duplicate]=await Promise.all([store.reserve(reservation),store.reserve(reservation)])
assert.equal(row.entries.length,1);assert.equal(first.idempotencyKey,duplicate.idempotencyKey)
// A process restart and advanced chain head preserve the first action and provider key.
store=createArcTradeExecutionStore(deps)
const retry=await store.reserve({...reservation,preparedAfterBlock:'109'})
assert.equal(retry.idempotencyKey,first.idempotencyKey);assert.equal(retry.preparedAfterBlock,'99')
for(const patch of [{termsHash:h('d')},{walletId:randomUUID()},{participantId:'did:privy:seller'},{action:'fund'},{call:{...reservation.call,to:a('4')}}]){
 await assert.rejects(()=>store.reserve({...reservation,...patch}),/retry changed/)
}
await assert.rejects(()=>store.reserve({...reservation,requestId:randomUUID()}),/pending/)
await assert.rejects(()=>store.reserve({...reservation,projectId:'dev_different'}),/project changed/)
const challengeId=randomUUID(),transactionId=randomUUID(),transactionHash=h('e')
await assert.rejects(()=>store.recordSubmission({...reservation,transactionId,transactionHash}),/Recover.*challenge/)
const issued=await store.recordChallenge({...reservation,challengeId});assert.equal(issued.status,'challenge_issued')
await assert.rejects(()=>store.recordChallenge({...reservation,challengeId:randomUUID()}),/challenge changed/)
const submitted=await store.recordSubmission({...reservation,transactionId,transactionHash});assert.equal(submitted.status,'submitted')
assert.equal((await store.recordChallenge({...reservation,challengeId})).status,'submitted','late challenge response cannot roll back submitted state')
await assert.rejects(()=>store.recordSubmission({...reservation,transactionId,transactionHash:h('f')}),/transaction changed/)
const policy={walletRuntimeHash:keccak256('0x6000'),entryPointRuntimeHash:keccak256('0x6001'),walletImplementation:a('5'),walletImplementationRuntimeHash:keccak256('0x6002')}
const receipt={transactionHash,blockHash:h('b'),blockNumber:100n,status:'success',logs:[]}
let head=104n
const client={getChainId:async()=>5042,getBlockNumber:async()=>head,getBlock:async()=>({hash:h('b')}),
 getTransaction:async()=>({hash:transactionHash,from:reservation.call.account,to:reservation.call.to,input:data,value:0n,blockHash:h('b'),blockNumber:100n}),
 getTransactionReceipt:async()=>receipt,
 getCode:async()=>{throw Error('Unexpected direct-call runtime read')},getStorageAt:async()=>{throw Error('Unexpected direct-call storage read')},
}
await assert.rejects(()=>store.reconcile({...reservation,policy,client}),/confirmations/)
assert.equal(row.entries[0].status,'submitted','unknown/pending outcomes keep the action reserved')
head=105n
const confirmed=await store.reconcile({...reservation,policy,client});assert.equal(confirmed.status,'confirmed')
assert.equal(confirmed.result.transactionHash,transactionHash)
assert.equal((await store.recordSubmission({...reservation,transactionId,transactionHash})).status,'confirmed')
assert.equal((await store.reserve(reservation)).status,'confirmed','replaying an old request never reserves a new action')
await assert.rejects(()=>store.reserve({...reservation,requestId:randomUUID(),action:'fund',preparedAfterBlock:'99'}),/Refresh.*chain head/)
const second=await store.reserve({...reservation,requestId:randomUUID(),action:'fund',preparedAfterBlock:'105'})
assert.equal(row.entries.length,2)
await assert.rejects(()=>store.recordChallenge({...second,challengeId}),/another action/)
await store.recordChallenge({...second,challengeId:randomUUID()})
await assert.rejects(()=>store.recordSubmission({...second,transactionId,transactionHash}),/another action/)
await assert.rejects(()=>store.read(reservation.agreementId,'dev_otherproject',reservation.requestId),/not found/)
// Unknown extra fields (especially session tokens) are not serialized.
assert.equal(JSON.stringify(row).includes('userToken'),false)
row=undefined
await store.reserve({...reservation,userToken:'must-not-be-stored',call:{...reservation.call,userToken:'must-not-be-stored'}})
assert.equal(JSON.stringify(row).includes('must-not-be-stored'),false)
const before=mutations
await assert.rejects(()=>store.reserve({...reservation,call:{...reservation.call,chainId:5042002}}),/Invalid prepared/)
assert.equal(mutations,before)
console.log('Arc Trade execution store smoke passed: concurrent reserve, stable retry keys, immutable actions, pending recovery, chain reconciliation, terminal replay and token exclusion. In-memory store adapter; no provider calls.')
