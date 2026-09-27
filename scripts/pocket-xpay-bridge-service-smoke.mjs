import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbiItem} from 'viem'
import {XPAY_CCTP,xpayBurnCalls,validateXPayAttestation} from '../api/pocket/xpay-cctp-provider.ts'
const mocks={
 '../privy-circle-link.js':`export const circleLinkKey=(o,c)=>o+':'+c;export const readCircleLink=async()=>null`,
 '../circle-solana-email.js':`export const createCircleGasStationEvmChallenge=async()=>{};export const readCircleEvmChallenge=async()=>{}`,
 './xstocks-notifications-store.js':`export const stockNoticeClient={}`,
 './xstocks-wallet-owner.js':`export const verifyStockWalletOwner=async()=>{}`,
 '../render-durable-store.js':`const stores=new Map();export const readDurableJson=async k=>structuredClone(stores.get(k));export const mutateDurableJson=async(k,fn)=>{const next=await fn(structuredClone(stores.get(k)));stores.set(k,structuredClone(next));return next}`,
}
await build({entryPoints:['api/pocket/xpay-bridge-service.ts'],outfile:'.codex-temp/xpay-service-test.mjs',bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'isolated-fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const {createXPayBridgeService}=await import('../.codex-temp/xpay-service-test.mjs')
const source='0x'+'1'.repeat(40),destination='0x'+'2'.repeat(40),hash='0x'+'3'.repeat(64),mintHash='0x'+'4'.repeat(64),blockHash='0x'+'5'.repeat(64)
const plan={source,destination,burnUnits:'1000141',maxFeeUnits:'141',minimumReceiveUnits:'1000000',finality:1000,expiresAt:Date.now()+60000}
const bytes=Buffer.alloc(376),put=(offset,value)=>Buffer.from(BigInt(value).toString(16).padStart(64,'0'),'hex').copy(bytes,offset)
bytes.writeUInt32BE(1,0);bytes.writeUInt32BE(37,4);bytes.writeUInt32BE(6,8);put(12,1)
for(const [offset,value]of [[44,XPAY_CCTP.messenger],[76,XPAY_CCTP.messenger],[108,destination],[152,XPAY_CCTP.sourceToken],[184,destination],[248,source]])put(offset,value)
bytes.writeUInt32BE(1000,140);bytes.writeUInt32BE(1000,144);bytes.writeUInt32BE(1,148);put(216,plan.burnUnits);put(280,141);put(312,140);put(344,500)
const proof={...validateXPayAttestation('0x'+bytes.toString('hex'),plan),attestation:'0x'+'a'.repeat(130)}
const event=parseAbiItem('event MessageReceived(address indexed caller,uint32 sourceDomain,bytes32 indexed nonce,bytes32 sender,uint32 indexed finalityThresholdExecuted,bytes messageBody)'),transfer=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')
const logs=[{address:XPAY_CCTP.transmitter,topics:encodeEventTopics({abi:[event],eventName:'MessageReceived',args:{caller:destination,nonce:proof.nonce,finalityThresholdExecuted:1000}}),data:encodeAbiParameters([{type:'uint32'},{type:'bytes32'},{type:'bytes'}],[37,'0x'+XPAY_CCTP.messenger.slice(2).padStart(64,'0'),proof.body])},{address:XPAY_CCTP.destinationToken,topics:encodeEventTopics({abi:[transfer],eventName:'Transfer',args:{from:'0x'+'0'.repeat(40),to:destination}}),data:encodeAbiParameters([{type:'uint256'}],[proof.amountUnits])}]
const block=async()=>({number:105n,hash:blockHash,timestamp:BigInt(Math.floor(Date.now()/1000))})
let gas=1000000n,simulations=0,lose=true;const requests=[]
const sourceClient={getChainId:async()=>196,getBlockNumber:async()=>101n,readContract:async()=>2000000n,estimateGas:async()=>100n,getGasPrice:async()=>1n,getBalance:async()=>gas,getBlock:block,getTransaction:async()=>({from:source,to:XPAY_CCTP.messenger,input:xpayBurnCalls(plan).burn.data,value:0n}),getTransactionReceipt:async()=>({status:'success',blockNumber:102n,blockHash,logs:[]})}
const destClient={getChainId:async()=>8453,getBlock:block,getBlockNumber:async()=>105n,call:async()=>{simulations++;if(simulations>1)throw Error('nonce already used')},getTransactionReceipt:async()=>({status:'success',blockNumber:102n,blockHash,logs})}
const service=createXPayBridgeService({source:sourceClient,destination:destClient,ownsStock:async(o,s)=>{assert.equal(o,'alice');assert.equal(s,source)},readLink:async()=>({circleBlockchain:'BASE',circleWalletId:'wallet',circleWalletAddress:destination}),quote:async()=>({...plan}),attest:async()=>proof,challenge:async input=>{requests.push(input.idempotencyKey);if(lose){lose=false;throw Error('response lost')}return {challengeId:'challenge'}},challengeStatus:async()=>({status:'pending',txHash:mintHash})})
const r=await service.prepare('alice','fixture-key-00000001','xp_11111111-1111-4111-8111-111111111111',source,1000000n)
gas=0n;await assert.rejects(()=>service.authorizeBurn('alice',r.id),/Not enough OKB/)
gas=1000000n;await service.authorizeBurn('alice',r.id);await assert.rejects(()=>service.authorizeBurn('alice',r.id))
await service.submitted('alice',r.id,hash);assert.equal((await service.status('alice',r.id)).state,'attested')
await assert.rejects(()=>service.mint('alice',r.id,'session'),/response lost/)
assert.equal((await service.mint('alice',r.id,'session')).challengeId,'challenge');assert.equal(requests[0],requests[1]);assert.equal(simulations,1)
assert.equal((await service.status('alice',r.id,'session')).state,'completed')
assert.equal((await service.mint('alice',r.id,'session')).record.state,'completed');assert.equal(requests.length,2)
console.log('PASS coordinator: low OKB leaves quote retryable, source proof to attestation, lost mint response reuses key without re-simulation, verified Base arrival, no terminal replay.')
