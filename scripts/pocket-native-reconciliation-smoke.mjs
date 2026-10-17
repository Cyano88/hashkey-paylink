import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
process.env.CIRCLE_POCKET_ACTION_STORE=join(await mkdtemp(join(tmpdir(),'pocket-native-recovery-')),'actions.json')
process.env.POCKET_SWAP_QUOTE_SECRET='native-background-fixture-secret-'.repeat(3)
const {reconcileNativeSend}=await import('../api/pocket/native-send-reconciliation.ts')
const {quoteNativeSend,sealNativeSend}=await import('../api/pocket/native-send-quote.ts')
const {recordCirclePocketAction}=await import('../api/circle-pocket-action-journal.ts')
const {runPocketReconciliation}=await import('../api/pocket/reconciliation-worker.ts')
const {EVM_PLATFORM_TREASURY}=await import('../src/lib/platformFees.ts')
const wallet='0x'+'1'.repeat(40),recipient='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64)
const q=await quoteNativeSend({ownerId:'owner',network:'base',walletId:'wallet',walletAddress:wallet,recipient,amount:'0.01'},async()=> '0.0001')
let record={id:'native',ownerId:'owner',action:'wallet.native-send',idempotencyKey:'pocket:native-send:'+q.id,status:'submitted',metadata:{network:'base',quoteToken:sealNativeSend(q),txHash:hash,amount:q.amount},createdAt:1,updatedAt:1}
const validTrace={type:'CALL',to:wallet,input:q.callData,calls:[{type:'CALL',from:wallet,to:recipient,input:'0x',value:'0x'+BigInt(q.amountUnits).toString(16)},{type:'CALL',from:wallet,to:EVM_PLATFORM_TREASURY,input:'0x',value:'0x'+BigInt(q.feeUnits).toString(16)}]}
let trace=validTrace,block=hash,chain='0x2105',saved=0
const deps={rpc:async(_network,method)=>({eth_chainId:chain,eth_getTransactionReceipt:{status:'0x1',transactionHash:hash,blockHash:hash,blockNumber:'0x10'},eth_getBlockByNumber:{hash:block},debug_traceTransaction:trace}[method]),record:async input=>{saved++;return input}}
assert.equal((await reconcileNativeSend({...record,metadata:{...record.metadata,txHash:undefined}},{...deps,rpc:async()=>assert.fail('Unsigned EVM recovery must not read RPC')})).status,'pending')
chain='0x1';await assert.rejects(()=>reconcileNativeSend(record,deps),/network mismatch/);chain='0x2105'
block='0x'+'b'.repeat(64);assert.equal((await reconcileNativeSend(record,deps)).status,'pending');block=hash
trace={type:'CALL',calls:[]};assert.equal((await reconcileNativeSend(record,deps)).status,'pending');assert.equal(saved,0)
trace=validTrace;assert.equal((await reconcileNativeSend(record,deps)).status,'completed');assert.equal(saved,1)
await assert.rejects(()=>reconcileNativeSend({...record,ownerId:'someone-else'},deps))
await assert.rejects(()=>reconcileNativeSend({...record,idempotencyKey:'different'},deps),/reference mismatch/)
const durable=await recordCirclePocketAction(record)
await assert.rejects(()=>recordCirclePocketAction({...durable,metadata:{...durable.metadata,txHash:'0x'+'b'.repeat(64)}}),/evidence cannot change/)
const terminal=await recordCirclePocketAction({...durable,status:'completed'})
assert.equal((await recordCirclePocketAction({...durable,status:'submitted'})).status,'completed')
const records=['error','pending','completed','failed'].map(id=>({...record,id}))
const seen=[]
const result=await runPocketReconciliation({executions:{listUnresolved:async()=>[]},auditXLayerBilling:async()=>{},listBridges:async action=>action==='wallet.native-send'?records:[],reconcileNative:async r=>{seen.push(r.id);if(r.id==='error')throw Error('RPC offline');return {status:r.id}},sendEmail:async()=>assert.fail('No fixture email')})
assert.deepEqual(seen,['error','pending','completed','failed']);assert.equal(result.errors,1);assert.equal(result.reconciled,2);assert.equal(result.unchanged,1)
const swapRecord={...record,action:'wallet.native-swap',idempotencyKey:'pocket:native-swap:test'}
const swapSaved=await recordCirclePocketAction(swapRecord)
await assert.rejects(()=>recordCirclePocketAction({...swapSaved,metadata:{...swapSaved.metadata,txHash:'0x'+'b'.repeat(64)}}),/evidence cannot change/)
console.log('PASS native send and swap background recovery: saved proof only, chain/owner/reference checks, canonical receipt and exact calls, immutable hash, terminal monotonicity, worker error isolation')
