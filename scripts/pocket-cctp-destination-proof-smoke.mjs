import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem'
import bs58 from 'bs58'
import {Keypair,PublicKey} from '@solana/web3.js'
import {getAssociatedTokenAddress} from '../api/solana-token.ts'
import {SOLANA_USDC_MINT} from '../api/pocket/cctp.ts'
import {createPocketBridgeHandler} from '../api/pocket/bridge.ts'
import {readCircleBridgeStatus} from '../api/pocket/circle-bridge-status.ts'
import {proveCircleBridgeDestination,readCircleBridgeDestination,solanaCctpMessageExecuted} from '../api/pocket/circle-bridge-destination-proof.ts'
import {verifyPocketBridgeRecord} from '../api/pocket/bridge-proof.ts'
const wallet='0x'+'1'.repeat(40),recipient='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),messenger='0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',transmitter='0x81D40F21F12A8F0E3252Bccb954D722d4c464B64'
const expected={source:'base',destination:'arbitrum',sourceAddress:wallet,destinationAddress:recipient,amount:'2',txHash:'0x'+'b'.repeat(64)}
const bytes=Buffer.alloc(376),word=(v,o)=>Buffer.from(v.replace(/^0x/,'').padStart(64,'0'),'hex').copy(bytes,o)
bytes.writeUInt32BE(1,0);bytes.writeUInt32BE(6,4);bytes.writeUInt32BE(3,8);bytes.writeUInt32BE(1000,140);bytes.writeUInt32BE(1000,144);bytes.writeUInt32BE(1,148)
word('1',12);word(messenger,44);word(messenger,76);word('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',152);word(recipient,184);word(wallet,248)
for(const [n,o] of [[2100000,216],[100000,280],[50000,312]])word(n.toString(16),o)
const raw='0x'+bytes.toString('hex'),abi=parseAbi(['event MessageReceived(address indexed caller,uint32 sourceDomain,bytes32 indexed nonce,bytes32 sender,uint32 indexed finalityThresholdExecuted,bytes messageBody)','event Transfer(address indexed from,address indexed to,uint256 value)'])
const receipt={status:'success',transactionHash:hash,logs:[{address:transmitter,removed:false,topics:encodeEventTopics({abi,eventName:'MessageReceived',args:{caller:wallet,nonce:'0x'+bytes.subarray(12,44).toString('hex'),finalityThresholdExecuted:1000}}),data:encodeAbiParameters([{type:'uint32'},{type:'bytes32'},{type:'bytes'}],[6,'0x'+bytes.subarray(44,76).toString('hex'),'0x'+bytes.subarray(148).toString('hex')])},{address:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831',removed:false,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:'0x'+'0'.repeat(40),to:recipient}}),data:encodeAbiParameters([{type:'uint256'}],[2050000n])}]}
assert.equal((await proveCircleBridgeDestination(expected,raw,receipt,hash)).amountUnits,'2050000')
for(const change of [r=>r.status='reverted',r=>r.logs.shift(),r=>r.logs.pop(),r=>r.logs.push(r.logs[0]),r=>r.logs.push(r.logs[1]),r=>r.logs[0].address=wallet,r=>r.logs[1].address=wallet,r=>r.logs[0].removed=true,r=>r.logs[1].data=encodeAbiParameters([{type:'uint256'}],[2000000n]),r=>r.logs[0].topics[2]='0x'+'0'.repeat(64)]){
 const bad=structuredClone(receipt);change(bad);await assert.rejects(()=>proveCircleBridgeDestination(expected,raw,bad,hash))
}
for(const mutate of [b=>b.fill(0,12,44),b=>b.writeUInt32BE(500,144),b=>b.fill(255,312,344),b=>b.fill(0,44,76)]){const b=Buffer.from(bytes);mutate(b);await assert.rejects(()=>proveCircleBridgeDestination(expected,'0x'+b.toString('hex'),receipt,hash))}
const blockHash='0x'+'c'.repeat(64),anchor='0x'+'d'.repeat(64)
function rpc(fault=''){let reads=0;return async({method,params})=>{
 if(method==='eth_chainId')return fault==='network'?'0x1':'0xa4b1'
 if(method==='eth_getTransactionReceipt'){reads++;return {...receipt,status:'0x1',blockHash,blockNumber:'0x64',transactionIndex:'0x0',logs:receipt.logs.map((l,i)=>({...l,blockHash,blockNumber:'0x64',transactionHash:hash,transactionIndex:'0x0',logIndex:'0x'+i.toString(16),...(fault==='changed'&&reads>1?{data:'0x'}:{})}))}}
 if(method==='eth_getBlockByNumber'){if(params[0]==='finalized')return {number:fault==='pending'?'0x63':'0x78',hash:anchor};if(params[0]==='0x78')return {number:'0x78',hash:anchor};return {number:'0x64',hash:fault==='reorg'&&reads>1?anchor:blockHash,transactions:[hash]}}
 assert.fail('Receipt proof must not request traces: '+method)
}}
assert.equal((await readCircleBridgeDestination(expected,raw,hash,{evm:rpc()})).amountUnits,'2050000')
for(const fault of ['network','changed','pending','reorg'])await assert.rejects(()=>readCircleBridgeDestination(expected,raw,hash,{evm:rpc(fault)}))
const data=Buffer.concat([createHash('sha256').update('global:receive_message').digest().subarray(0,8),Buffer.alloc(4),bytes,Buffer.from([65,0,0,0]),Buffer.alloc(65)]);data.writeUInt32LE(bytes.length,8)
const ix={programId:'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',data:bs58.encode(data)},tx={transaction:{message:{instructions:[ix]}}}
assert.equal(solanaCctpMessageExecuted(tx,raw),true)
for(const bad of [{transaction:{message:{instructions:[ix,ix]}}},{transaction:{message:{instructions:[{...ix,programId:wallet}]}}},{transaction:{message:{instructions:[]}},meta:{innerInstructions:[{instructions:[ix]}]}}])assert.equal(solanaCctpMessageExecuted(bad,raw),false)
const changed=Buffer.from(data);changed[30]^=1;assert.equal(solanaCctpMessageExecuted({transaction:{message:{instructions:[{...ix,data:bs58.encode(changed)}]}}},raw),false)
await assert.rejects(()=>verifyPocketBridgeRecord({...expected,destinationTxHash:''},async()=>new Response(JSON.stringify({messages:[{status:'complete',message:raw}]}))))
const solWallet=Keypair.generate().publicKey.toBase58(),solHash='2'.repeat(88),solBlock=Keypair.generate().publicKey.toBase58(),solBytes=Buffer.from(bytes)
solBytes.writeUInt32BE(5,8);Buffer.from(new PublicKey('CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe').toBytes()).copy(solBytes,76)
Buffer.from((await getAssociatedTokenAddress(SOLANA_USDC_MINT,new PublicKey(solWallet),true)).toBytes()).copy(solBytes,184)
const solRaw='0x'+solBytes.toString('hex'),solExpected={...expected,destination:'solana',destinationAddress:solWallet}
const solData=Buffer.from(data);solBytes.copy(solData,12)
const token=amount=>({accountIndex:0,owner:solWallet,mint:SOLANA_USDC_MINT.toBase58(),uiTokenAmount:{decimals:6,amount}})
function solRpc(fault=''){let reads=0;return {
 getGenesisHash:async()=>'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',getSlot:async()=>110,getBlockSignatures:async()=>({blockhash:solBlock,signatures:[solHash]}),
 getParsedTransaction:async()=>{reads++;return {slot:100,transaction:{signatures:[solHash],message:{instructions:fault==='unrelated'?[]:[{...ix,data:bs58.encode(fault==='changed'&&reads>1?data:solData)}]}},meta:{err:null,preTokenBalances:[token('0')],postTokenBalances:[token(fault==='amount'?'2000000':'2050000')]}}}
}}
assert.equal((await readCircleBridgeDestination(solExpected,solRaw,solHash,{solana:solRpc()})).amountUnits,'2050000')
for(const fault of ['unrelated','amount','changed'])await assert.rejects(()=>readCircleBridgeDestination(solExpected,solRaw,solHash,{solana:solRpc(fault)}))
let writes=0,verified=0
const handler=createPocketBridgeHandler({verifyUser:async()=>({userId:'fixture'}),readLink:async()=>({circleWalletAddress:wallet}),fetcher:async()=>new Response(JSON.stringify({messages:[{status:'complete',message:raw,forwardState:'confirmed',forwardTxHash:hash}]})),verifyRecord:async proof=>{verified++;assert.equal(proof.destinationTxHash,hash);throw Object.assign(Error('Destination proof missing'),{status:409})},record:async()=>{writes++},appendLedger:async()=>{writes++}})
const res={statusCode:200,status(n){this.statusCode=n;return this},json(value){this.body=value;return this}}
await handler({method:'POST',headers:{},body:{action:'record',status:'completed',source:'base',destination:'arbitrum',amount:'2',txHash:expected.txHash}},res)
assert.equal(verified,1);assert.equal(writes,0);assert.equal(res.statusCode,409)
await handler({method:'GET',headers:{},query:{action:'status',source:'base',txHash:expected.txHash}},res)
assert.equal(verified,2);assert.equal(writes,0);assert.equal(res.statusCode,409)
for(const owner of [{ownerId:'fixture',destination:'base',amount:'2'},{ownerId:'fixture',destination:'arbitrum',amount:'3'}])await assert.rejects(()=>readCircleBridgeStatus('base',expected.txHash,async()=>new Response(JSON.stringify({messages:[{status:'complete',message:raw,forwardState:'confirmed',forwardTxHash:hash}]})),owner),/saved route/)
console.log('PASS CCTP destination: exact nonce/body/sender and actual fee-adjusted USDC mint; unrelated/duplicate/changed receipts rejected; canonical finality without traces; Solana top-level exact-message binding. Fixtures only.')
