import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,encodeFunctionData,keccak256,parseAbi,parseAbiParameters,zeroAddress} from 'viem'
import {getUserOperationHash} from 'viem/account-abstraction'
import {ARC_TRADE_ACCOUNT_ABI,ARC_TRADE_ENTRY_POINT_ABI,ARC_TRADE_ENTRY_POINT,ARC_TRADE_EXECUTION_POLICY,ARC_TRADE_IMPLEMENTATION_SLOT,arcTradeUserOperationHash,verifyArcTradeExecution,verifyArcTradeExecutionAccount,wrapArcTradeCall} from '../api/trade-agreement/arc-execution.ts'
const addr=n=>'0x'+n.repeat(40),h=n=>'0x'+n.repeat(64)
const wallet=addr('1'),token=addr('2'),escrow=addr('3'),bundler=addr('4'),implementation=addr('5')
const txHash=h('a'),blockHash=h('b'),code='0x6000',implementationCode='0x6001',entryPointCode='0x6002'
const policy={walletRuntimeHash:keccak256(code),walletImplementation:implementation,walletImplementationRuntimeHash:keccak256(implementationCode),entryPointRuntimeHash:keccak256(entryPointCode)}
const data=encodeFunctionData({abi:parseAbi(['function approve(address,uint256) returns(bool)']),functionName:'approve',args:[escrow,1250000n]})
const call={chainId:5042,account:wallet,to:token,data,value:'0'},wrapped=wrapArcTradeCall(call)
let tx,receipt,changes,blockReads,receiptReads
function reset(){
 changes={};blockReads=0;receiptReads=0
 tx={hash:txHash,from:wallet,to:token,input:data,value:0n,blockHash,blockNumber:100n}
 receipt={transactionHash:txHash,blockHash,blockNumber:100n,status:'success',logs:[]}
}
const client={
 async getChainId(){return changes.chain??5042},
 async getBlockNumber(){return changes.head??105n},
 async getBlock(){blockReads++;return {hash:changes.reorg&&blockReads>1?h('c'):changes.blockHash??blockHash}},
 async getCode({address}){return address.toLowerCase()===ARC_TRADE_ENTRY_POINT.toLowerCase()?changes.entryPointCode??entryPointCode:address===implementation?changes.implementationCode??implementationCode:changes.walletCode??code},
 async getStorageAt({slot}){assert.equal(slot,ARC_TRADE_IMPLEMENTATION_SLOT);return changes.implementation??'0x'+'0'.repeat(24)+implementation.slice(2)},
 async getTransaction(){return tx},
 async getTransactionReceipt(){receiptReads++;return changes.receiptChanged&&receiptReads>1?{...receipt,blockHash:h('c')}:receipt},
}
const verify=(patch={})=>verifyArcTradeExecution({call,transactionHash:txHash,policy,preparedAfterBlock:99n,...patch},client)
function op(callData=wrapped){return {sender:wallet,nonce:19n,initCode:'0x',callData,callGasLimit:100000n,verificationGasLimit:100000n,preVerificationGas:21000n,maxFeePerGas:10n,maxPriorityFeePerGas:1n,paymasterAndData:'0x',signature:'0x1234'}}
function event(operation,patch={}){
 const args={userOpHash:arcTradeUserOperationHash(operation),sender:operation.sender,paymaster:zeroAddress,nonce:operation.nonce,success:true,actualGasCost:1n,actualGasUsed:1n,...patch}
 return {address:ARC_TRADE_ENTRY_POINT,transactionHash:txHash,blockHash,blockNumber:100n,removed:false,
  topics:encodeEventTopics({abi:ARC_TRADE_ENTRY_POINT_ABI,eventName:'UserOperationEvent',args}),
  data:encodeAbiParameters(parseAbiParameters('uint256,bool,uint256,uint256'),[args.nonce,args.success,args.actualGasCost,args.actualGasUsed])}
}
function bundled(operation=op()){
 tx={...tx,from:bundler,to:ARC_TRADE_ENTRY_POINT,input:encodeFunctionData({abi:ARC_TRADE_ENTRY_POINT_ABI,functionName:'handleOps',args:[[operation],bundler]})}
 receipt.logs=[event(operation)]
 return operation
}
async function rejects(change,pattern){reset();change();await assert.rejects(verify,pattern)}
assert.equal(ARC_TRADE_EXECUTION_POLICY,null)
assert.equal(ARC_TRADE_IMPLEMENTATION_SLOT.length,66)
reset();assert.equal((await verify()).execution,'direct')
receipt.status='reverted';assert.equal((await verify()).status,'reverted')
reset();tx={...tx,from:bundler,to:wallet,input:wrapped};assert.equal((await verify()).execution,'circle_smart_wallet')
reset();const operation=bundled();const result=await verify();assert.equal(result.status,'confirmed');assert.equal(result.execution,'circle_user_operation')
// Independently cross-check the local v0.6 hashing formula with viem.
assert.equal(result.userOperationHash,getUserOperationHash({userOperation:operation,entryPointAddress:ARC_TRADE_ENTRY_POINT,entryPointVersion:'0.6',chainId:5042}))
assert.equal(arcTradeUserOperationHash({...operation,signature:'0xabcd'}),result.userOperationHash)
for(const destination of [token,wallet]){
 reset();bundled(op(encodeFunctionData({abi:ARC_TRADE_ACCOUNT_ABI,functionName:'execute',args:[destination,0n,destination===token?data:wrapped]})))
 assert.equal((await verify()).status,'confirmed')
}
reset();bundled();receipt.logs=[event(op(),{success:false})];assert.equal((await verify()).status,'reverted','a successful bundle can contain a failed Trade operation')
reset();bundled();receipt.status='reverted';receipt.logs=[];assert.equal((await verify()).status,'reverted')
await rejects(()=>{changes.chain=5042002},/network/)
await rejects(()=>{changes.head=104n},/confirmations/)
await rejects(()=>{changes.blockHash=h('c')},/canonical/)
await rejects(()=>{changes.reorg=true},/changed during/)
await rejects(()=>{changes.receiptChanged=true},/changed during/)
await rejects(()=>{tx.value=1n},/do not match/)
await rejects(()=>{tx.hash=h('c')},/do not match/)
await rejects(()=>{receipt.transactionHash=h('c')},/do not match/)
await rejects(()=>{tx.blockNumber=null},/do not match/)
await rejects(()=>{tx.blockHash=h('c')},/do not match/)
await rejects(()=>{tx.from=bundler},/prepared call/)
await rejects(()=>{tx.to=escrow},/prepared call/)
await rejects(()=>{tx.input+='00'},/prepared call/)
await rejects(()=>{bundled();changes.walletCode='0x6003'},/runtime/)
await rejects(()=>{bundled();changes.entryPointCode='0x6003'},/runtime/)
await rejects(()=>{bundled();changes.implementation='0x'+'0'.repeat(64)},/implementation/)
await rejects(()=>{bundled();changes.implementationCode='0x6003'},/runtime/)
await rejects(()=>{bundled();receipt.logs=[]},/missing or ambiguous/)
await rejects(()=>{bundled();receipt.logs.push(receipt.logs[0])},/missing or ambiguous/)
await rejects(()=>{bundled();receipt.logs[0].address=token},/missing or ambiguous/)
await rejects(()=>{bundled();receipt.logs[0].removed=true},/prepared operation/)
await rejects(()=>{bundled();receipt.logs[0].blockHash=h('c')},/prepared operation/)
for(const patch of [{sender:bundler},{userOpHash:h('c')},{nonce:20n},{paymaster:bundler}]){
 await rejects(()=>{bundled();receipt.logs=[event(op(),patch)]},/prepared operation/)
}
await rejects(()=>{bundled({...op(),sender:bundler})},/prepared call/)
await rejects(()=>{bundled(op(data))},/prepared call/)
await rejects(()=>{bundled();tx.input+='00'},/prepared call/)
await rejects(()=>{bundled(op(encodeFunctionData({abi:ARC_TRADE_ACCOUNT_ABI,functionName:'execute',args:[token,1n,data]})))},/prepared call/)
await rejects(()=>{bundled(op(encodeFunctionData({abi:ARC_TRADE_ACCOUNT_ABI,functionName:'executeBatch',args:[[{target:token,value:0n,data},{target:escrow,value:0n,data}]]})))},/prepared call/)
await rejects(()=>{bundled();tx.input=encodeFunctionData({abi:ARC_TRADE_ENTRY_POINT_ABI,functionName:'handleOps',args:[[op(),op()],bundler]})},/prepared call/)
reset();await assert.rejects(()=>verify({preparedAfterBlock:100n}),/predates/)
reset();await verifyArcTradeExecutionAccount(wallet,policy,client)
changes.walletCode='0x6004';await assert.rejects(()=>verifyArcTradeExecutionAccount(wallet,policy,client),/runtime/)
reset();changes.implementation='0x'+'0'.repeat(64);await assert.rejects(()=>verifyArcTradeExecutionAccount(wallet,policy,client),/implementation/)
reset();changes.reorg=true;await assert.rejects(()=>verifyArcTradeExecutionAccount(wallet,policy,client),/changed during/)
reset()
await assert.rejects(()=>verify({call:{...call,chainId:196}}),/Invalid prepared/)
await assert.rejects(()=>verify({policy:{...policy,walletRuntimeHash:'0x'}}),/policy/)
console.log('Arc Trade execution smoke passed: exact calls, canonical confirmations, wallet implementation, EntryPoint operation success, stale receipts and tampering. Synthetic only; no signing or broadcast.')
