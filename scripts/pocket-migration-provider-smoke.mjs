import assert from 'node:assert/strict'
import { decodeFunctionData,parseAbi } from 'viem'
import {migrationNextPage,createMigrationProvider,migrationCallData,migrationChallengeBody,migrationChallengeFingerprint} from '../api/pocket/wallet-migration-provider.ts'
import {feeQuoteMatches} from '../api/pocket/wallet-migration-service.ts'
const id='11111111-1111-4111-8111-111111111111',txid='22222222-2222-4222-8222-222222222222'
const row={network:'base',source:{walletId:'source',address:'0x1111111111111111111111111111111111111111'},target:{walletId:'target',address:'0x2222222222222222222222222222222222222222'},units:'2000000'}
const token={id,blockchain:'BASE',tokenAddress:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'}
const calls=[]
const json=async(network,path,body)=>{
 calls.push({network,path,body})
 if(path.endsWith('/source')||path.endsWith('/target')){const w=path.endsWith('/source')?row.source:row.target;return {wallet:{id:w.walletId,address:w.address,blockchain:'BASE',accountType:'SCA',state:'LIVE'}}}
 if(path.includes('/balances?'))return {tokenBalances:path.includes('pageAfter=')?[]:[{amount:'2',token}],migrationPageLink:path.includes('pageAfter=')?null:'<https://api.circle.com'+path+'&pageAfter='+txid+'>; rel="next"'}
 if(path.includes('/transactions?'))return {transactions:[],migrationPageLink:null}
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
const pending=createMigrationProvider('synthetic',async()=>({transactions:[{id:txid,walletId:'source',blockchain:'BASE',state:'SENT'}],migrationPageLink:null}))
assert.equal(await pending.noPending(row),false)
const invalid=createMigrationProvider('synthetic',async()=>({}))
await assert.rejects(invalid.inventory(row),/ownership/)
await assert.rejects(invalid.noPending(row),/unavailable/)
const repeated=createMigrationProvider('synthetic',async(n,p,b)=>p.includes('/balances?')?{tokenBalances:[{amount:'2',token}],migrationPageLink:'<https://api.circle.com/v1/w3s/wallets/source/balances?includeAll=true&pageSize=50&pageAfter='+txid+'>; rel="next"'}:json(n,p,b))
await assert.rejects(repeated.inventory(row),/inconsistent/)
const other=createMigrationProvider('synthetic',async(n,p,b)=>p.includes('/balances?')?{tokenBalances:[{amount:'1',token:{...token,tokenAddress:row.target.address}}],migrationPageLink:null}:json(n,p,b))
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
assert.equal(await inspector.inspectChallenge(row,id),'expired')
challenge.status='IN_PROGRESS'
await assert.rejects(inspector.inspectChallenge(row,id),/uncertain transaction status/)
challenge.status='PENDING'
delete challenge.errorCode;challenge.status='IN_PROGRESS'
assert.equal(await inspector.inspectChallenge(row,id),'pending')
challenge.status='PENDING';transaction={...transaction,walletId:'other'}
await assert.rejects(inspector.inspectChallenge(row,id),/does not match/)
transaction={...transaction,walletId:'source',state:'FAILED'}
await assert.rejects(inspector.inspectChallenge(row,id),/failed/)
transaction={...transaction,state:'SENT',txHash:'0x'+'a'.repeat(64)}
assert.equal(await inspector.inspectChallenge(row,id),'pending')
challenge={...challenge,id:txid}
await assert.rejects(inspector.inspectChallenge(row,id),/match/)
challenge={id,status:'PENDING',correlationIds:[]}
await assert.rejects(inspector.inspectChallenge(row,id),/transaction reference/)
challenge={id,status:'PENDING',correlationIds:[txid],errorCode:155123,errorMessage:'sensitive provider detail'}
await assert.rejects(inspector.inspectChallenge(row,id),error=>error.message.includes('155123')&&!error.message.includes('sensitive provider detail'))
challenge={id,status:'COMPLETE',correlationIds:[txid]}
await assert.rejects(inspector.inspectChallenge(row,id),/no longer pending/)
console.log('PASS: provider resume status checks reject expired, failed, mismatched and uncertain challenges. Read-only synthetic checks.')

assert.deepEqual(migrationChallengeBody(row,id),sent.body)
assert.equal(migrationChallengeFingerprint(row,id),migrationChallengeFingerprint(structuredClone(row),id))
for(const changed of [{...row,units:'1'},{...row,target:{...row.target,address:row.source.address}},{...row,source:{...row.source,walletId:'other'}},{...row,network:'arbitrum'}])assert.notEqual(migrationChallengeFingerprint(changed,id),migrationChallengeFingerprint(row,id))
assert.notEqual(migrationChallengeFingerprint(row,txid),migrationChallengeFingerprint(row,id))
console.log('PASS: provider replay fingerprint binds network, exact calldata, source wallet and original idempotency key.')

// Regression: a final balance page must not invent a cursor from token.id.
let balanceReads=0
const lastPage=createMigrationProvider('synthetic',async(n,p,b)=>{
 if(p.includes('/balances?')){balanceReads++;assert.equal(p.includes('pageAfter='),false);return {tokenBalances:[{amount:'2',token}],migrationPageLink:null}}
 return json(n,p,b)
})
await lastPage.inventory(row);assert.equal(balanceReads,1)
const path='/v1/w3s/transactions?walletIds=source&includeAll=true&pageSize=50'
const next='<https://api.circle.com'+path+'&pageAfter='+id+'>; rel="next"'
assert.ok(migrationNextPage({migrationPageLink:next},path).includes('pageAfter='+id))
assert.throws(()=>migrationNextPage({},path),/unavailable/)
for(const link of [next.replace('api.circle.com','evil.example'),next.replace('walletIds=source','walletIds=other'),next.replace('includeAll=true','includeAll=false'),next.replace('/transactions?','/wallets?')])assert.throws(()=>migrationNextPage({migrationPageLink:link},path),/pagination/)
for(const state of ['STUCK','CONFIRMED','INITIATED','CLEARED','QUEUED','SENT','UNKNOWN']){
 let reads=0
 const scan=createMigrationProvider('synthetic',async(n,p)=>{
  assert.equal(new URL(p,'https://api.circle.com').searchParams.has('state'),false)
  reads++
  return reads===1?{transactions:[{id,walletId:'source',blockchain:'BASE',state:'COMPLETE'}],migrationPageLink:next}:{transactions:[{id:txid,walletId:'source',blockchain:'BASE',state}],migrationPageLink:null}
 })
 assert.equal(await scan.noPending(row),false);assert.equal(reads,2)
}
const terminal=createMigrationProvider('synthetic',async()=>({transactions:[{id,walletId:'source',blockchain:'BASE',state:'FAILED'}],migrationPageLink:null}))
assert.equal(await terminal.noPending(row),true)
const missingPages=createMigrationProvider('synthetic',async()=>({transactions:[]}))
await assert.rejects(missingPages.noPending(row),/pagination/)
console.log('PASS: provider Link cursors, final inventory page, pagination scope, later-page pending and unknown states, and missing metadata fail closed.')

// An expired approval can retire only when history is quiet since reservation.
let historyTx={id:txid,walletId:'source',blockchain:'BASE',state:'COMPLETE',createDate:'2026-01-01T00:00:00Z'}
const quiet=createMigrationProvider('synthetic',async()=>({transactions:[historyTx],migrationPageLink:null}))
const since=Date.parse('2026-02-01T00:00:00Z')
assert.equal(await quiet.noPending(row,since),true)
for(const change of [{createDate:'2026-02-01T00:00:00Z'},{createDate:undefined},{createDate:'invalid'},{state:'INITIATED'},{state:'STUCK'}]){const old=historyTx;historyTx={...old,...change};assert.equal(await quiet.noPending(row,since),false);historyTx=old}
console.log('PASS: expiry retirement history blocks recent, pending and undated activity.')
