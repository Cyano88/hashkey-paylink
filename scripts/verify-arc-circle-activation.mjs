import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createPublicClient,http,encodeFunctionData,parseAbi,decodeEventLog,decodeFunctionData,keccak256,encodeAbiParameters,parseAbiParameters} from 'viem'
import {loadActivationCircleKey} from './arc-circle-activation-provider.mjs'
import {verifyArcTradeExecution,verifyArcTradeExecutionAccount,ARC_TRADE_ACCOUNT_ABI,ARC_TRADE_IMPLEMENTATION_SLOT} from '../api/trade-agreement/arc-execution.ts'

async function main(){
 const journal=JSON.parse(readFileSync('.codex-temp/arc-circle-seller-activation.json','utf8'))
 const wallets=JSON.parse(readFileSync('.codex-temp/arc-circle-canary-wallets.json','utf8')).wallets
 const seller=wallets.find(w=>w.role==='seller'),buyer=wallets.find(w=>w.role==='buyer')
 assert.equal(journal.walletId,seller.walletId);assert.equal(journal.address.toLowerCase(),seller.address.toLowerCase())
 const key=await loadActivationCircleKey()
 const read=async path=>{
  const response=await fetch('https://api.circle.com/v1/w3s/'+path,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)})
  assert(response.ok,'Circle read failed: '+response.status)
  return (await response.json()).data
 }
 const from=new Date(Date.parse(journal.createdAt)-60000).toISOString()
 const listing=await read('transactions?walletIds='+encodeURIComponent(seller.walletId)+'&pageSize=50&from='+encodeURIComponent(from))
 const details=await Promise.all((listing.transactions??[]).filter(t=>t.walletId===seller.walletId).map(t=>read('transactions/'+encodeURIComponent(t.id)).then(d=>d.transaction)))
 const candidates=details.filter(t=>t.walletId===seller.walletId&&t.blockchain==='ARC'&&t.refId==='hashpaylink-arc-wallet-activate'&&t.txHash)
 assert.equal(candidates.length,1,'Activation transaction missing or ambiguous.')
 const transaction=candidates[0]
 assert(['CONFIRMED','COMPLETE'].includes(transaction.state),'Provider transaction not confirmed.')
 const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
 assert.equal(await client.getChainId(),5042)
 const receipt=await client.getTransactionReceipt({hash:transaction.txHash})
 const chainTransaction=await client.getTransaction({hash:transaction.txHash})
 writeFileSync('.codex-temp/arc-circle-seller-activation-chain.json',JSON.stringify({transaction:chainTransaction,receipt},(_,value)=>typeof value==='bigint'?value.toString():value,2)+'\n')
 console.log(JSON.stringify({transactionHash:transaction.txHash,providerState:transaction.state,to:chainTransaction.to,selector:chainTransaction.input.slice(0,10),status:receipt.status,blockNumber:String(receipt.blockNumber)}))
 const block=await client.getBlock({blockNumber:receipt.blockNumber})
 assert(Number(block.timestamp)*1000>=Date.parse(journal.createdAt)-60000,'Transaction predates activation request.')
 const previous=await client.getCode({address:seller.address,blockNumber:receipt.blockNumber-1n})
 assert(!previous||previous==='0x','Wallet was already deployed before this transaction.')
 let policy=JSON.parse(readFileSync('.codex-temp/arc-circle-runtime-candidate.json','utf8')).policyCandidate
 const token='0x3600000000000000000000000000000000000000'
 const data=encodeFunctionData({abi:parseAbi(['function transfer(address to,uint256 amount) returns (bool)']),functionName:'transfer',args:[seller.address,0n]})
 const entryPoint='0x0000000071727de22e5e9d8baf0edac6f37da032'
 const packedAbi=parseAbi(['function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops,address beneficiary)','event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)','event AccountDeployed(bytes32 indexed userOpHash,address indexed sender,address factory,address paymaster)'])
 assert.equal(chainTransaction.to?.toLowerCase(),entryPoint)
 assert.equal(chainTransaction.value,0n);assert.equal(chainTransaction.chainId,5042)
 assert.equal(receipt.status,'success');assert.equal(chainTransaction.blockHash,receipt.blockHash)
 assert.equal(block.hash,receipt.blockHash)
 const head=await client.getBlockNumber();assert(head>=receipt.blockNumber+5n)
 const decoded=decodeFunctionData({abi:packedAbi,data:chainTransaction.input})
 assert.equal(decoded.functionName,'handleOps')
 assert.equal(encodeFunctionData({abi:packedAbi,functionName:'handleOps',args:decoded.args}).toLowerCase(),chainTransaction.input.toLowerCase())
 const [ops]=decoded.args;assert.equal(ops.length,1)
 const op=ops[0];assert.equal(op.sender.toLowerCase(),seller.address.toLowerCase());assert(op.initCode.length>42)
 const wrapped=encodeFunctionData({abi:ARC_TRADE_ACCOUNT_ABI,functionName:'executeBatch',args:[[{target:token,value:0n,data}]]})
 const validCalls=[wrapped,encodeFunctionData({abi:ARC_TRADE_ACCOUNT_ABI,functionName:'execute',args:[seller.address,0n,wrapped]}),encodeFunctionData({abi:ARC_TRADE_ACCOUNT_ABI,functionName:'execute',args:[token,0n,data]})]
 assert(validCalls.some(call=>call.toLowerCase()===op.callData.toLowerCase()),'Unexpected activation calldata.')
 const packed=encodeAbiParameters(parseAbiParameters('address,uint256,bytes32,bytes32,bytes32,uint256,bytes32,bytes32'),[op.sender,op.nonce,keccak256(op.initCode),keccak256(op.callData),op.accountGasLimits,op.preVerificationGas,op.gasFees,keccak256(op.paymasterAndData)])
 const userOperationHash=keccak256(encodeAbiParameters(parseAbiParameters('bytes32,address,uint256'),[keccak256(packed),entryPoint,5042n]))
 const events=name=>receipt.logs.filter(log=>log.address.toLowerCase()===entryPoint).flatMap(log=>{
  try{const decoded=decodeEventLog({abi:packedAbi,data:log.data,topics:log.topics,strict:true});if(decoded.eventName!==name)return [];assert(!log.removed);assert.equal(log.blockHash,receipt.blockHash);return [decoded.args]}catch{return []}
 })
 const completed=events('UserOperationEvent'),deployed=events('AccountDeployed')
 assert.equal(completed.length,1);assert.equal(deployed.length,1)
 for(const event of [completed[0],deployed[0]]){assert.equal(event.userOpHash,userOperationHash);assert.equal(event.sender.toLowerCase(),seller.address.toLowerCase());assert.equal(event.paymaster.toLowerCase(),op.paymasterAndData.slice(0,42).toLowerCase())}
 assert.equal(completed[0].success,true);assert.equal(completed[0].nonce,op.nonce)
 assert.equal(deployed[0].factory.toLowerCase(),op.initCode.slice(0,42).toLowerCase())
 for(const blockNumber of [receipt.blockNumber,head]){
  assert.equal(keccak256(await client.getCode({address:seller.address,blockNumber})),policy.walletRuntimeHash)
  const slot=await client.getStorageAt({address:seller.address,slot:ARC_TRADE_IMPLEMENTATION_SLOT,blockNumber})
  assert.equal(('0x'+slot.slice(-40)).toLowerCase(),policy.walletImplementation.toLowerCase())
  assert.equal(keccak256(await client.getCode({address:policy.walletImplementation,blockNumber})),policy.walletImplementationRuntimeHash)
 }
 const entryPointRuntimeHash=keccak256(await client.getCode({address:entryPoint,blockNumber:receipt.blockNumber}))
 assert.equal(keccak256(await client.getCode({address:entryPoint,blockNumber:head})),entryPointRuntimeHash)
 const verified={status:'confirmed',transactionHash:transaction.txHash,blockHash:receipt.blockHash,blockNumber:String(receipt.blockNumber),execution:'circle_user_operation_v07',userOperationHash,entryPoint,entryPointRuntimeHash}
 policy={...policy,entryPointVersion:'0.7',entryPointRuntimeHash}
 const shared=await verifyArcTradeExecution({call:{chainId:5042,account:seller.address,to:token,data,value:'0'},transactionHash:transaction.txHash,policy,preparedAfterBlock:receipt.blockNumber-1n},client)
 assert.equal(shared.status,'confirmed');assert.equal(shared.userOperationHash,userOperationHash)
 await verifyArcTradeExecutionAccount(seller.address,policy,client)
 await verifyArcTradeExecutionAccount(buyer.address,policy,client)
 const transfers=receipt.logs.filter(log=>log.address.toLowerCase()===token.toLowerCase()).flatMap(log=>{
  try{return [decodeEventLog({abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),data:log.data,topics:log.topics,strict:true}).args]}catch{return []}
 })
 assert(transfers.some(t=>t.from.toLowerCase()===seller.address.toLowerCase()&&t.to.toLowerCase()===seller.address.toLowerCase()&&t.value===0n),'Zero-USDC self-transfer event missing.')
 assert(!transfers.some(t=>t.from.toLowerCase()===seller.address.toLowerCase()&&t.value!==0n),'Nonzero outgoing USDC transfer present.')
 assert.equal((await client.getTransactionReceipt({hash:transaction.txHash})).blockHash,receipt.blockHash)
 assert.equal((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash)
 assert.equal(await client.getChainId(),5042)
 const evidence={checkedAt:new Date().toISOString(),chainId:5042,wallet:seller.address,...verified,confirmations:String(await client.getBlockNumber()-receipt.blockNumber),providerState:transaction.state,zeroUsdcSelfTransfer:true,previouslyUndeployed:true,buyerAndSellerRuntimeMatch:true,policyCandidate:{...policy,entryPoint,entryPointRuntimeHash},productionVerifierSupportsObservedEntryPoint:true,implementationSourceReviewed:false,tradeFunded:false,productionReady:false}
 writeFileSync('.codex-temp/arc-circle-seller-activation-verified.json',JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify(evidence))
}
main().catch(error=>{console.error('Activation verification stopped: '+error.message);process.exitCode=1})
