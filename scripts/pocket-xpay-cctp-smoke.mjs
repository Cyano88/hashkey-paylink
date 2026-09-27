import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbiItem} from 'viem'
import {quoteXPayBridge,validateXPayAttestation,xpayBurnCalls,verifyXPayBurnTransaction,verifyXPayMintReceipt,assertXPayMintWindow,readXPayAttestation,XPAY_CCTP} from '../api/pocket/xpay-cctp-provider.ts'
const source='0x'+'1'.repeat(40),destination='0x'+'2'.repeat(40)
const plan=await quoteXPayBridge(source,destination,1000000n,async()=>new Response(JSON.stringify([{finalityThreshold:1000,minimumFee:1.4}]),{status:200}))
assert.equal(plan.burnUnits,'1000141');assert.equal(plan.maxFeeUnits,'141')
await assert.rejects(()=>quoteXPayBridge(source,destination,0n))
await assert.rejects(()=>quoteXPayBridge(source,destination,1n,async()=>new Response('<html>',{status:502})))
const bytes=Buffer.alloc(376),word=(v)=>v.slice(2).padStart(64,'0'),addr=(offset,v)=>Buffer.from(word(v),'hex').copy(bytes,offset),uint=(offset,v)=>Buffer.from(BigInt(v).toString(16).padStart(64,'0'),'hex').copy(bytes,offset)
bytes.writeUInt32BE(1,0);bytes.writeUInt32BE(37,4);bytes.writeUInt32BE(6,8);uint(12,1);addr(44,XPAY_CCTP.messenger);addr(76,XPAY_CCTP.messenger);addr(108,destination);bytes.writeUInt32BE(1000,140);bytes.writeUInt32BE(1000,144);bytes.writeUInt32BE(1,148);addr(152,XPAY_CCTP.sourceToken);addr(184,destination);uint(216,plan.burnUnits);addr(248,source);uint(280,plan.maxFeeUnits);uint(312,140);uint(344,500)
const raw='0x'+bytes.toString('hex'),proof=validateXPayAttestation(raw,plan)
assert.equal(proof.amountUnits,1000001n)
for(const offset of [0,4,8,44,76,108,140,144,148,152,184,216,248,280,312]){const changed=Buffer.from(bytes);changed[offset]^=255;assert.throws(()=>validateXPayAttestation('0x'+changed.toString('hex'),plan),'offset '+offset)}
assert.throws(()=>validateXPayAttestation(raw+'00',plan))
assertXPayMintWindow(proof,499n);assert.throws(()=>assertXPayMintWindow(proof,500n),/expired/)
const call=xpayBurnCalls(plan).burn,tx={from:source,to:call.to,input:call.data,value:0n}
assert.equal(verifyXPayBurnTransaction(plan,tx,{status:'success'}),'confirmed');assert.equal(verifyXPayBurnTransaction(plan,tx,{status:'reverted'}),'reverted')
assert.throws(()=>verifyXPayBurnTransaction(plan,{...tx,from:destination},{status:'reverted'}))
const event=parseAbiItem('event MessageReceived(address indexed caller,uint32 sourceDomain,bytes32 indexed nonce,bytes32 sender,uint32 indexed finalityThresholdExecuted,bytes messageBody)'),transfer=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')
const logs=[{address:XPAY_CCTP.transmitter,topics:encodeEventTopics({abi:[event],eventName:'MessageReceived',args:{caller:destination,nonce:proof.nonce,finalityThresholdExecuted:1000}}),data:encodeAbiParameters([{type:'uint32'},{type:'bytes32'},{type:'bytes'}],[37,'0x'+word(XPAY_CCTP.messenger),proof.body])},{address:XPAY_CCTP.destinationToken,topics:encodeEventTopics({abi:[transfer],eventName:'Transfer',args:{from:'0x'+'0'.repeat(40),to:destination}}),data:encodeAbiParameters([{type:'uint256'}],[proof.amountUnits])}]
assert.equal(verifyXPayMintReceipt(plan,proof,{status:'success',logs}),true)
assert.equal(verifyXPayMintReceipt(plan,proof,{status:'reverted',logs}),false)
for(const lone of logs)assert.equal(verifyXPayMintReceipt(plan,proof,{status:'success',logs:[lone]}),false)
assert.equal(verifyXPayMintReceipt(plan,proof,{status:'success',logs:logs.map(l=>({...l,address:source}))}),false)
const hash='0x'+'3'.repeat(64)
assert.equal(await readXPayAttestation(hash,plan,async()=>new Response('',{status:404})),null)
assert.equal(await readXPayAttestation(hash,plan,async()=>Response.json({messages:[{status:'pending'}]})),null)
await assert.rejects(()=>readXPayAttestation(hash,plan,async()=>Response.json({messages:[{status:'complete',message:raw,attestation:'0x00'}]})))
console.log('PASS exact fee rounding, bound wallets/domains/token/amount/fees, no altered messages, expiry recovery, exact source transaction, paired Base mint proof; attestation alone never means arrival.')
