import assert from 'node:assert/strict'
import {readCircleKitTransaction} from '../api/pocket/circle-bridge-transaction.ts'
const binding={challengeId:'11111111-1111-4111-8111-111111111111',walletId:'owned',walletAddress:'0x'+'1'.repeat(40),blockchain:'BASE',refId:'pocket:bridge:22222222-2222-4222-8222-222222222222',callData:'0x1234'},id='33333333-3333-4333-8333-333333333333',hash='0x'+'a'.repeat(64)
const base={challenge:{id:binding.challengeId,correlationIds:[id]},transaction:{id,refId:binding.refId,walletId:binding.walletId,blockchain:binding.blockchain,operation:'CONTRACT_EXECUTION',contractAddress:binding.walletAddress,sourceAddress:binding.walletAddress,callData:binding.callData,txHash:hash}}
let data=structuredClone(base)
const read=async path=>path.includes('/user/challenges/')?{challenge:data.challenge}:{transaction:data.transaction}
assert.equal(await readCircleKitTransaction(binding,read),hash)
for(const [field,value] of Object.entries({id:'other',refId:'other',walletId:'other',blockchain:'ETH',operation:'TRANSFER',contractAddress:'0x'+'2'.repeat(40),sourceAddress:'0x'+'2'.repeat(40),callData:'0x5678',txHash:'not-a-hash'})){data=structuredClone(base);data.transaction[field]=value;await assert.rejects(()=>readCircleKitTransaction(binding,read))}
for(const mutate of [x=>x.challenge.id=id,x=>x.challenge.correlationIds=[id,id],x=>x.challenge.correlationIds=['bad']]){data=structuredClone(base);mutate(data);await assert.rejects(()=>readCircleKitTransaction(binding,read))}
for(const mutate of [x=>delete x.challenge,x=>x.challenge.correlationIds=[],x=>delete x.transaction,x=>delete x.transaction.callData,x=>delete x.transaction.txHash]){data=structuredClone(base);mutate(data);assert.equal(await readCircleKitTransaction(binding,read),null)}
console.log('PASS Circle transaction recovery: exact challenge/correlation/owner wallet/network/reference/callData binding; missing evidence stays pending; mismatches rejected. Fixtures only.')
