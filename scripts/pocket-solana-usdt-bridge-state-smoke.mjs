import assert from 'node:assert/strict'
import {Keypair,Transaction} from '@solana/web3.js'
import {createTransferCheckedInstruction} from '../api/solana-token.ts'
import {createSolanaUsdtBridgeState} from '../api/pocket/solana-usdt-bridge-state.ts'

// Isolated store/RPC/approval fixtures. No provider or chain calls.
const sponsor=Keypair.generate(),user=Keypair.generate(),mint=Keypair.generate().publicKey
const tx=new Transaction({feePayer:sponsor.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(createTransferCheckedInstruction(Keypair.generate().publicKey,mint,Keypair.generate().publicKey,user.publicKey,1000000n,6))
tx.partialSign(sponsor)
const raw=tx.serialize({requireAllSignatures:false}).toString('base64')
let now=1000,challengeCalls=0,sendCalls=0,blockHeight=50,chainStatus=null,timeout=false
const records=new Map()
const store={read:async id=>structuredClone(records.get(id)),update:async(id,fn)=>{const r=fn(structuredClone(records.get(id)));records.set(id,structuredClone(r));return structuredClone(r)}}
const state=createSolanaUsdtBridgeState(store,()=>now)
const input={ownerId:'owner',walletId:'circle-solana',walletAddress:user.publicKey.toBase58(),destinationAddress:'0x'+'12'.repeat(20),quote:{provider:'relay',orderId:'0x'+'01'.repeat(32),requestId:'0x'+'02'.repeat(32),asset:'USDT',source:'solana',destination:'base',amountUnits:'1000000',receiveUnits:'990000',minimumUnits:'980000',providerFeeUnits:'10000',networkFeeUnits:'1500',totalUnits:'1001500',appFeeUnits:'0',expiresAt:2000,lastValidBlockHeight:100,transaction:raw,walletAddress:user.publicKey.toBase58(),destinationAddress:'0x'+'12'.repeat(20)}}
const register=()=>state.register(input)
const authorize=r=>({ownerId:'owner',id:r.id,walletId:input.walletId,walletAddress:input.walletAddress,rawTransaction:raw})
const challenge=async()=>{challengeCalls++;return 'challenge-'+challengeCalls}
const r=await register()
await assert.rejects(()=>state.read('other',r.id),/not found/)
await assert.rejects(()=>state.authorize({...authorize(r),walletId:'other'},challenge),/changed/)
const tampered=Transaction.from(Buffer.from(raw,'base64'));tampered.instructions[0].data[1]^=1
await assert.rejects(()=>state.authorize({...authorize(r),rawTransaction:tampered.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64')},challenge),/changed/)
assert.equal(challengeCalls,0)
await state.authorize(authorize(r),challenge)
await state.authorize(authorize(r),challenge)
assert.equal(challengeCalls,1,'Retry must reuse existing challenge')
const signed=Transaction.from(Buffer.from(raw,'base64'));signed.partialSign(user)
const signedRaw=signed.serialize().toString('base64')
await assert.rejects(()=>state.saveSigned('owner',r.id,raw),/signature/)
await state.saveSigned('owner',r.id,signedRaw)
const rpc={getSignatureStatuses:async()=>({value:[chainStatus]}),getBlockHeight:async()=>blockHeight,sendRawTransaction:async bytes=>{sendCalls++;assert.equal(bytes.toString('base64'),signedRaw);if(timeout)throw Error('RPC timeout');return (await state.read('owner',r.id)).signature}}
timeout=true;await assert.rejects(()=>state.submit('owner',r.id,rpc),/timeout/)
assert.equal((await state.read('owner',r.id)).phase,'signed','Signed bytes survive a send timeout')
// A fresh service instance recovers the same saved transaction after a restart.
const restarted=createSolanaUsdtBridgeState(store,()=>now)
timeout=false;await restarted.submit('owner',r.id,rpc)
assert.equal(sendCalls,2);assert.equal((await state.read('owner',r.id)).phase,'submitted')
chainStatus={err:null,confirmationStatus:'confirmed'}
const confirmed=await restarted.submit('owner',r.id,rpc)
assert.equal(confirmed.phase,'source_confirmed','A source debit cannot mark destination delivery complete')
await restarted.submit('owner',r.id,rpc);assert.equal(sendCalls,2)
const unknown=await register()
await assert.rejects(()=>state.authorize(authorize(unknown),async()=>{challengeCalls++;throw Error('Provider timeout')}),/timeout/)
await assert.rejects(()=>state.authorize(authorize(unknown),challenge),/pending/)
assert.equal(challengeCalls,2,'Unknown challenge must not be recreated')
const race=await register()
const results=await Promise.allSettled([state.authorize(authorize(race),challenge),state.authorize(authorize(race),challenge)])
assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
assert.equal(challengeCalls,3)
const expired=await register();await state.authorize(authorize(expired),challenge);await state.saveSigned('owner',expired.id,signedRaw)
chainStatus=null;blockHeight=101
await state.submit('owner',expired.id,rpc);assert.equal(sendCalls,2,'Expired signed transaction must not be broadcast or replaced')
const stale=await register();now=2001
await assert.rejects(()=>state.authorize(authorize(stale),challenge),/expired/)
await assert.rejects(()=>state.register({...input,destinationAddress:'0x'+'34'.repeat(20)}),/Invalid/)
// A delayed source-status response cannot downgrade concurrently verified delivery.
now=1000
const completedRace=await register();await state.authorize(authorize(completedRace),challenge);await state.saveSigned('owner',completedRace.id,signedRaw)
const terminal=await state.submit('owner',completedRace.id,{...rpc,getSignatureStatuses:async()=>{
 await store.update(completedRace.id,current=>({...current,phase:'completed'}))
 return {value:[{err:null,confirmationStatus:'confirmed'}]}
}})
assert.equal(terminal.phase,'completed')
console.log('Solana USDT approval/recovery passed: ownership, message binding, challenge reuse/race, unknown approval, persisted signed bytes, restart recovery and expired blockhash. Source confirmation is not destination completion. No live requests.')
