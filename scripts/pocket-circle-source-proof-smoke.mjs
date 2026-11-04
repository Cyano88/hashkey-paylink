import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbi} from 'viem'
import {Keypair} from '@solana/web3.js'
import {buildCircleKitFeeBatch,CIRCLE_KIT_BRIDGE,CIRCLE_KIT_EVM_SOURCES} from '../api/pocket/circle-bridge-platform-fee.ts'
import {proveCircleKitSource} from '../api/pocket/circle-bridge-source-proof.ts'
import {readCircleKitSourceProof} from '../api/pocket/circle-bridge-source-reader.ts'
import {inboundChains} from '../api/pocket/inbound-bridge-networks.ts'
import {CCTP_DOMAIN} from '../api/pocket/cctp.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const wallet='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222',hash='0x'+'a'.repeat(64),env={POCKET_BRIDGE_REVENUE_BPS:'10',POCKET_BRIDGE_REVENUE_EVM_ADDRESS:'0x3333333333333333333333333333333333333333',POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS:Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey.toBase58()},events=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)','event MessageSent(bytes message)'])
let count=0
for(const source of CIRCLE_KIT_EVM_SOURCES)for(const destination of Object.keys(CCTP_DOMAIN)){
 if(source===destination)continue
 const destinationAddress=destination==='solana'?env.POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS:recipient
 const batch=await buildCircleKitFeeBatch({source,destination,walletAddress:wallet,destinationAddress,transferUnits:1000000n,providerFeeUnits:200n,reimbursementUnits:300n,finalityThreshold:2000},env)
 const expected={walletAddress:wallet,destinationAddress,txHash:hash,batch,developerFeeUnits:900n}
 const bytes=Buffer.alloc(376),write=(value,offset)=>Buffer.from(value.replace(/^0x/, '').padStart(64,'0'),'hex').copy(bytes,offset)
 bytes.writeUInt32BE(1,0);bytes.writeUInt32BE(CCTP_DOMAIN[source],4);bytes.writeUInt32BE(CCTP_DOMAIN[destination],8);bytes.writeUInt32BE(1,148);write(batch.bridgeParams.burnToken,152);write(batch.bridgeParams.mintRecipient,184);write(batch.burnUnits.toString(16),216);write(CIRCLE_KIT_BRIDGE,248);write('c8',280)
 const transfer=(from,to,value)=>({address:batch.bridgeParams.burnToken,topics:encodeEventTopics({abi:events,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[value])})
 const receipt={status:'success',transactionHash:hash,logs:[transfer(wallet,CIRCLE_KIT_BRIDGE,batch.approvalUnits),transfer(wallet,EVM_PLATFORM_TREASURY,300n),transfer(CIRCLE_KIT_BRIDGE,env.POCKET_BRIDGE_REVENUE_EVM_ADDRESS,900n),{address:'0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',topics:encodeEventTopics({abi:events,eventName:'MessageSent'}),data:encodeAbiParameters([{type:'bytes'}],['0x'+bytes.toString('hex')])}]}
 const trace={type:'CALL',to:wallet,input:batch.callData,calls:batch.calls.map(c=>({type:'CALL',from:wallet,to:c.target,input:c.data,value:'0x'+c.value.toString(16)}))}
 const blockHash='0x'+'c'.repeat(64),finalHash='0x'+'d'.repeat(64),otherHash='0x'+'e'.repeat(64)
 const chainId='0x'+inboundChains[source].id.toString(16)
 const rawReceipt={...receipt,status:'0x1',blockHash,blockNumber:'0x64',transactionIndex:'0x0',logs:receipt.logs.map((l,n)=>({...l,blockHash,blockNumber:'0x64',transactionHash:hash,transactionIndex:'0x0',logIndex:'0x'+n.toString(16),removed:false}))}
 const reader=(fault='')=>{let traced=false;return async({method,params})=>{
  if(method==='eth_chainId')return fault==='wrong-chain'||fault==='chain-switch'&&traced?'0xffff':chainId
  if(method==='eth_getTransactionReceipt'){
   if(fault==='missing-receipt'||fault==='receipt-disappears'&&traced)return null
   const r=structuredClone(rawReceipt)
   if(fault==='receipt-reorg'&&traced)r.blockHash=otherHash
   if(fault==='logs-change'&&traced)r.logs[0].data='0x'
   if(fault==='foreign-log')r.logs[0].transactionHash=otherHash
   if(fault==='duplicate-log')r.logs.push({...r.logs[0]})
   if(fault==='removed-log')r.logs[0].removed=true
   return r
  }
  if(method==='eth_getBlockByNumber'){
   if(params[0]==='finalized'){
    if(fault==='unsupported-finality')throw Error('RPC private URL must never leak')
    return {number:fault==='unfinalized'||fault==='finality-regresses'&&traced?'0x63':'0x78',hash:finalHash}
   }
   if(params[0]==='0x78')return {number:'0x78',hash:fault==='final-anchor-reorg'?otherHash:finalHash}
   return {number:'0x64',hash:fault==='wrong-block'||fault==='block-reorg'&&traced?otherHash:blockHash,transactions:[fault==='wrong-inclusion'?otherHash:hash]}
  }
  if(method==='debug_traceTransaction'){
   assert.deepEqual(params,[hash,{tracer:'callTracer'}]);traced=true
   if(fault==='trace-unavailable')throw Error('RPC private URL must never leak')
   return trace
  }
  assert.fail('Unexpected RPC method '+method)
 }}
 const verified=await readCircleKitSourceProof(expected,reader())
 assert.equal(verified.blockNumber,'100');assert.equal(verified.finalizedBlockNumber,'120');assert.equal(verified.source,source);assert.equal(verified.platformFee.developerAmountUnits,'900')
 for(const fault of ['wrong-chain','chain-switch','missing-receipt','receipt-disappears','receipt-reorg','logs-change','foreign-log','duplicate-log','removed-log','unfinalized','finality-regresses','wrong-block','block-reorg','wrong-inclusion','final-anchor-reorg'])await assert.rejects(()=>readCircleKitSourceProof(expected,reader(fault)),e=>e.code==='circle_bridge_evidence_pending',fault)
 for(const fault of ['unsupported-finality','trace-unavailable'])await assert.rejects(()=>readCircleKitSourceProof(expected,reader(fault)),e=>e.code==='circle_bridge_source_unavailable'&&!e.message.includes('private URL'),fault)
 assert.equal((await proveCircleKitSource(expected,receipt,trace)).platformFee.developerAmountUnits,'900')
 const probes=structuredClone(trace);probes.calls.unshift({type:'STATICCALL',from:wallet,to:batch.bridgeParams.burnToken,error:'execution reverted',calls:[{type:'DELEGATECALL',error:'execution reverted'}]})
 assert.equal((await proveCircleKitSource(expected,receipt,probes)).platformFee.developerAmountUnits,'900')
 probes.calls[0].type='CALL';await assert.rejects(()=>proveCircleKitSource(expected,receipt,probes))
 for(const mutate of [t=>t.error='reverted',t=>t.calls[2].error='reverted',t=>t.calls[2].input+='00',t=>t.calls.push({...t.calls[0]}),t=>t.to=recipient]){const bad=structuredClone(trace);mutate(bad);await assert.rejects(()=>proveCircleKitSource(expected,receipt,bad))}
 for(const mutate of [r=>r.status='reverted',r=>r.transactionHash='0x'+'b'.repeat(64),r=>r.logs.pop(),r=>r.logs.push({...r.logs.at(-1)}),r=>r.logs[2]=transfer(CIRCLE_KIT_BRIDGE,env.POCKET_BRIDGE_REVENUE_EVM_ADDRESS,1000n),r=>r.logs[0]=transfer(recipient,CIRCLE_KIT_BRIDGE,batch.approvalUnits),r=>r.logs[1].removed=true]){const bad=structuredClone(receipt);mutate(bad);await assert.rejects(()=>proveCircleKitSource(expected,bad,trace))}
 await assert.rejects(()=>proveCircleKitSource(expected,receipt,{type:'CALL',error:'ancestor reverted',calls:[trace]}));await assert.rejects(()=>proveCircleKitSource(expected,receipt,{type:'CALL',calls:[trace,trace]}));count++
}
console.log('PASS '+count+' Circle source proofs: exact wallet batch/message/fee evidence; reverted ancestors, duplicate messages/batches, wrong wallet/amount/hash and gross-vs-net revenue rejected. Fixtures only.')
console.log('PASS '+count+' finalized source readers across five EVM sources: canonical inclusion, log binding, finality, mid-read reorgs/chain changes and fail-closed RPC capability checks. Fixtures only; no destination settlement claim.')
