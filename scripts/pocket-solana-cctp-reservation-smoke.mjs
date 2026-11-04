import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Connection,Keypair,SystemProgram,Transaction} from '@solana/web3.js'
import bs58 from 'bs58'
import {createSolanaCctpReservations,SOLANA_CCTP_ACTION} from '../api/pocket/solana-cctp-reservation.ts'
import {readSolanaCctpSource} from '../api/pocket/solana-cctp-source-proof.ts'
// Actual shared journal, isolated transactional storage. No real providers/DB.
await import('./pocket-shared-action-reservation-smoke.mjs')
const j=await import('../.codex-temp/shared-action-fixture.mjs')
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
function fixture(){
 const fee=Keypair.generate(),payer=Keypair.generate(),blockHash=Keypair.generate().publicKey.toBase58()
 const tx=new Transaction({feePayer:fee.publicKey,recentBlockhash:blockHash}).add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:fee.publicKey,lamports:1}))
 tx.partialSign(fee)
 const b={ownerId:randomUUID(),walletId:randomUUID(),walletAddress:payer.publicKey.toBase58(),id:randomUUID()}
 const q={walletAddress:b.walletAddress,destination:'base',destinationAddress:'0x'+'1'.repeat(40),amount:'1',transaction:tx.serialize({requireAllSignatures:false}).toString('base64'),lastValidBlockHeight:200,networkFeeUnits:'1',providerFeeUnits:'0',expiresAt:Date.now()+30000}
 tx.partialSign(payer);const raw=tx.serialize().toString('base64'),hash=bs58.encode(tx.signature)
 const receipt={slot:100,transaction:{message:tx.compileMessage(),signatures:tx.signatures.map(s=>bs58.encode(s.signature))},meta:{err:null}}
 const rpc=(options={})=>{let reads=0,blocks=0,networks=0;return {
  getGenesisHash:async()=>{networks++;return options.wrongNetwork||options.changedNetwork&&networks>1?'wrong':MAINNET},
  getTransaction:async(h,config)=>{assert.equal(h,hash);assert.equal(config.commitment,'finalized');reads++;if(options.absent)return null;let r={...receipt,transaction:{...receipt.transaction},meta:{...receipt.meta}};if(options.error)r.meta.err={InstructionError:[0,{Custom:1}]};if(options.noOutcome)delete r.meta.err;if(options.changedResult&&reads>1)r.meta.err={InstructionError:[0,{Custom:2}]};if(options.wrongMessage)r.transaction.message={serialize:()=>Buffer.from('wrong')};if(options.wrongSignature)r.transaction.signatures=['wrong'];return r},
  getSlot:async c=>{assert.equal(c,'finalized');return options.unfinalized?99:110},
  getBlockSignatures:async(slot,commitment)=>{assert.equal(slot,100);assert.equal(commitment,'finalized');blocks++;return {blockhash:options.reorg&&blocks>1?'changed':blockHash,signatures:options.noMembership?[]:options.duplicateMembership?[hash,hash]:[hash]}}
 }}
 return {b,q,raw,hash,rpc,blockHash}
}
const f=fixture()
// Exercise the installed SDK's real JSON-RPC decoding, not only duck-typed mocks.
const signed=Transaction.from(Buffer.from(f.raw,'base64')),message=signed.compileMessage();let rpcReads=0
const sdkRpc=new Connection('https://fixture.invalid',{commitment:'finalized',disableRetryOnRateLimit:true,fetch:async(_url,options)=>{
 rpcReads++;const request=JSON.parse(options.body);let result
 if(request.method==='getGenesisHash')result=MAINNET
 else {assert.equal(request.params.at(-1).commitment,'finalized');
  if(request.method==='getSlot')result=110
  else if(request.method==='getBlock'){assert.equal(request.params.at(-1).transactionDetails,'signatures');result={blockhash:f.blockHash,previousBlockhash:f.blockHash,parentSlot:99,blockTime:1000,signatures:[f.hash]}}
  else if(request.method==='getTransaction')result={slot:100,blockTime:1000,version:'legacy',meta:{err:null,fee:5000,preBalances:message.accountKeys.map(()=>10000),postBalances:message.accountKeys.map(()=>5000)},transaction:{signatures:signed.signatures.map(s=>bs58.encode(s.signature)),message:{header:message.header,accountKeys:message.accountKeys.map(k=>k.toBase58()),recentBlockhash:message.recentBlockhash,instructions:message.instructions}}}
  else throw Error('Unexpected RPC method '+request.method)
 }
 return Response.json({jsonrpc:'2.0',id:request.id,result})
}})
assert.equal((await readSolanaCctpSource(f.q,f.raw,sdkRpc)).outcome,'source_confirmed');assert.equal(rpcReads,7)
assert.equal((await readSolanaCctpSource(f.q,f.raw,f.rpc())).outcome,'source_confirmed')
assert.equal((await readSolanaCctpSource(f.q,f.raw,f.rpc({error:true}))).outcome,'source_failed')
assert.equal(await readSolanaCctpSource(f.q,f.raw,f.rpc({absent:true})),null)
for(const flag of ['wrongNetwork','changedNetwork','noOutcome','changedResult','wrongMessage','wrongSignature','unfinalized','reorg','noMembership','duplicateMembership'])await assert.rejects(readSolanaCctpSource(f.q,f.raw,f.rpc({[flag]:true})),undefined,flag)
let dispatches=0,proofMode='absent'
const deps={durable:()=>true,claim:j.claimCirclePocketAction,broadcastClaim:j.claimSolanaCctpBroadcast,find:j.findCirclePocketAction,record:j.recordCirclePocketAction,
 dispatch:async(raw,height)=>{dispatches++;assert.equal(raw,f.raw);assert.equal(height,f.q.lastValidBlockHeight);const row=await j.findCirclePocketAction(f.b.ownerId,'pocket:solana-cctp:'+f.b.id,SOLANA_CCTP_ACTION);assert.equal(row.metadata.txHash,f.hash);assert.equal(row.metadata.signedTransaction,f.raw);throw Error('Lost response')},
 prove:(q,raw)=>readSolanaCctpSource(q,raw,f.rpc(proofMode==='absent'?{absent:true}:proofMode==='reorg'?{reorg:true}:{}))}
