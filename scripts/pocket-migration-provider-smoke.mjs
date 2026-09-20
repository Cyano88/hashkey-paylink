import assert from 'node:assert/strict'
import { decodeFunctionData,parseAbi } from 'viem'
import {createMigrationProvider,migrationCallData,migrationChallengeBody,migrationChallengeFingerprint} from '../api/pocket/wallet-migration-provider.ts'
import {feeQuoteMatches} from '../api/pocket/wallet-migration-service.ts'
const id='11111111-1111-4111-8111-111111111111',txid='22222222-2222-4222-8222-222222222222'
const row={network:'base',source:{walletId:'source',address:'0x1111111111111111111111111111111111111111'},target:{walletId:'target',address:'0x2222222222222222222222222222222222222222'},units:'2000000'}
const token={id,blockchain:'BASE',tokenAddress:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'}
const calls=[]
const json=async(network,path,body)=>{
 calls.push({network,path,body})
 if(path.endsWith('/source')||path.endsWith('/target')){const w=path.endsWith('/source')?row.source:row.target;return {wallet:{id:w.walletId,address:w.address,blockchain:'BASE',accountType:'SCA',state:'LIVE'}}}
 if(path.includes('/balances?'))return {tokenBalances:path.includes('pageAfter=')?[]:[{amount:'2',token}]}
 if(path.includes('/transactions?'))return {transactions:[]}
 if(path.endsWith('/estimateFee'))return {high:{networkFee:'0.00001'}}
 if(path.endsWith('/contractExecution'))return {challengeId:id}
 if(path.includes('/challenges/'))return {challenge:{id,correlationIds:[txid]}}
 if(path.endsWith('/'+txid))return {transaction:{id:txid,walletId:'source',blockchain:'BASE',state:'COMPLETE',contractAddress:row.source.address,callData:migrationCallData(row),txHash:'0x'+'a'.repeat(64)}}
 throw Error('Unexpected provider call')
}
const provider=createMigrationProvider('synthetic',json)
const inventory=await provider.inventory(row)
assert.equal(inventory.otherAssets.length,0)
assert.equal(calls.filter(c=>c.path.includes('/balances?')).length,2)
assert.ok(calls.filter(c=>c.path.includes('/balances?')).every(c=>c.path.includes('includeAll=true')))
assert.equal(await provider.noPending(row),true)
assert.equal((await provider.estimate(row)).asset,'ETH')
assert.equal((await provider.createChallenge(row,id)).challengeId,id)
const sent=calls.find(c=>c.body?.idempotencyKey)
assert.equal(sent.body.walletId,'source')
const batch=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:sent.body.callData})
assert.equal(batch.args[0].length,1)
const transfer=decodeFunctionData({abi:parseAbi(['function transfer(address to,uint256 amount) returns (bool)']),data:batch.args[0][0].data})
assert.equal(transfer.args[0].toLowerCase(),row.target.address)
assert.equal(transfer.args[1],2000000n)
assert.equal((await provider.resolveChallenge(row,id)).walletId,'source')
const altered=createMigrationProvider('synthetic',async(n,p,b)=>p.endsWith('/'+txid)?{transaction:{...(await json(n,p,b)).transaction,walletId:'other-wallet'}}:json(n,p,b))
assert.equal(await altered.resolveChallenge(row,id),null)
const pending=createMigrationProvider('synthetic',async()=>({transactions:[{state:'SENT'}]}))
assert.equal(await pending.noPending(row),false)
const invalid=createMigrationProvider('synthetic',async()=>({}))
await assert.rejects(invalid.inventory(row),/ownership/)
await assert.rejects(invalid.noPending(row),/unavailable/)
const repeated=createMigrationProvider('synthetic',async(n,p,b)=>p.includes('/balances?')?{tokenBalances:[{amount:'2',token}]}:json(n,p,b))
await assert.rejects(repeated.inventory(row),/inconsistent/)
const other=createMigrationProvider('synthetic',async(n,p,b)=>p.includes('/balances?')?{tokenBalances:p.includes('pageAfter=')?[]:[{amount:'1',token:{...token,tokenAddress:row.target.address}}]}:json(n,p,b))
assert.equal((await other.inventory(row)).otherAssets.length,1)
const plan={userId:'owner',revision:'r'},fee={amount:'0.1',asset:'ETH'}
const quote={id,userId:'owner',revision:'r',network:'base',units:row.units,sourceId:'source',targetId:'target',amount:'0.1',asset:'ETH',expiresAt:200}
assert.equal(feeQuoteMatches(quote,plan,row,fee,100),true)
for(const bad of [{userId:'other'},{revision:'stale'},{network:'arc'},{units:'1'},{sourceId:'other'},{targetId:'other'},{expiresAt:99},{asset:'USDC'},{amount:'0.01'}])assert.equal(feeQuoteMatches({...quote,...bad},plan,row,fee,100),false)
console.log('PASS: exact transfer calldata, provider ownership, full inventory pagination, other assets, pending transactions, fee binding and saved challenge resolution. No live provider calls or transfers.')

let challenge={id,status:'PENDING',correlationIds:[txid]}, transaction={id:txid,walletId:'source',blockchain:'BASE',state:'INITIATED',contractAddress:row.source.address}
const inspector=createMigrationProvider('synthetic',async(n,p,b)=>p.includes('/challenges/')?{challenge}:p.endsWith('/'+txid)?{transaction}:json(n,p,b))
assert.equal(await inspector.inspectChallenge(row,id),'approval_required')
challenge={...challenge,errorCode:155121}
assert.equal(await inspector.inspectChallenge(row,id),'needs_review')
delete challenge.errorCode;challenge.status='IN_PROGRESS'
assert.equal(await inspector.inspectChallenge(row,id),'pending')
challenge.status='PENDING';transaction={...transaction,walletId:'other'}
assert.equal(await inspector.inspectChallenge(row,id),'needs_review')
transaction={...transaction,walletId:'source',state:'FAILED'}
assert.equal(await inspector.inspectChallenge(row,id),'needs_review')
transaction={...transaction,state:'SENT',txHash:'0x'+'a'.repeat(64)}
assert.equal(await inspector.inspectChallenge(row,id),'pending')
challenge={...challenge,id:txid}
await assert.rejects(inspector.inspectChallenge(row,id),/match/)
console.log('PASS: provider resume status checks reject expired, failed, mismatched and uncertain challenges. Read-only synthetic checks.')

assert.deepEqual(migrationChallengeBody(row,id),sent.body)
assert.equal(migrationChallengeFingerprint(row,id),migrationChallengeFingerprint(structuredClone(row),id))
for(const changed of [{...row,units:'1'},{...row,target:{...row.target,address:row.source.address}},{...row,source:{...row.source,walletId:'other'}},{...row,network:'arbitrum'}])assert.notEqual(migrationChallengeFingerprint(changed,id),migrationChallengeFingerprint(row,id))
assert.notEqual(migrationChallengeFingerprint(row,txid),migrationChallengeFingerprint(row,id))
console.log('PASS: provider replay fingerprint binds network, exact calldata, source wallet and original idempotency key.')
