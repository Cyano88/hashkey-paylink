import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {encodeAbiParameters,encodeEventTopics,encodeFunctionData,parseAbi,zeroHash,zeroAddress} from 'viem'
import {Keypair} from '@solana/web3.js'
import {createDirectCctpReservations,DIRECT_CCTP_ACTION} from '../api/pocket/direct-cctp-reservation.ts'
import {proveDirectCctpSource,readDirectCctpSource} from '../api/pocket/direct-cctp-source-proof.ts'
import {buildCircleKitFeeBatch,CIRCLE_KIT_EVM_SOURCES} from '../api/pocket/circle-bridge-platform-fee.ts'
import {CCTP_DOMAIN,CCTP_TOKEN_MESSENGER_V2} from '../api/pocket/cctp.ts'
import {inboundChains} from '../api/pocket/inbound-bridge-networks.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
// Reuse the isolated real-journal harness; never touch configured storage.
await import('./pocket-shared-action-reservation-smoke.mjs')
const journal=await import('../.codex-temp/shared-action-fixture.mjs')
const wallet='0x'+'1'.repeat(40),recipient='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),finalHash='0x'+'c'.repeat(64)
const abi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)','function approve(address spender,uint256 amount) returns(bool)','function transfer(address to,uint256 amount) returns(bool)','function depositForBurnWithHook(uint256,uint32,bytes32,address,bytes32,uint256,uint32,bytes) returns(uint64)','event Transfer(address indexed from,address indexed to,uint256 value)','event MessageSent(bytes message)'])
const env={POCKET_BRIDGE_REVENUE_BPS:'10',POCKET_BRIDGE_REVENUE_EVM_ADDRESS:recipient,POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS:Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey.toBase58()}
let firstQuote,count=0
for(const source of CIRCLE_KIT_EVM_SOURCES)for(const destination of Object.keys(CCTP_DOMAIN)){
 if(source===destination)continue
 const destinationAddress=destination==='solana'?env.POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS:recipient
 const kit=await buildCircleKitFeeBatch({source,destination,walletAddress:wallet,destinationAddress,transferUnits:1000000n,providerFeeUnits:200n,reimbursementUnits:300n,finalityThreshold:2000},env)
 const token=kit.bridgeParams.burnToken
 const calls=[{target:token,value:0n,data:encodeFunctionData({abi,functionName:'approve',args:[CCTP_TOKEN_MESSENGER_V2,1000200n]})},{target:CCTP_TOKEN_MESSENGER_V2,value:0n,data:encodeFunctionData({abi,functionName:'depositForBurnWithHook',args:[1000200n,CCTP_DOMAIN[destination],kit.bridgeParams.mintRecipient,token,zeroHash,200n,2000,kit.hookData]})},{target:token,value:0n,data:encodeFunctionData({abi,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,300n]})}]
 const q={version:1,ownerId:'direct-'+randomUUID(),source,destination,destinationAddress,walletId:'wallet',walletAddress:wallet,asset:'USDC',tokenAddress:token,amountUnits:'1000000',bridgeDebitUnits:'1000200',networkFeeUnits:'300',totalUnits:'1000500',issuedAt:Date.now(),expiresAt:Date.now()+30000,callData:encodeFunctionData({abi,functionName:'executeBatch',args:[calls]})}
 q.bridgeCallData=encodeFunctionData({abi,functionName:'executeBatch',args:[calls.slice(0,2)]});firstQuote??=q
 const bytes=Buffer.alloc(376),write=(value,offset)=>Buffer.from(value.replace(/^0x/,'').padStart(64,'0'),'hex').copy(bytes,offset)
 bytes.writeUInt32BE(1,0);bytes.writeUInt32BE(CCTP_DOMAIN[source],4);bytes.writeUInt32BE(CCTP_DOMAIN[destination],8);bytes.writeUInt32BE(1,148);write(token,152);write(kit.bridgeParams.mintRecipient,184);write((1000200n).toString(16),216);write(wallet,248);write('c8',280)
 const transfer=(to,value)=>({address:token,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:wallet,to}}),data:encodeAbiParameters([{type:'uint256'}],[value])})
 const receipt={status:'success',transactionHash:hash,logs:[transfer(zeroAddress,1000200n),transfer(EVM_PLATFORM_TREASURY,300n),{address:'0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',topics:encodeEventTopics({abi,eventName:'MessageSent'}),data:encodeAbiParameters([{type:'bytes'}],['0x'+bytes.toString('hex')])}]}
 const trace={type:'CALL',to:wallet,input:q.callData,calls:calls.map(c=>({type:'CALL',from:wallet,to:c.target,input:c.data,value:'0x0'}))}
 assert.equal((await proveDirectCctpSource(q,receipt,trace)).outcome,'source_confirmed')
 const probes=structuredClone(trace);probes.calls.unshift({type:'STATICCALL',error:'execution reverted',calls:[{type:'DELEGATECALL',error:'execution reverted'}]})
 assert.equal((await proveDirectCctpSource(q,receipt,probes)).outcome,'source_confirmed')
 probes.calls[0].type='CALL';await assert.rejects(()=>proveDirectCctpSource(q,receipt,probes))
 for(const alter of [r=>r.logs.pop(),r=>r.logs.push(r.logs[2]),r=>r.logs[0]=transfer(zeroAddress,1000000n),r=>r.logs[1]=transfer(recipient,300n)]){const bad=structuredClone(receipt);alter(bad);await assert.rejects(()=>proveDirectCctpSource(q,bad,trace))}
 await assert.rejects(()=>proveDirectCctpSource(q,receipt,{...trace,to:recipient}))
 await assert.rejects(()=>proveDirectCctpSource(q,receipt,{calls:[trace,trace]}))
 assert.equal((await proveDirectCctpSource(q,receipt,{...trace,error:'revert'})).outcome,'source_failed')
 const raw={...receipt,status:'0x1',blockHash,blockNumber:'0x64',transactionIndex:'0x0',logs:receipt.logs.map((l,i)=>({...l,blockHash,blockNumber:'0x64',transactionHash:hash,transactionIndex:'0x0',logIndex:'0x'+i.toString(16),removed:false}))}
 let fault='',traced=false
 const rpc=async({method,params})=>{
  if(method==='eth_chainId')return '0x'+inboundChains[source].id.toString(16)
  if(method==='eth_getTransactionReceipt')return {...raw,...(fault==='status-change'&&traced?{status:'0x0'}:{})}
  if(method==='debug_traceTransaction'){traced=true;if(fault==='unsupported')throw Error('unsupported');return trace}
  if(method==='eth_getBlockByNumber')return params[0]==='0x64'?{number:'0x64',hash:blockHash,transactions:[hash]}:{number:'0x78',hash:finalHash}
  throw Error('Unexpected RPC')
 }
 assert.equal((await readDirectCctpSource(q,hash,rpc)).outcome,'source_confirmed')
 for(fault of ['status-change','unsupported']){traced=false;await assert.rejects(()=>readDirectCctpSource(q,hash,rpc))}
 count++
}
assert.equal(count,25)
const q={...firstQuote,issuedAt:Date.now(),expiresAt:Date.now()+30000},b={ownerId:q.ownerId,source:q.source,walletId:q.walletId,walletAddress:q.walletAddress,id:randomUUID()},challengeId=randomUUID(),transactionId=randomUUID()
let dispatches=0,recovered=null,challenge={id:challengeId,status:'PENDING',correlationIds:[]},proofReady=false,proofCalls=0,proofOutcome='source_confirmed'
let tx={id:transactionId,refId:'pocket:bridge:'+b.id,walletId:q.walletId,blockchain:{ethereum:'ETH',base:'BASE',arbitrum:'ARB',polygon:'MATIC',arc:'ARC'}[q.source],operation:'CONTRACT_EXECUTION',contractAddress:wallet,sourceAddress:wallet,callData:q.callData,txHash:hash}
const deps={durable:()=>true,claim:journal.claimCirclePocketAction,find:journal.findCirclePocketAction,record:journal.recordCirclePocketAction,dispatch:async()=>{dispatches++;throw Error('lost response')},recover:async()=>recovered,read:async(_q,_s,path)=>path.includes('/challenges/')?{challenge}:{transaction:tx},prove:async()=>{proofCalls++;if(!proofReady)throw Error('not finalized');return {outcome:proofOutcome,blockHash,blockNumber:'100'}}}
let service=createDirectCctpReservations(deps)
await Promise.all([service.execute(b,q,'secret-session'),service.execute(b,q,'secret-session')]);assert.equal(dispatches,1)
await assert.rejects(()=>journal.claimCirclePocketAction({ownerId:q.ownerId,action:'wallet.native-send',idempotencyKey:'competing',metadata:{network:q.source,walletAddress:wallet}}),e=>e.code==='wallet_action_pending')
service=createDirectCctpReservations(deps);await service.cancel(b,'secret-session');await service.execute(b,q,'secret-session');assert.equal(dispatches,1)
await assert.rejects(()=>service.execute(b,{...q,amountUnits:'2'},'secret-session'))
await assert.rejects(()=>service.resume({...b,walletAddress:recipient},'secret-session'))
recovered=challengeId;await service.cancel(b,'secret-session');assert.equal(proofCalls,0)
challenge={id:challengeId,status:'EXPIRED'};await service.cancel(b,'secret-session')
assert.equal((await journal.findCirclePocketAction(b.ownerId,'pocket:direct-cctp:'+b.source+':'+b.id,DIRECT_CCTP_ACTION)).status,'submitted','missing correlations do not prove unsigned cancellation')
challenge={...challenge,correlationIds:[transactionId]}
const savedTx=tx;tx={...tx,refId:'foreign'};await assert.rejects(()=>service.resume(b,'secret-session'));assert.equal(proofCalls,0);tx=savedTx
await assert.rejects(()=>service.resume(b,'secret-session'),/not finalized/)
const key='pocket:direct-cctp:'+b.source+':'+b.id
assert.equal((await journal.findCirclePocketAction(b.ownerId,key,DIRECT_CCTP_ACTION)).metadata.txHash,hash)
challenge={...challenge,status:'EXPIRED',correlationIds:[]};await service.cancel(b,'secret-session')
assert.equal((await journal.findCirclePocketAction(b.ownerId,key,DIRECT_CCTP_ACTION)).status,'submitted')
challenge={...challenge,status:'COMPLETE',correlationIds:[transactionId]};proofReady=true
const finished=await service.resume(b,'secret-session');assert.equal(finished.status,'completed');assert.equal(finished.metadata.sourceOutcome,'source_confirmed')
await journal.recordCirclePocketAction({...finished,status:'submitted'});assert.equal((await service.resume(b,'secret-session')).status,'completed')
assert.ok(!JSON.stringify(finished).includes('secret-session'));assert.equal(dispatches,1)
await journal.claimCirclePocketAction({ownerId:q.ownerId,action:'wallet.native-send',idempotencyKey:'after-source-proof',metadata:{network:q.source,walletAddress:wallet}})
// Only explicit terminal provider evidence with an empty correlation list releases an unsigned challenge.
const unsigned={...b,ownerId:'unsigned-'+randomUUID(),id:randomUUID()},uq={...q,ownerId:unsigned.ownerId}
await service.execute(unsigned,uq,'session');challenge={id:challengeId,status:'EXPIRED',correlationIds:[]}
assert.equal((await service.cancel(unsigned,'session')).status,'not_submitted')
console.log('PASS direct CCTP: 25 exact source batch/message/debit proofs, canonical envelope/status-change rejection, atomic single dispatch, lost-response/restart, provider reference binding, hash-before-proof persistence, cancellation races and source-only release. Fixtures only; no live deployment.')