let service=createSolanaCctpReservations(deps)
await Promise.all([service.prepare(f.b,f.q),service.prepare(f.b,f.q)])
await assert.rejects(j.claimCirclePocketAction({ownerId:f.b.ownerId,idempotencyKey:'competing',action:'wallet.native-send',metadata:{network:'solana',walletAddress:f.b.walletAddress}}),/Another action/)
await Promise.all([service.submit(f.b,f.raw),service.submit(f.b,f.raw)]);assert.equal(dispatches,1)
service=createSolanaCctpReservations(deps)
assert.equal((await service.cancel(f.b)).status,'submitted');await service.submit(f.b,f.raw);assert.equal(dispatches,1)
await assert.rejects(service.prepare(f.b,{...f.q,amount:'2'}),/changed/)
await assert.rejects(service.resume({...f.b,walletId:'different'}),/binding/)
await assert.rejects(service.resume({...f.b,ownerId:'other'}),/binding/)
proofMode='reorg';await assert.rejects(service.resume(f.b));assert.equal((await service.inspect(f.b)).status,'submitted')
proofMode='confirmed';const completed=await service.resume(f.b);assert.equal(completed.status,'completed');assert.equal(completed.metadata.sourceOutcome,'source_confirmed')
await j.recordCirclePocketAction({...completed,status:'submitted'});assert.equal((await service.inspect(f.b)).status,'completed')
await assert.rejects(j.recordCirclePocketAction({...completed,metadata:{...completed.metadata,signedTransaction:'different'}}),/cannot change/)
assert.equal((await j.claimCirclePocketAction({ownerId:f.b.ownerId,idempotencyKey:'released',action:'wallet.native-send',metadata:{network:'solana',walletAddress:f.b.walletAddress}})).claimed,true)
// A separate journal action can win the prepare race; no signing/dispatch follows.
const other=fixture();await j.claimCirclePocketAction({ownerId:other.b.ownerId,idempotencyKey:'first',action:'wallet.native-swap',metadata:{network:'solana',walletAddress:other.b.walletAddress}})
await assert.rejects(service.prepare(other.b,other.q),/Another action/)
await assert.rejects(createSolanaCctpReservations({...deps,durable:()=>false}).prepare(f.b,f.q),/storage/)
const unsigned=fixture();const pending=createSolanaCctpReservations({...deps,now:()=>Date.now()+999999})
await assert.rejects(pending.prepare(unsigned.b,unsigned.q),/expired/)
await service.prepare(unsigned.b,unsigned.q);assert.equal((await pending.cancel(unsigned.b)).status,'started','Clock expiry cannot release an uncertain signing attempt')
const failed=fixture(),failedService=createSolanaCctpReservations({...deps,dispatch:async()=>{},prove:(q,raw)=>readSolanaCctpSource(q,raw,failed.rpc({error:true}))})
await failedService.prepare(failed.b,failed.q);await failedService.submit(failed.b,failed.raw)
assert.equal((await failedService.resume(failed.b)).status,'failed')
assert.equal((await j.claimCirclePocketAction({ownerId:failed.b.ownerId,idempotencyKey:'after-failure',action:'wallet.native-send',metadata:{network:'solana',walletAddress:failed.b.walletAddress}})).claimed,true)
console.log('PASS Solana CCTP internal lifecycle and exact finalized transaction envelope: atomic preparation/broadcast, cross-action blocking, lost response/restart, immutable signed evidence, missing/changed RPC evidence, terminal source release and expiry safety. Synthetic signed-message fixtures; no live CCTP transfer or mounted endpoint.')
