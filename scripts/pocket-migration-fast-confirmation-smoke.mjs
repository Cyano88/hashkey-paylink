import assert from 'node:assert/strict'
import { verifyMigrationReceipt } from '../api/pocket/wallet-migration-receipt.ts'
const tx='0x'+'a'.repeat(64), bh='0x'+'b'.repeat(64), other='0x'+'c'.repeat(64)
const source='0x'+'1'.repeat(40), target='0x'+'2'.repeat(40)
const topic=a=>'0x'+'0'.repeat(24)+a.slice(2)
for (const [network,token] of [['base','0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'],['arbitrum','0xaf88d065e77c8cc2239327c5edb3a432268e5831']]) {
 const row={network,source:{walletId:'old',address:source},target:{walletId:'new',address:target},units:'2000000'}
 const log={address:token,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topic(source),topic(target)],data:'0x'+(2000000n).toString(16).padStart(64,'0')}
 const receipt={status:'0x1',transactionHash:tx,blockNumber:'0xa',blockHash:bh,logs:[log]}
 const block={number:'0xa',hash:bh,timestamp:'0x64'}, head={number:'0xc',hash:other,timestamp:'0x73'}
 let calls=0
 const reader=(overrides={})=>async(n,m,p)=>{calls++;assert.equal(n,network);assert.ok(m==='eth_getTransactionReceipt'||p[0]==='latest'||p[0]==='0xa');return m==='eth_getTransactionReceipt'?('receipt' in overrides?overrides.receipt:receipt):p[0]==='latest'?('head' in overrides?overrides.head:head):('block' in overrides?overrides.block:block)}
 const io={resolveChallenge:async()=>({walletId:'old',transactionHash:tx}),privateRpc:reader(),publicRpc:reader()}
 assert.equal((await verifyMigrationReceipt(row,{challengeId:'saved'},io)).transactionHash,tx)
 assert.equal(calls,6)
 for (const override of [{receipt:null},{receipt:{...receipt,status:'0x0'}},{receipt:{...receipt,transactionHash:other}},{receipt:{...receipt,logs:[]}},{receipt:{...receipt,logs:[{...log,address:target}]}},{receipt:{...receipt,logs:[{...log,removed:true}]}},{receipt:{...receipt,logs:[{...log,data:'0x'+'0'.repeat(64)}]}},{receipt:{...receipt,logs:[{...log,topics:[log.topics[0],topic(target),topic(source)]}]}},{block:{...block,hash:other}},{head:null},{head:{...head,number:'0xb'}},{head:{...head,timestamp:'0x72'}},{head:{...head,timestamp:undefined}}]) {
  assert.equal(await verifyMigrationReceipt(row,{challengeId:'saved'},{...io,publicRpc:reader(override)}),null)
  assert.equal(await verifyMigrationReceipt(row,{challengeId:'saved'},{...io,privateRpc:reader(override)}),null)
 }
 assert.equal(await verifyMigrationReceipt(row,{challengeId:'saved'},{...io,publicRpc:reader({receipt:{...receipt,blockHash:other},block:{...block,hash:other}})}),null,'individually valid fork must not pass quorum')
 await assert.rejects(verifyMigrationReceipt(row,{challengeId:'saved'},{...io,privateRpc:async()=>{throw Error('private unavailable')}}),/private unavailable/)
 calls=0
 assert.equal(await verifyMigrationReceipt(row,{challengeId:'saved'},{...io,resolveChallenge:async()=>null}),null)
 assert.equal(await verifyMigrationReceipt(row,{challengeId:'saved'},{...io,resolveChallenge:async()=>({walletId:'other',transactionHash:tx})}),null)
 assert.equal(calls,0)
}
console.log('PASS: Base and Arbitrum exact USDC quorum, two-block and 15-second boundaries, missing/reverted/wrong receipts, fork disagreement, provider outage and Circle ownership guards.')

const {verifyMigrationActivationReceipts}=await import('../api/pocket/wallet-migration-receipt.ts')
const plan={rows:[{network:'base',units:'1'},{network:'arbitrum',units:'1'},{network:'arc',units:'0'}],transfers:{base:{state:'confirmed',transactionHash:tx},arbitrum:{state:'confirmed',transactionHash:tx}}}
let rechecks=0
assert.equal(await verifyMigrationActivationReceipts(plan,async()=>{rechecks++;return {transactionHash:tx,confirmedAt:100}}),true)
assert.equal(rechecks,2,'empty Arc does not require a transfer')
assert.equal(await verifyMigrationActivationReceipts(plan,async(row)=>row.network==='base'?{transactionHash:tx,confirmedAt:100}:null),false)
assert.equal(await verifyMigrationActivationReceipts(plan,async()=>({transactionHash:other,confirmedAt:100})),false)
assert.equal(await verifyMigrationActivationReceipts({...plan,transfers:{...plan.transfers,arbitrum:{state:'reserved'}}},async()=>({transactionHash:tx,confirmedAt:100})),false)
console.log('PASS: activation rechecks both saved receipts and blocks disappeared, changed or incomplete confirmations.')
