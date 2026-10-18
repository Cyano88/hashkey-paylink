import assert from 'node:assert/strict'
import {decodeFunctionData} from 'viem'
import {fixture,owner,wallet,hash} from './fixtures/native-evm-swap.mjs'
import {validateNativeEvmSwap,nativeSwapBatch,NATIVE_SWAP_BATCH_ABI,quoteNativeEvmSwap,sealNativeEvmSwap,openNativeEvmSwap} from '../api/pocket/native-evm-swap-quote.ts'
import {nativeSwapOutput,reconcileNativeEvmSwap} from '../api/pocket/native-evm-swap-reconciliation.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='native-evm-swap-fixture-'.repeat(3)
let count=0
for(const network of ['ethereum','base','arbitrum','polygon'])for(const stable of ['USDC','USDT'])for(const reverse of [false,true]){
 const {q,trace,out,now}=await fixture(network,reverse,stable);count++
 assert.equal(q.feeUnits,'15000000000000');assert.equal(nativeSwapOutput(q,trace),out)
 const calls=decodeFunctionData({abi:NATIVE_SWAP_BATCH_ABI,data:q.callData}).args[0];assert.equal(calls.length,reverse?5:2)
 const token=sealNativeEvmSwap(q);assert.deepEqual(openNativeEvmSwap(token,owner,false,now),JSON.parse(JSON.stringify(q)))
 assert.throws(()=>openNativeEvmSwap(token,'other'));assert.throws(()=>openNativeEvmSwap(token+'x',owner));assert.throws(()=>openNativeEvmSwap(token,owner,false,now+45001));assert.ok(openNativeEvmSwap(token,owner,true,now+45001))
 for(const mutate of [x=>x.tx.to=wallet,x=>x.tx.from='0x'+'2'.repeat(40),x=>x.spender=wallet,x=>x.tx.value='2',x=>x.minimumOutUnits='1',x=>x.from='SOL',x=>x.feeUnits='0',x=>x.tx.data+='00',x=>x.walletAddress='0x'+'3'.repeat(40)]){const bad=structuredClone(q);mutate(bad);assert.throws(()=>validateNativeEvmSwap(bad,false,now))}
 const reverted=structuredClone(trace);reverted.error='reverted';assert.equal(nativeSwapOutput(q,reverted),null)
 const missing=structuredClone(trace);missing.calls.pop();assert.equal(nativeSwapOutput(q,missing),null)
 const noOutput=structuredClone(trace);for(const c of noOutput.calls){delete c.logs;delete c.calls}assert.equal(nativeSwapOutput(q,noOutput),null)
 const record={id:'fixture',ownerId:owner,idempotencyKey:'pocket:native-swap:'+q.id,action:'wallet.native-swap',status:'submitted',metadata:{network,quoteToken:token,txHash:hash}}
 let saved=null
 const deps={rpc:async(_n,method)=>({eth_chainId:'0x'+({base:8453,ethereum:1,arbitrum:42161,polygon:137}[network]).toString(16),eth_getTransactionReceipt:{status:'0x1',blockHash:hash,transactionHash:hash,blockNumber:'0x10'},eth_getBlockByNumber:{hash},debug_traceTransaction:trace}[method]),record:async input=>{saved=input;return input}}
 assert.equal((await reconcileNativeEvmSwap(record,deps)).status,'completed');assert.ok(saved.metadata.amountOut)
 assert.equal((await reconcileNativeEvmSwap(record,{...deps,rpc:async(n,m,p)=>m==='debug_traceTransaction'?noOutput:deps.rpc(n,m,p)})).status,'pending')
}
const {q:rounded,binding,provider,response}=await fixture()
rounded.expectedOutUnits='1000001';assert.ok(validateNativeEvmSwap(rounded));rounded.expectedOutUnits='1000002';assert.throws(()=>validateNativeEvmSwap(rounded))
let rising=0;await assert.rejects(()=>quoteNativeEvmSwap(binding,async()=> String(++rising),provider),/fees changed|details changed/)
const bad=structuredClone(response);bad.tx.minReceiveAmount='1';await assert.rejects(()=>quoteNativeEvmSwap(binding,async()=> '0.00001',async()=>bad))
console.log('PASS '+count+' EVM swap directions: exact calldata/batch/approval/fee, sealed owner and expiry, malicious mutation rejection, exact onchain output and reimbursement proof')
