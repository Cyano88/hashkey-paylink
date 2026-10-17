import assert from 'node:assert/strict'
import {encodeFunctionData,decodeFunctionData,parseAbi} from 'viem'
import {quoteNativeSend,sealNativeSend,openNativeSend,confirmsNativeSend,bufferedNativeFee,nativeAmountUnits} from '../api/pocket/native-send-quote.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='native-transfer-fixture-secret-'.repeat(3)
const binding={ownerId:'owner-a',network:'base',walletId:'wallet-a',walletAddress:'0x'+'1'.repeat(40),recipient:'0x'+'2'.repeat(40),amount:'0.012345678901234567'}
const q=await quoteNativeSend(binding,async()=> '0.0001',100000)
assert.equal(q.feeUnits,'150000000000000');assert.equal(q.amountUnits,'12345678901234567');assert.equal(BigInt(q.totalUnits),BigInt(q.amountUnits)+BigInt(q.feeUnits))
const token=sealNativeSend(q);assert.deepEqual(openNativeSend(token,binding.ownerId,false,100001),q)
assert.throws(()=>openNativeSend(token,'owner-b',false,100001));assert.throws(()=>openNativeSend(token,binding.ownerId,false,145000),e=>e.status===409&&e.code==='NATIVE_QUOTE_EXPIRED'&&e.message.includes('Fee estimate expired'));assert.deepEqual(openNativeSend(token,binding.ownerId,true,200000),q)
for(const amount of ['0','-1','1e-3','0.0000000000000000001','NaN','Infinity','01','1.'])assert.throws(()=>nativeAmountUnits(amount))
for(const mutate of [x=>x.asset='POL',x=>x.totalUnits='1',x=>x.callData='0x',x=>x.network='xlayer',x=>x.recipient=x.walletAddress]){const bad=structuredClone(q);mutate(bad);assert.throws(()=>openNativeSend(sealNativeSend(bad),'owner-a',false,100001))}
const call={type:'CALL',from:'0x'+'3'.repeat(40),to:q.walletAddress,input:q.callData,calls:[{type:'CALL',from:q.walletAddress,to:q.recipient,input:'0x',value:'0x'+BigInt(q.amountUnits).toString(16)},{type:'CALL',from:q.walletAddress,to:EVM_PLATFORM_TREASURY,input:'0x',value:'0x'+BigInt(q.feeUnits).toString(16)}]}
assert.equal(confirmsNativeSend(q,{type:'CALL',calls:[call]}),true)
for(const mutate of [x=>x.error='reverted',x=>x.calls[0].error='reverted',x=>x.calls[0].to=EVM_PLATFORM_TREASURY,x=>x.calls[0].value='0x1',x=>x.calls[1].value='0x1',x=>x.calls.pop(),x=>x.calls.push(x.calls[0]),x=>x.type='DELEGATECALL',x=>x.input='0x']){const bad=structuredClone(call);mutate(bad);assert.equal(confirmsNativeSend(q,bad),false)}
assert.equal(confirmsNativeSend(q,{type:'CALL',error:'reverted',calls:[call]}),false);assert.equal(confirmsNativeSend(q,{type:'CALL',calls:[call,call]}),false)
await assert.rejects(()=>quoteNativeSend(binding,async()=> '0'))
let n=0;await assert.rejects(()=>quoteNativeSend(binding,async()=>String(++n)),/Network fees changed/)
for(const network of ['ethereum','base','arbitrum','polygon']){const quote=await quoteNativeSend({...binding,network},async()=> '0.000001');assert.equal(quote.asset,network==='polygon'?'POL':'ETH')}
console.log('PASS native send exact units, buffered fees, quote ownership/expiry, native-only networks, exact principal and reimbursement proof, reverted/duplicate/partial traces rejected')
