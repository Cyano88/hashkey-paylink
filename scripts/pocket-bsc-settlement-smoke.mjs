import {bscCollectedCoverage} from '../api/pocket/bsc-collected-coverage.ts'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {encodeEventTopics,encodeAbiParameters,encodeFunctionData,parseAbi,toHex} from 'viem'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {readBscSwapSettlement} from '../api/pocket/bsc-settlement.ts'
import {POCKET_BSC} from '../src/pocket/lib/pocketBsc.ts'
import {bscSponsoredSwapCalls} from '../src/pocket/lib/pocketBscSwap.ts'
import {encodeXLayerSponsoredBatch,XLAYER_ENTRY_POINT} from '../api/pocket/xlayer-sponsored-cost.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const quotes=JSON.parse(readFileSync('scripts/fixtures/bsc-live-quotes.json','utf8'))
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),userOp='0x'+'c'.repeat(64)
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const opAbi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
const orderAbi=parseAbi(['event OrderRecord(address fromToken,address toToken,address sender,uint256 fromAmount,uint256 returnAmount)'])
const transfer=(token,from,to,value)=>({address:token,topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[value])})
function fixture(q){
 const native=q.from==='BNB',input=POCKET_BSC.assets[q.from],output=POCKET_BSC.assets[q.to]
 const order={address:POCKET_BSC.router,topics:encodeEventTopics({abi:orderAbi,eventName:'OrderRecord'}),data:encodeAbiParameters([{type:'address'},{type:'address'},{type:'address'},{type:'uint256'},{type:'uint256'}],[input.address,output.address,q.walletAddress,BigInt(q.tradeInputUnits),BigInt(q.expectedOutUnits)])}
 const logs=[order]
 let callData=q.tx.data
 if(native)logs.push(transfer(output.address,POCKET_BSC.router,q.walletAddress,BigInt(q.expectedOutUnits)))
 else{
  const op={sender:q.walletAddress,nonce:1n,initCode:'0x',callData:encodeXLayerSponsoredBatch(bscSponsoredSwapCalls(q,q.issuedAt)),accountGasLimits:toHex(0n,{size:32}),preVerificationGas:0n,gasFees:toHex(0n,{size:32}),paymasterAndData:'0x',signature:'0x'}
  callData=encodeFunctionData({abi:entryPoint07Abi,functionName:'handleOps',args:[[op],q.walletAddress]})
  logs.push({address:XLAYER_ENTRY_POINT,topics:encodeEventTopics({abi:opAbi,eventName:'UserOperationEvent',args:{userOpHash:userOp,sender:q.walletAddress,paymaster:q.walletAddress}}),data:encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[1n,true,0n,1n])},transfer(input.address,q.walletAddress,POCKET_BSC.router,BigInt(q.tradeInputUnits)),transfer(input.address,q.walletAddress,EVM_PLATFORM_TREASURY,BigInt(q.reimbursementUnits)))
 }
 const s={chain:'0x38',head:'0x1e',missing:false,blockHash,tx:{hash,from:q.walletAddress,to:native?POCKET_BSC.router:XLAYER_ENTRY_POINT,blockHash,blockNumber:'0x10',chainId:'0x38',input:callData,value:toHex(BigInt(q.tx.value)),gas:toHex(BigInt(q.nativeGas?.gasLimit||'1')),maxFeePerGas:toHex(BigInt(q.nativeGas?.maxFeePerGas||'1'))},r:{transactionHash:hash,to:native?POCKET_BSC.router:XLAYER_ENTRY_POINT,blockHash,blockNumber:'0x10',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x1',logs}}
 const rpc=async method=>{
  if(method==='eth_chainId')return s.chain
  if(method==='eth_getTransactionByHash')return s.tx
  if(method==='eth_getTransactionReceipt')return s.missing?null:s.r
  if(method==='eth_getBlockByNumber')return {hash:s.blockHash,number:'0x10'}
  if(method==='eth_blockNumber')return s.head
  throw Error('Unexpected RPC')
 }
 return {s,rpc,read:()=>readBscSwapSettlement(q,hash,rpc,native?undefined:userOp)}
}
for(const q of quotes){
 let f=fixture(q);assert.deepEqual(await f.read(),{status:'completed',amountOutUnits:q.expectedOutUnits,...(q.from==='BNB'?{nativeFeeUnits:'21000'}:{})})
 f.s.head='0x1d';assert.equal((await f.read()).status,'pending')
 f=fixture(q);f.s.missing=true;assert.equal((await f.read()).status,'pending')
 f=fixture(q);f.s.r.status='0x0';assert.equal((await f.read()).status,'failed')
 for(const edit of [s=>s.chain='0xc4',s=>s.tx.chainId='0xc4',s=>s.blockHash='0x'+'d'.repeat(64),s=>s.r.logs=[],s=>s.tx.input='0x12345678',s=>s.r.logs.push(s.r.logs[0])]){
  f=fixture(q);edit(f.s);await assert.rejects(f.read)
 }
 f=fixture(q);f.s.r.logs.pop();await assert.rejects(f.read,'Missing reimbursement or output must never report success')
 if(q.from!=='BNB'){
  f=fixture(q);f.s.r.logs[1].data=encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[1n,false,0n,1n]);assert.equal((await f.read()).status,'failed','User operation failure inside successful outer receipt')
 }
}
console.log('PASS BSC settlement: four routes, canonical confirmations, exact signed calls, internal operation failure, fee collection, actual output, missing evidence and wrong-chain rejection; fixtures only')

const stable=structuredClone(quotes.find(q=>q.from==='USDC'))
stable.reimbursementUnits='10000000000000000';stable.totalInputUnits=String(BigInt(stable.tradeInputUnits)+BigInt(stable.reimbursementUnits))
let f=fixture(stable)
const op={quote:stable,state:'completed',createdAt:stable.issuedAt,hash,userOperationHash:userOp}
const d={now:stable.issuedAt,rpc:f.rpc,prices:async()=>({USDC:{scaled8:100000000n,observedAt:stable.issuedAt}})}
assert.equal((await bscCollectedCoverage([op],d))[0].coverageUsdMicros,9500n)
assert.deepEqual(await bscCollectedCoverage([op],d,'0x'+'2'.repeat(40)),[])
await assert.rejects(()=>bscCollectedCoverage([{...op,state:'pending'}],d))
await assert.rejects(()=>bscCollectedCoverage([op,op],d))
f.s.r.logs.pop();await assert.rejects(()=>bscCollectedCoverage([op],d))
f=fixture(stable);f.s.r.status='0x0';assert.equal((await bscCollectedCoverage([{...op,state:'failed'}],{...d,rpc:f.rpc}))[0].coverageUsdMicros,0n)
console.log('PASS supplementary BSC coverage requires canonical receipt and exact reimbursement; pending, duplicates and missing fees never count')
