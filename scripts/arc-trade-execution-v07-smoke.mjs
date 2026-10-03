import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,encodeFunctionData,decodeFunctionData,encodeFunctionResult,keccak256,parseAbiParameters,zeroAddress,toHex} from 'viem'
import {getUserOperationHash} from 'viem/account-abstraction'
import {ARC_TRADE_WALLET_STATE_ABI,ARC_TRADE_ENTRY_POINT,ARC_TRADE_ENTRY_POINT_V07,ARC_TRADE_ENTRY_POINT_V07_ABI,ARC_TRADE_ENTRY_POINT_ABI,arcTradePackedUserOperationHash,verifyArcTradeExecution,verifyArcTradeExecutionAccount,wrapArcTradeCall} from '../api/trade-agreement/arc-execution.ts'
const address=n=>'0x'+n.repeat(40),hash=n=>'0x'+n.repeat(64)
const account=address('1'),target=address('2'),implementation=address('3'),bundler=address('4'),paymaster=address('5')
const call={chainId:5042,account,to:target,data:'0x12345678',value:'0'}
const code='0x6001',implCode='0x6002',entryCode='0x6003',txHash=hash('a'),blockHash=hash('b')
const policy={entryPointVersion:'0.7',walletRuntimeHash:keccak256(code),walletImplementation:implementation,walletImplementationRuntimeHash:keccak256(implCode),entryPointRuntimeHash:keccak256(entryCode)}
const unpacked={sender:account,nonce:7n,factory:address('6'),factoryData:'0x1234',callData:wrapArcTradeCall(call),callGasLimit:100000n,verificationGasLimit:200000n,preVerificationGas:21000n,maxFeePerGas:20n,maxPriorityFeePerGas:2n,paymaster,paymasterVerificationGasLimit:30000n,paymasterPostOpGasLimit:40000n,paymasterData:'0xabcd',signature:'0x1234'}
const op={sender:account,nonce:7n,initCode:unpacked.factory+unpacked.factoryData.slice(2),callData:unpacked.callData,accountGasLimits:toHex((200000n<<128n)|100000n,{size:32}),preVerificationGas:21000n,gasFees:toHex((2n<<128n)|20n,{size:32}),paymasterAndData:paymaster+toHex(30000n,{size:16}).slice(2)+toHex(40000n,{size:16}).slice(2)+'abcd',signature:'0x1234'}
assert.equal(arcTradePackedUserOperationHash(op),getUserOperationHash({userOperation:unpacked,entryPointAddress:ARC_TRADE_ENTRY_POINT_V07,entryPointVersion:'0.7',chainId:5042}))
assert.equal(arcTradePackedUserOperationHash({...op,signature:'0xff'}),arcTradePackedUserOperationHash(op))
let tx,receipt,options,reads
const log=(operation=op,patch={})=>{
 const args={userOpHash:arcTradePackedUserOperationHash(operation),sender:account,paymaster,nonce:operation.nonce,success:true,...patch}
 return {address:ARC_TRADE_ENTRY_POINT_V07,transactionHash:txHash,blockHash,blockNumber:100n,topics:encodeEventTopics({abi:ARC_TRADE_ENTRY_POINT_ABI,eventName:'UserOperationEvent',args}),data:encodeAbiParameters(parseAbiParameters('uint256,bool,uint256,uint256'),[args.nonce,args.success,1n,1n])}
}
const bundle=operations=>encodeFunctionData({abi:ARC_TRADE_ENTRY_POINT_V07_ABI,functionName:'handleOps',args:[operations,bundler]})
function reset(){reads=0;options={};tx={hash:txHash,from:bundler,to:ARC_TRADE_ENTRY_POINT_V07,value:0n,input:bundle([op]),blockNumber:100n,blockHash};receipt={transactionHash:txHash,blockNumber:100n,blockHash,status:'success',logs:[log()]}}
const client={getChainId:async()=>options.chain??5042,getBlockNumber:async()=>options.head??105n,getBlock:async()=>({hash:blockHash}),getTransaction:async()=>tx,getTransactionReceipt:async()=>++reads>1&&options.reorg?{...receipt,blockHash:hash('c')}:receipt,getStorageAt:async()=>options.slot??'0x'+'0'.repeat(24)+implementation.slice(2),getCode:async({address})=>address.toLowerCase()===ARC_TRADE_ENTRY_POINT_V07.toLowerCase()?options.entryCode??entryCode:address===implementation?implCode:code}
const baseGetCode=client.getCode
client.getCode=async args=>args.address===address('7')?(options.ownerCode??'0x'):baseGetCode(args)
client.call=async({data,blockNumber})=>{
 assert([100n,105n].includes(blockNumber))
 const {functionName}=decodeFunctionData({abi:ARC_TRADE_WALLET_STATE_ABI,data})
 const ref={plugin:zeroAddress,functionId:0}
 const result={getEntryPoint:options.walletEntry??ARC_TRADE_ENTRY_POINT_V07,getNativeOwner:options.owner??address('7'),getInstalledPlugins:options.plugins??[],getExecutionHooks:options.hooks??[],getPreValidationHooks:options.preHooks??[[],[]],getExecutionFunctionConfig:options.config??{plugin:account,userOpValidationFunction:ref,runtimeValidationFunction:ref}}[functionName]
 return {data:encodeFunctionResult({abi:ARC_TRADE_WALLET_STATE_ABI,functionName,result})}
}
const verify=(patch={})=>verifyArcTradeExecution({call,transactionHash:txHash,policy,preparedAfterBlock:99n,...patch},client)
reset();assert.equal((await verify()).status,'confirmed');await verifyArcTradeExecutionAccount(account,policy,client)
reset();receipt.logs=[log(op,{success:false})];assert.equal((await verify()).status,'reverted')
reset();receipt.status='reverted';receipt.logs=[];assert.equal((await verify()).status,'reverted')
for(const [change,pattern] of [
 [()=>{tx.to=ARC_TRADE_ENTRY_POINT},/prepared call/],
 [()=>{tx.input+='00'},/prepared call/],
 [()=>{tx.input=bundle([op,op])},/prepared call/],
 [()=>{tx.input=bundle([{...op,sender:bundler}])},/prepared call/],
 [()=>{tx.input=bundle([{...op,callData:wrapArcTradeCall({...call,to:bundler})}])},/prepared call/],
 [()=>{tx.input=bundle([{...op,gasFees:toHex(1n,{size:32})}])},/prepared operation/],
 [()=>{receipt.logs=[log(op,{userOpHash:hash('c')})]},/prepared operation/],
 [()=>{receipt.logs=[log(op,{paymaster:zeroAddress})]},/prepared operation/],
 [()=>{receipt.logs=[log(op,{nonce:8n})]},/prepared operation/],
 [()=>{receipt.logs[0].removed=true},/prepared operation/],
 [()=>{receipt.logs.push(receipt.logs[0])},/ambiguous/],
 [()=>{receipt.logs=[]},/missing/],
 [()=>{options.entryCode='0x6009'},/runtime/],
 [()=>{options.slot='0x'+'0'.repeat(64)},/implementation/],
 [()=>{options.chain=5042002},/network/],
 [()=>{options.head=104n},/confirmations/],
 [()=>{options.reorg=true},/changed during/],
 [()=>{tx={...tx,from:account,to:target,input:call.data}},/smart-wallet execution/],
 [()=>{options.plugins=[bundler]},/configuration/],
 [()=>{options.owner=zeroAddress},/configuration/],
 [()=>{options.ownerCode='0x6009'},/EOA/],
 [()=>{options.walletEntry=ARC_TRADE_ENTRY_POINT},/configuration/],
 [()=>{options.hooks=[{preExecHook:{plugin:bundler,functionId:1},postExecHook:{plugin:zeroAddress,functionId:0}}]},/hooks/],
 [()=>{options.preHooks=[[{plugin:bundler,functionId:1}],[]]},/hooks/],
 [()=>{options.config={plugin:account,userOpValidationFunction:{plugin:bundler,functionId:1},runtimeValidationFunction:{plugin:zeroAddress,functionId:0}}},/validation plugins/],
]){reset();change();await assert.rejects(verify,pattern)}
reset();await assert.rejects(()=>verify({policy:{...policy,entryPointVersion:'0.6'}}),/prepared call/)
reset();await assert.rejects(()=>verify({policy:{...policy,entryPointVersion:'0.8'}}),/policy/)
reset();await assert.rejects(()=>verify({call:{...call,to:ARC_TRADE_ENTRY_POINT_V07}}),/Invalid prepared/)
console.log('Arc Trade v0.7 passed: independent packed hash, scoped policy, success/revert, mutation and reorg rejection.')
