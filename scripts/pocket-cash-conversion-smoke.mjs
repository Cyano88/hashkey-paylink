import assert from 'node:assert/strict'
import {decodeFunctionData,encodeFunctionData} from 'viem'
import {readFileSync} from 'node:fs'
import {cashFixture,owner,wallet,hash,rate} from './fixtures/cash-conversion.mjs'
import {CASH_BATCH_ABI,validateCashConversion,sealCashConversion,openCashConversion,quoteCashConversion} from '../api/pocket/cash-conversion-quote.ts'
import {cashConversionOutput,reconcileCashConversion} from '../api/pocket/cash-conversion-reconciliation.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='cash-conversion-fixture-secret-'.repeat(3)
const {q,trace,now,binding,provider,response}=await cashFixture()
assert.equal(q.feeUnits,'30000')
const calls=decodeFunctionData({abi:CASH_BATCH_ABI,data:q.callData}).args[0]
assert.equal(calls.length,5);assert.ok(calls.every(c=>c.value===0n),'no native gas debit requested from user')
assert.equal(cashConversionOutput(q,trace),9970000n,'Cash is net received USDC after reimbursement')
const sealed=sealCashConversion(q)
assert.deepEqual(openCashConversion(sealed,owner,false,now),q)
assert.throws(()=>openCashConversion(sealed,'other',false,now))
assert.throws(()=>openCashConversion(sealed+'x',owner,false,now))
assert.throws(()=>openCashConversion(sealed,owner,false,now+45001))
assert.ok(openCashConversion(sealed,owner,true,now+45001),'expired quote still recovers')
for(const mutate of [x=>x.network='ethereum',x=>x.from='USDC',x=>x.to='USDT',x=>x.amount='11',x=>x.tx.to=wallet,x=>x.tx.from='0x'+'2'.repeat(40),x=>x.tx.value='1',x=>x.tx.data+='00',x=>x.minimumOutUnits='1',x=>x.feeUnits=x.minimumOutUnits,x=>x.priceImpact='4',x=>x.callData+='00']){
 const bad=structuredClone(q);mutate(bad);assert.throws(()=>validateCashConversion(bad,false,now))
}
for(const mutate of [t=>t.calls.pop(),t=>t.calls[4].logs=[],t=>t.calls[2].logs.shift(),t=>t.calls[2].logs.pop(),t=>t.error='revert',t=>t.calls.push({...t.calls[4]}),t=>t.calls[4].error='failed']){
 const bad=structuredClone(trace);mutate(bad);assert.equal(cashConversionOutput(q,bad),null,'incomplete transfer or repayment proof cannot credit Cash')
}
const wrapped={type:'CALL',to:wallet,input:q.callData,calls:[{type:'DELEGATECALL',calls:trace.calls}]}
assert.equal(cashConversionOutput(q,wrapped),9970000n)
for(const mutate of [r=>r.routerResult.chainIndex='1',r=>r.routerResult.toToken.decimal='18',r=>r.routerResult.fromToken.taxRate='1',r=>r.routerResult.toToken.tokenContractAddress=wallet]){
 const bad=structuredClone(response);mutate(bad);await assert.rejects(()=>quoteCashConversion(binding,async()=> '0.00001',rate,async path=>path==='swap'?bad:provider(path)))
}
await assert.rejects(()=>quoteCashConversion(binding,async()=> '1',rate,provider),/too small/)
let estimates=0;await assert.rejects(()=>quoteCashConversion(binding,async()=>String(0.00001*2**++estimates),rate,provider),/fees changed/);assert.equal(estimates,4,'bounded fee estimation')
const record={id:'record',ownerId:owner,idempotencyKey:'pocket:cash-conversion:'+q.id,action:'wallet.cash-conversion',status:'submitted',metadata:{network:'base',quoteToken:sealed,txHash:hash}}
const rpc=async(_n,m)=>({eth_chainId:'0x2105',eth_getTransactionReceipt:{status:'0x1',transactionHash:hash,blockNumber:'0x10',blockHash:hash},eth_getBlockByNumber:{hash},debug_traceTransaction:trace}[m])
let saved;const deps={rpc,record:async r=>(saved=r)}
assert.equal((await reconcileCashConversion(record,deps)).status,'completed');assert.equal(saved.metadata.amountOut,'9.97')
assert.equal((await reconcileCashConversion(record,{...deps,rpc:async(n,m,p)=>m==='eth_getBlockByNumber'?{hash:'0x'+'b'.repeat(64)}:rpc(n,m,p)})).status,'pending','noncanonical receipt cannot complete')
const bad=structuredClone(trace);bad.calls[4].logs=[]
assert.equal((await reconcileCashConversion(record,{...deps,rpc:async(n,m,p)=>m==='debug_traceTransaction'?bad:rpc(n,m,p)})).status,'pending','receipt status alone cannot complete')
console.log('PASS Cash conversion: fixed Base USDT/USDC pair, exact debit, output-funded repayment, net Cash proof, sealed identity/expiry, altered route rejection, bounded estimation and canonical receipt checks.')

const abi=JSON.parse(readFileSync('src/pocket/lib/pocketOkxRouterAbi.json','utf8'))
const liveShape=structuredClone(response),decoded=decodeFunctionData({abi,data:liveShape.tx.data})
const output=9985310n,minimum=output*995n/1000n
liveShape.routerResult.toTokenAmount=String(output);liveShape.tx.minReceiveAmount=String(minimum)
decoded.args[1].minReturnAmount=minimum
const canonical=encodeFunctionData({abi,functionName:decoded.functionName,args:decoded.args})
const word=x=>x.toString(16).padStart(64,'0'),recipient='0x'+'3'.repeat(40)
const expectation=(0x777777771111800000000000n<<160n)|output
const fee=(0x777777771111n<<208n)|(100n<<160n)|BigInt(recipient)
liveShape.tx.data=canonical+word(expectation)+word(fee)
const quoteWith=raw=>quoteCashConversion(binding,async()=> '0.00001',rate,async path=>path==='swap'?raw:provider(path))
const liveQuote=await quoteWith(liveShape)
assert.equal(liveQuote.minimumOutUnits,'9935383','0.5 percent floor allows precisely the provider integer rounding')
assert.deepEqual(liveQuote.positiveSlippageFee,{capPercent:10,recipient})
assert.deepEqual(openCashConversion(sealCashConversion(liveQuote),owner,false,now).positiveSlippageFee,liveQuote.positiveSlippageFee)
const hidden=structuredClone(liveQuote);delete hidden.positiveSlippageFee
assert.throws(()=>validateCashConversion(hidden,false,now),'fee disclosure must match sealed calldata')
for(const tail of [word(expectation)+word(fee+ (1n<<160n)),word(expectation+1n)+word(fee),word(expectation)+word(fee&~((1n<<160n)-1n)),word(expectation)+word(fee)+'00',word(expectation)+word(fee)+word(0n)]){
 const altered=structuredClone(liveShape);altered.tx.data=canonical+tail;await assert.rejects(()=>quoteWith(altered),'unknown/altered fee data must fail closed')
}
const low=structuredClone(liveShape);decoded.args[1].minReturnAmount=minimum-1n;low.tx.minReceiveAmount=String(minimum-1n);low.tx.data=encodeFunctionData({abi,functionName:decoded.functionName,args:decoded.args})+word(expectation)+word(fee)
await assert.rejects(()=>quoteWith(low),'even one unit below the allowed floor remains rejected')
console.log('PASS real-provider shape regression: exact integer slippage floor, bounded positive-only fee, signed disclosure and malformed trailers rejected.')
