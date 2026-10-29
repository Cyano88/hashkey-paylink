import {bscSendCoverage} from '../api/pocket/bsc-send-coverage.ts'
import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,encodeFunctionData,parseAbi,toHex} from 'viem'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {bscSendCalls,bscSendRequest,validateBscSend} from '../src/pocket/lib/pocketBscSend.ts'
import {readBscSendSettlement} from '../api/pocket/bsc-send-settlement.ts'
import {createBscSendOperations} from '../api/pocket/bsc-send-operations.ts'
import {POCKET_BSC} from '../src/pocket/lib/pocketBsc.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
import {encodeXLayerSponsoredBatch,XLAYER_ENTRY_POINT} from '../api/pocket/xlayer-sponsored-cost.ts'
const now=Date.now(),hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),userOp='0x'+'c'.repeat(64)
const q={version:1,chainId:56,id:'11111111-1111-4111-8111-111111111111',transferId:'sendb_'+'1'.repeat(24),ownerId:'user',walletId:'wallet12345678',walletAddress:'0x'+'1'.repeat(40),recipient:'0x'+'2'.repeat(40),asset:'USDC',amountUnits:'1234567890123456789',reimbursementUnits:'10000000000000000',issuedAt:now,expiresAt:now+30000}
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const opAbi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
const transfer=(token,from,to,value)=>({address:token,topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[value])})
function fixture(q){
 const op={sender:q.walletAddress,nonce:1n,initCode:'0x',callData:encodeXLayerSponsoredBatch(bscSendCalls(q,q.issuedAt)),accountGasLimits:toHex(0n,{size:32}),preVerificationGas:0n,gasFees:toHex(0n,{size:32}),paymasterAndData:'0x',signature:'0x'}
 const input=encodeFunctionData({abi:entryPoint07Abi,functionName:'handleOps',args:[[op],q.walletAddress]})
 const logs=[{address:XLAYER_ENTRY_POINT,topics:encodeEventTopics({abi:opAbi,eventName:'UserOperationEvent',args:{userOpHash:userOp,sender:q.walletAddress,paymaster:q.walletAddress}}),data:encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[1n,true,0n,1n])},transfer(POCKET_BSC.assets[q.asset].address,q.walletAddress,q.recipient,BigInt(q.amountUnits)),transfer(POCKET_BSC.assets[q.asset].address,q.walletAddress,EVM_PLATFORM_TREASURY,BigInt(q.reimbursementUnits))]
 const s={chain:'0x38',head:'0x1e',blockHash,tx:{hash,to:XLAYER_ENTRY_POINT,blockHash,blockNumber:'0x10',chainId:'0x38',input},receipt:{transactionHash:hash,to:XLAYER_ENTRY_POINT,blockHash,blockNumber:'0x10',status:'0x1',logs}}
 const rpc=async method=>({eth_chainId:s.chain,eth_getTransactionByHash:s.tx,eth_getTransactionReceipt:s.receipt,eth_getBlockByNumber:{hash:s.blockHash,number:'0x10',timestamp:toHex(BigInt(Math.floor(now/1000)))},eth_blockNumber:s.head})[method]
 return {s,read:()=>readBscSendSettlement(q,hash,rpc,userOp)}
}
for(const asset of ['USDC','USDT']){
 const quote={...q,asset};let f=fixture(quote)
 assert.equal((await f.read()).status,'completed')
 f.s.head='0x1d';assert.equal((await f.read()).status,'pending')
 for(const change of [s=>s.chain='0xc4',s=>s.tx.chainId='0xc4',s=>s.blockHash='0x'+'d'.repeat(64),s=>s.tx.input='0x12345678',s=>s.receipt.logs.pop(),s=>s.receipt.logs[1].data=toHex(1n,{size:32}),s=>s.receipt.logs.push(s.receipt.logs[1])]){
  f=fixture(quote);change(f.s);await assert.rejects(f.read)
 }
 f=fixture(quote);f.s.receipt.logs[0].data=encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[1n,false,0n,1n]);assert.equal((await f.read()).status,'failed')
 assert.equal(bscSendRequest(quote,'app123',now).body.caip2,'eip155:56')
}
for(const edit of [{asset:'BNB'},{chainId:196},{amountUnits:'0'},{recipient:q.walletAddress},{recipient:EVM_PLATFORM_TREASURY},{expiresAt:now},{reimbursementUnits:'-1'}])assert.throws(()=>validateBscSend({...q,...edit},now))
let store,sends=0,queue=Promise.resolve()
const d={appId:'app123',now:()=>now,read:async()=>structuredClone(store),mutate:fn=>{const work=queue.then(()=>{store=fn(structuredClone(store))});queue=work.catch(()=>{});return work},approve:async()=>true,preflight:async()=>{},send:async()=>{sends++;throw Error('timeout')},transaction:async()=>null,settle:async()=>({status:'completed'}),blockNumber:async()=>'0x10'}
let operations=createBscSendOperations(d)
await operations.prepare(q,'approval')
await operations.cancel(q.id,q)
assert.equal((await operations.submit(q.id,q,'signature')).state,'cancelled');assert.equal(sends,0)
store=undefined;await operations.prepare(q,'approval')
await Promise.all([operations.submit(q.id,q,'signature'),operations.submit(q.id,q,'signature')]);assert.equal(sends,1)
operations=createBscSendOperations(d);await operations.submit(q.id,q,'signature');assert.equal(sends,1,'Restart must not retry unknown broadcasts')
assert.equal((await operations.cancel(q.id,q)).state,'pending','Closing a submitted payment cannot cancel it')
await assert.rejects(()=>operations.prepare({...q,id:'22222222-2222-4222-8222-222222222222',ownerId:'another',walletId:'anotherwallet123',walletAddress:'0x'+'3'.repeat(40)},'approval'),'Transfer locked across payers')
await assert.rejects(()=>operations.read(q.id,{...q,ownerId:'another'}))
console.log('PASS BNB send: exact 18-decimal recipient and fee proof, wrong-chain/reorg/underpayment rejection, unsigned cancellation, concurrent/restarted submission safety and transfer ownership. Fixtures only.')

const proof=fixture(q),coverageOp={quote:q,state:'completed',createdAt:now,hash,userOperationHash:userOp}
const coverageContext={now,rpc:async method=>({eth_chainId:proof.s.chain,eth_getTransactionByHash:proof.s.tx,eth_getTransactionReceipt:proof.s.receipt,eth_getBlockByNumber:{hash:proof.s.blockHash,number:'0x10',timestamp:toHex(BigInt(Math.floor(now/1000)))},eth_blockNumber:proof.s.head})[method],prices:async()=>({USDC:{scaled8:100000000n,observedAt:now}})}
assert.equal((await bscSendCoverage([coverageOp],coverageContext))[0].coverageUsdMicros,9500n)
await assert.rejects(()=>bscSendCoverage([{...coverageOp,state:'pending'}],coverageContext))
await assert.rejects(()=>bscSendCoverage([coverageOp,coverageOp],coverageContext))
proof.s.receipt.logs.pop();await assert.rejects(()=>bscSendCoverage([coverageOp],coverageContext))
console.log('PASS BNB transfer fee coverage: canonical reimbursement only; pending, duplicate and missing-fee records blocked.')
