import assert from 'node:assert/strict'
import {decodeFunctionData,encodeFunctionData,formatUnits,parseAbi} from 'viem'
import {quoteEvmBridgeFee,sealEvmBridgeFee,openEvmBridgeFee,refreshEvmBridgeFee} from '../api/pocket/evm-bridge-reimbursement.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='synthetic-bridge-test-key-not-production-123456789'
const batch=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const transfer=parseAbi(['function transfer(address to,uint256 amount) returns(bool)'])
const token='0x1111111111111111111111111111111111111111',wallet='0x2222222222222222222222222222222222222222',destinationAddress='0x3333333333333333333333333333333333333333'
const calls=[{target:token,value:0n,data:'0x12345678'}]
const bridgeCallData=encodeFunctionData({abi:batch,functionName:'executeBatch',args:[calls]})
const now=100000,rate=3000n*100000000n
let count=0
for(const source of ['base','arbitrum','ethereum','polygon','arc'])for(const asset of ['USDC','USDT'])for(const xlayer of [false,true]){
 if(source==='arc'&&asset==='USDT')continue
 if(xlayer&&asset==='USDT'&&source!=='base')continue
 const binding={ownerId:'owner',walletId:'wallet',walletAddress:wallet,source,destination:xlayer?'xlayer':source==='base'?'arbitrum':'base',destinationAddress,asset,tokenAddress:token,amountUnits:'1000000',bridgeDebitUnits:'1010000'}
 const q=await quoteEvmBridgeFee({...binding,bridgeCallData,providerExpiresAt:now+60000},async data=>{assert.equal(decodeFunctionData({abi:batch,data}).args[0].length,2);return '0.000001'},rate,now)
 assert.equal(q.networkFeeUnits,'3000');assert.equal(q.totalUnits,'1013000');assert.equal(q.expiresAt,now+30000)
 const decoded=decodeFunctionData({abi:batch,data:q.callData}).args[0]
 assert.deepEqual(decoded.slice(0,1),calls)
 const recovery=decodeFunctionData({abi:transfer,data:decoded[1].data})
 assert.equal(recovery.args[0].toLowerCase(),EVM_PLATFORM_TREASURY.toLowerCase());assert.equal(recovery.args[1],3000n)
 const sealed=sealEvmBridgeFee(q);assert.deepEqual(openEvmBridgeFee(sealed,binding,now),q)
 for(const [field,value]of Object.entries({ownerId:'other',walletId:'other',walletAddress:destinationAddress,destinationAddress:wallet,amountUnits:'2000000',asset:asset==='USDC'?'USDT':'USDC',tokenAddress:wallet,bridgeDebitUnits:'1010001'}))assert.throws(()=>openEvmBridgeFee(sealed,{...binding,[field]:value},now))
 assert.throws(()=>openEvmBridgeFee(sealed,binding,q.expiresAt))
 assert.throws(()=>openEvmBridgeFee(sealed+'x',binding,now))
 assert.throws(()=>openEvmBridgeFee(sealEvmBridgeFee({...q,callData:bridgeCallData}),binding,now))
 const lower=await refreshEvmBridgeFee(q,async()=> '0.0000005',rate,now)
 assert.equal(lower.networkFeeUnits,'1500');assert.equal(lower.totalUnits,'1011500')
 await assert.rejects(()=>refreshEvmBridgeFee(q,async()=> '0.000002',rate,now),/increased/)
 await assert.rejects(()=>quoteEvmBridgeFee({...binding,bridgeCallData,providerExpiresAt:now-1},async()=> '0.000001',rate,now))
 let i=0;const fluctuating=await quoteEvmBridgeFee({...binding,bridgeCallData,providerExpiresAt:now+60000},async()=>++i%2?'0.000001':'0.000002',rate,now);assert.equal(fluctuating.networkFeeUnits,'6000');assert.equal(i,3)
 let rising=0;await assert.rejects(()=>quoteEvmBridgeFee({...binding,bridgeCallData,providerExpiresAt:now+60000},async()=> '0.00000'+(++rising),rate,now),/estimate changed/)
 count++
}
const blocked={ownerId:'owner',walletId:'wallet',walletAddress:wallet,source:'base',destination:'xlayer',destinationAddress,asset:'USDC',tokenAddress:token,amountUnits:'1000000',bridgeDebitUnits:'1000000',bridgeCallData,providerExpiresAt:now+60000}
let budgetCalls=0
await assert.rejects(()=>quoteEvmBridgeFee(blocked,async()=>{budgetCalls++;return '0.000001'},rate,now,1000000n),e=>e.status===422&&/Insufficient USDC/.test(e.message))
assert.equal(budgetCalls,0,'Known insufficient debit must not reach provider simulation')
await assert.rejects(()=>quoteEvmBridgeFee(blocked,async()=>{budgetCalls++;return '0.000001'},rate,now,1002000n),e=>e.status===422&&/network fee/.test(e.message))
assert.equal(budgetCalls,1,'Reimbursement shortfall must be checked before simulating the final batch')
// Captured read-only Circle Arbitrum estimates: previously exhausted all four passes.
const observed=['0.00001354560025','0.00001354953811575','0.00001355436499235','0.00001356010230575']
let liveCalls=[]
const drift=await quoteEvmBridgeFee({...blocked,source:'arbitrum',destination:'base'},async data=>{liveCalls.push(data);return observed[liveCalls.length-1]},rate,now)
assert.equal(liveCalls.length,2);assert.equal(drift.networkFeeUnits,'40637')
assert.equal(drift.callData,liveCalls.at(-1),'The exact returned batch was estimated successfully')
assert.equal(decodeFunctionData({abi:transfer,data:decodeFunctionData({abi:batch,data:drift.callData}).args[0].at(-1).data}).args[1],40637n,'Drift is absorbed, never added to the user fee')
// Tiny fees get no rounded-up tolerance; large fees remain capped at 100 micro-units.
for(const [start,step]of [[2n,1n],[1000n,2n],[1000000n,101n]]){
 let calls=0
 await assert.rejects(()=>quoteEvmBridgeFee(blocked,async()=>formatUnits(start+BigInt(calls++)*step,6),100000000n,now),/estimate changed/)
 assert.equal(calls,4)
}
let acceptedCalls=0
const cap=await quoteEvmBridgeFee(blocked,async()=>++acceptedCalls===1?'1':'1.0001',100000000n,now)
assert.equal(cap.networkFeeUnits,'1000000');assert.equal(acceptedCalls,2)
for(const update of [{source:'xlayer',destination:'base'},{asset:'USDT',source:'ethereum'},{destinationAddress:'0x'+'0'.repeat(40)},{destinationAddress:'not-an-address'}]){
 await assert.rejects(()=>quoteEvmBridgeFee({...blocked,...update},async()=>{assert.fail('unsupported route must not reach Circle estimation')},rate,now))
}
console.log(`PASS: ${count} EVM asset/network combinations; exact bridge batch preserved, reimbursement only, signed bindings, expiry/tampering, lower-cost benefit and higher-cost rejection. Synthetic; no provider calls or fund movements.`)
