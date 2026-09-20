import assert from 'node:assert/strict'
import { inspectMigrationReceipt, verifyMigrationReceipt } from '../api/pocket/wallet-migration-receipt.ts'
const tx='0x'+'a'.repeat(64), bh='0x'+'b'.repeat(64)
const source='0x1111111111111111111111111111111111111111', target='0x2222222222222222222222222222222222222222'
const row={network:'base',source:{walletId:'old',address:source},target:{walletId:'new',address:target},units:'2000000'}
const topic=a=>'0x'+'0'.repeat(24)+a.slice(2), amount=n=>'0x'+n.toString(16).padStart(64,'0')
const log={address:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topic(source),topic(target)],data:amount(2000000n)}
const receipt={status:'0x1',transactionHash:tx,blockNumber:'0xa',blockHash:bh,logs:[log]}
const block={number:'0xa',hash:bh,timestamp:'0x64'}, final={number:'0xb',hash:'0x'+'c'.repeat(64)}
assert.equal(inspectMigrationReceipt(row,tx,receipt,block,final).confirmedAt,100000)
for(const changed of [{status:'0x0'},{transactionHash:bh},{blockHash:tx},{logs:[]},{logs:[{...log,removed:true}]},{logs:[{...log,data:amount(1999999n)}]},{logs:[{...log,data:amount(2000001n)}]},{logs:[{...log,address:target}]},{logs:[{...log,topics:[log.topics[0],topic(target),topic(source)]}]}]) assert.equal(inspectMigrationReceipt(row,tx,{...receipt,...changed},block,final),null)
assert.equal(inspectMigrationReceipt(row,tx,receipt,block,{...final,number:'0x9'}),null)
assert.equal(inspectMigrationReceipt(row,tx,receipt,{...block,hash:tx},final),null)
assert.equal(inspectMigrationReceipt(row,tx,receipt,block,null),null)
const arcLog={...log,address:'0xfffffffffffffffffffffffffffffffffffffffe',data:amount(2000000n*1000000000000n)}
assert.ok(inspectMigrationReceipt({...row,network:'arc'},tx,{...receipt,logs:[arcLog]},block,final))
assert.equal(inspectMigrationReceipt({...row,network:'arc'},tx,{...receipt,logs:[{...arcLog,data:amount(2000000n*1000000000000n+1n)}]},block,final),null)
let calls=0
assert.equal(await verifyMigrationReceipt(row,{challengeId:'saved'},{resolveChallenge:async()=>({walletId:'other',transactionHash:tx}),rpc:async()=>{calls++;throw Error('unexpected')}}),null)
assert.equal(calls,0)
const methods=[]
const proof=await verifyMigrationReceipt(row,{challengeId:'saved'},{resolveChallenge:async id=>{assert.equal(id,'saved');return {walletId:'old',transactionHash:tx}},rpc:async(_network,method,params)=>{methods.push(method);return method==='eth_getTransactionReceipt'?receipt:params[0]==='finalized'?final:block}})
assert.equal(proof.transactionHash,tx)
assert.equal(methods.length,3)
console.log('PASS: exact finalized transfer, correct token/sender/recipient, reverted receipt, reorg, wrong transaction, Arc precision, challenge ownership and bounded RPC reads. Synthetic only.')

let publicCalls=0
const stalePrimary=async(_network,method,params)=>method==='eth_getTransactionReceipt'?receipt:params[0]==='finalized'?{...final,number:'0x9'}:block
const freshPublic=async(_network,method,params)=>{publicCalls++;return method==='eth_getTransactionReceipt'?receipt:params[0]==='finalized'?final:block}
const finalityIo={resolveChallenge:async()=>({walletId:'old',transactionHash:tx}),rpc:stalePrimary,publicRpc:freshPublic}
assert.equal((await verifyMigrationReceipt(row,{challengeId:'saved'},finalityIo)).transactionHash,tx)
assert.equal(publicCalls,3)
assert.equal(await verifyMigrationReceipt(row,{challengeId:'saved'},{...finalityIo,publicRpc:stalePrimary}),null)
assert.equal(await verifyMigrationReceipt(row,{challengeId:'saved'},{...finalityIo,publicRpc:async(n,m,p)=>m==='eth_getBlockByNumber'&&p[0]!=='finalized'?{...block,hash:tx}:freshPublic(n,m,p)}),null)
assert.equal(await verifyMigrationReceipt(row,{challengeId:'saved'},{...finalityIo,publicRpc:async(n,m,p)=>m==='eth_getTransactionReceipt'?{...receipt,logs:[]}:freshPublic(n,m,p)}),null)
await assert.rejects(verifyMigrationReceipt(row,{challengeId:'saved'},{...finalityIo,publicRpc:async()=>{throw Error('Provider unavailable')}}),/Provider unavailable/)
publicCalls=0
assert.equal(await verifyMigrationReceipt(row,{challengeId:'saved'},{...finalityIo,rpc:async(n,m,p)=>m==='eth_getTransactionReceipt'?{...receipt,logs:[]}:stalePrimary(n,m,p)}),null)
assert.equal(publicCalls,0,'invalid primary transfer cannot trigger alternative confirmation')
console.log('PASS: lagging finalized tag uses independent canonical receipt and finalized height; both lagging, reorg, wrong transfer, outage and invalid primary evidence stay blocked.')
