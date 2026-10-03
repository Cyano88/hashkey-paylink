import { decodeEventLog, decodeFunctionData, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, parseAbi, parseAbiParameters, stringToHex, toHex, toFunctionSelector, zeroAddress, type Address, type Hex } from 'viem'

// Candidate verification only: this module neither signs nor broadcasts. HTTP
// integration must persist the trusted planner's call before issuing a challenge.
export const ARC_TRADE_ENTRY_POINT = getAddress('0x5FF137D4b0FDcd49DCa30c7CF57E578a026d2789')
export const ARC_TRADE_ENTRY_POINT_V07 = getAddress('0x0000000071727De22E5E9d8BAf0edAc6f37da032')
export const ARC_TRADE_IMPLEMENTATION_SLOT = toHex(BigInt(keccak256(stringToHex('eip1967.proxy.implementation')))-1n,{size:32})
export const ARC_TRADE_ACCOUNT_ABI = parseAbi([
  'function execute(address dest,uint256 value,bytes func)',
  'function executeBatch((address target,uint256 value,bytes data)[] calls)',
])
export const ARC_TRADE_ENTRY_POINT_ABI = parseAbi([
  'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)',
  'event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)',
])
export type ArcTradeExecutionCall = { chainId:5042; account:Address; to:Address; data:Hex; value:'0' }
export const ARC_TRADE_ENTRY_POINT_V07_ABI = parseAbi([
  'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)',
])
type PackedOperation = {sender:Address;nonce:bigint;initCode:Hex;callData:Hex;accountGasLimits:Hex;preVerificationGas:bigint;gasFees:Hex;paymasterAndData:Hex;signature:Hex}
type Operation = {
  sender:Address; nonce:bigint; initCode:Hex; callData:Hex; callGasLimit:bigint;
  verificationGasLimit:bigint; preVerificationGas:bigint; maxFeePerGas:bigint;
  maxPriorityFeePerGas:bigint; paymasterAndData:Hex; signature:Hex;
}
type Log = { address:Address; data:Hex; topics:readonly Hex[]; removed?:boolean; transactionHash:Hex; blockHash:Hex; blockNumber:bigint }
export type ArcTradeExecutionReader = {
  call?(input:{to:Address;data:Hex;blockNumber:bigint}):Promise<{data?:Hex}>;
  getChainId():Promise<number>;
  getBlockNumber(input:{cacheTime:0}):Promise<bigint>;
  getBlock(input:{blockNumber:bigint}):Promise<{hash:Hex|null}>;
  getCode(input:{address:Address;blockNumber:bigint}):Promise<Hex|undefined>;
  getStorageAt(input:{address:Address;slot:Hex;blockNumber:bigint}):Promise<Hex|undefined>;
  getTransaction(input:{hash:Hex}):Promise<{hash:Hex;from:Address;to:Address|null;input:Hex;value:bigint;blockHash:Hex|null;blockNumber:bigint|null}>;
  getTransactionReceipt(input:{hash:Hex}):Promise<{transactionHash:Hex;blockHash:Hex;blockNumber:bigint;status:'success'|'reverted';logs:readonly Log[]}>;
}
const equal = (a:string,b:string) => a.toLowerCase() === b.toLowerCase()
const hash = (value:unknown): value is Hex => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value) && !/^0x0{64}$/i.test(value)
function assertCall(call:ArcTradeExecutionCall) {
  if (call.chainId !== 5042 || call.value !== '0' || !/^0x(?:[a-f0-9]{2}){4,}$/i.test(call.data)
    || getAddress(call.account) === zeroAddress || getAddress(call.to) === zeroAddress
    || equal(call.account,call.to) || equal(call.to,ARC_TRADE_ENTRY_POINT) || equal(call.to,ARC_TRADE_ENTRY_POINT_V07)) throw Error('Invalid prepared Arc Trade call.')
}
export function wrapArcTradeCall(call:ArcTradeExecutionCall):Hex {
  assertCall(call)
  return encodeFunctionData({abi:ARC_TRADE_ACCOUNT_ABI,functionName:'executeBatch',args:[[{target:call.to,value:0n,data:call.data}]]})
}
// ERC-4337 v0.6 hashes dynamic fields, excludes the signature, then binds the
// packed operation to the EntryPoint and chain. No RPC-selected chain is used.
export function arcTradeUserOperationHash(op:Operation):Hex {
  const packed = encodeAbiParameters(parseAbiParameters('address,uint256,bytes32,bytes32,uint256,uint256,uint256,uint256,uint256,bytes32'),[
    op.sender,op.nonce,keccak256(op.initCode),keccak256(op.callData),op.callGasLimit,
    op.verificationGasLimit,op.preVerificationGas,op.maxFeePerGas,op.maxPriorityFeePerGas,keccak256(op.paymasterAndData),
  ])
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32,address,uint256'),[keccak256(packed),ARC_TRADE_ENTRY_POINT,5042n]))
}
export function arcTradePackedUserOperationHash(op:PackedOperation):Hex {
  const packed=encodeAbiParameters(parseAbiParameters('address,uint256,bytes32,bytes32,bytes32,uint256,bytes32,bytes32'),[
    op.sender,op.nonce,keccak256(op.initCode),keccak256(op.callData),op.accountGasLimits,op.preVerificationGas,op.gasFees,keccak256(op.paymasterAndData),
  ])
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32,address,uint256'),[keccak256(packed),ARC_TRADE_ENTRY_POINT_V07,5042n]))
}
function operationMatches(op:Operation|PackedOperation, call:ArcTradeExecutionCall, wrapped:Hex) {
  if (!equal(op.sender,call.account)) return false
  if (equal(op.callData,wrapped)) return true
  try {
    const decoded = decodeFunctionData({abi:ARC_TRADE_ACCOUNT_ABI,data:op.callData})
    if (decoded.functionName !== 'execute') return false
    const [to,value,data] = decoded.args
    // Require canonical encoding; reject extra bytes and extra inner calls.
    return value === 0n && equal(op.callData,encodeFunctionData({abi:ARC_TRADE_ACCOUNT_ABI,functionName:'execute',args:[to,value,data]}))
      && ((equal(to,call.to) && equal(data,call.data)) || (equal(to,call.account) && equal(data,wrapped)))
  } catch { return false }
}
export type ArcTradeExecutionResult = {
  status:'confirmed'|'reverted'; transactionHash:Hex; blockHash:Hex; blockNumber:string;
  execution:'direct'|'circle_smart_wallet'|'circle_user_operation'; userOperationHash?:Hex;
}
// Runtime hashes are source-reviewed policy, never browser/environment input.
// Pin the wallet runtime too: a successful wrapper cannot prove inner execution
// unless the reviewed wallet implementation propagates inner call failures.
export type ArcTradeExecutionPolicy = {
  // Omitted only for existing v0.6 callers. Never infer the version from a tx.
  entryPointVersion?:'0.6'|'0.7';
  walletRuntimeHash:Hex; entryPointRuntimeHash:Hex;
  walletImplementation:Address; walletImplementationRuntimeHash:Hex;
}
// Source-reviewed Circle v0.7 implementation, verified by the mainnet funding
// and full-refund canary. Project and runtime activation remain separate gates.
export const ARC_TRADE_EXECUTION_POLICY:ArcTradeExecutionPolicy|null = {
    "entryPointVersion":  "0.7",
    "walletRuntimeHash":  "0xd09e34b2e51f09092e73e3ba1d520a42972496bf2a3bfdb22bb50b9729a9fd66",
    "entryPointRuntimeHash":  "0x8db5ff695839d655407cc8490bb7a5d82337a86a6b39c3f0258aa6c3b582fc58",
    "walletImplementation":  "0x9C6E09bc32d1E012dCaA2623E66d2Cc9860C1AeD",
    "walletImplementationRuntimeHash":  "0x60ecaaadc845f14626e77541b390bd36a7f5c35efdee5c30471f0eb08626019e"
}
function policyEntryPoint(policy:ArcTradeExecutionPolicy):Address {
  if(policy.entryPointVersion==='0.7')return ARC_TRADE_ENTRY_POINT_V07
  if(policy.entryPointVersion===undefined||policy.entryPointVersion==='0.6')return ARC_TRADE_ENTRY_POINT
  throw Error('Arc Trade EntryPoint policy is not verified.')
}
export const ARC_TRADE_WALLET_STATE_ABI=parseAbi([
  'function getEntryPoint() view returns(address)',
  'function getNativeOwner() view returns(address)',
  'function getInstalledPlugins() view returns(address[])',
  'function getExecutionHooks(bytes4 selector) view returns(((address plugin,uint8 functionId) preExecHook,(address plugin,uint8 functionId) postExecHook)[])',
  'function getPreValidationHooks(bytes4 selector) view returns((address plugin,uint8 functionId)[],(address plugin,uint8 functionId)[])',
  'function getExecutionFunctionConfig(bytes4 selector) view returns((address plugin,(address plugin,uint8 functionId) userOpValidationFunction,(address plugin,uint8 functionId) runtimeValidationFunction))',
])
async function verifyNativeWalletState(account:Address,policy:ArcTradeExecutionPolicy,client:ArcTradeExecutionReader,blockNumber:bigint) {
  if(policy.entryPointVersion!=='0.7')return
  if(!client.call)throw Error('Arc Trade wallet configuration reader unavailable.')
  const read=async(functionName:'getEntryPoint'|'getNativeOwner'|'getInstalledPlugins'|'getExecutionHooks'|'getPreValidationHooks'|'getExecutionFunctionConfig',selector?:Hex)=>{
    const data=encodeFunctionData({abi:ARC_TRADE_WALLET_STATE_ABI,functionName,args:selector?[selector]:undefined} as Parameters<typeof encodeFunctionData>[0])
    const result=await client.call!({to:account,data,blockNumber})
    if(!result.data)throw Error('Arc Trade wallet configuration unavailable.')
    return decodeFunctionResult({abi:ARC_TRADE_WALLET_STATE_ABI,functionName,data:result.data})
  }
  const [entry,owner,plugins]=await Promise.all([read('getEntryPoint'),read('getNativeOwner'),read('getInstalledPlugins')])
  if(typeof entry!=='string'||!equal(entry,policyEntryPoint(policy))||typeof owner!=='string'||!/^0x[0-9a-f]{40}$/i.test(owner)||equal(owner,zeroAddress)||!Array.isArray(plugins)||plugins.length)
    throw Error('Arc Trade wallet configuration is not verified.')
  const ownerCode=await client.getCode({address:owner as Address,blockNumber})
  if(ownerCode&&ownerCode!=='0x')throw Error('Arc Trade native owner is not an EOA.')
  for(const selector of ARC_TRADE_ACCOUNT_ABI.map(item=>toFunctionSelector(item))){
    const [hooks,pre,config]=await Promise.all([read('getExecutionHooks',selector),read('getPreValidationHooks',selector),read('getExecutionFunctionConfig',selector)])
    if(!Array.isArray(hooks)||hooks.length||!Array.isArray(pre)||pre.length!==2||pre.some(list=>!Array.isArray(list)||list.length)
      ||!config||Array.isArray(config)||typeof config!=='object'||!('plugin' in config)||typeof config.plugin!=='string'||!equal(config.plugin,account))
      throw Error('Arc Trade wallet hooks are not verified.')
    for(const field of ['userOpValidationFunction','runtimeValidationFunction'] as const){
      const ref=(config as Record<string,unknown>)[field] as {plugin?:string;functionId?:number}|undefined
      if(!ref||typeof ref.plugin!=='string'||!equal(ref.plugin,zeroAddress)||ref.functionId!==0)throw Error('Arc Trade wallet validation plugins are not verified.')
    }
  }
}
export async function verifyArcTradeExecutionAccount(account:Address,policy:ArcTradeExecutionPolicy,client:ArcTradeExecutionReader) {
  const entryPoint=policyEntryPoint(policy)
  if(await client.getChainId()!==5042)throw Error('Arc Trade execution network mismatch.')
  if(!hash(policy.walletRuntimeHash)||!hash(policy.walletImplementationRuntimeHash)||!hash(policy.entryPointRuntimeHash)
    ||getAddress(policy.walletImplementation)===zeroAddress||getAddress(account)===zeroAddress)throw Error('Arc Trade execution policy is not verified.')
  const blockNumber=await client.getBlockNumber({cacheTime:0}),block=await client.getBlock({blockNumber})
  for(const [address,expected] of [[account,policy.walletRuntimeHash],[policy.walletImplementation,policy.walletImplementationRuntimeHash],[entryPoint,policy.entryPointRuntimeHash]] as const){
    const code=await client.getCode({address,blockNumber})
    if(!code||code==='0x'||!equal(keccak256(code),expected))throw Error('Arc Trade execution runtime is not verified.')
  }
  const implementation=await client.getStorageAt({address:account,slot:ARC_TRADE_IMPLEMENTATION_SLOT,blockNumber})
  if(!implementation||!/^0x0{24}[a-f0-9]{40}$/i.test(implementation)||!equal('0x'+implementation.slice(-40),policy.walletImplementation))throw Error('Arc Trade wallet implementation changed.')
  await verifyNativeWalletState(account,policy,client,blockNumber)
  const latest=await client.getBlock({blockNumber})
  if(!block.hash||!latest.hash||!equal(block.hash,latest.hash)||await client.getChainId()!==5042)throw Error('Arc Trade wallet state changed during verification.')
}
export async function verifyArcTradeExecution(input:{
  call:ArcTradeExecutionCall; transactionHash:Hex; policy:ArcTradeExecutionPolicy; preparedAfterBlock:bigint;
}, client:ArcTradeExecutionReader):Promise<ArcTradeExecutionResult> {
  const {call,transactionHash,policy} = input
  const entryPoint=policyEntryPoint(policy)
  assertCall(call)
  if (!hash(transactionHash) || !hash(policy.walletRuntimeHash) || !hash(policy.entryPointRuntimeHash)
    || !hash(policy.walletImplementationRuntimeHash) || getAddress(policy.walletImplementation) === zeroAddress
    || typeof input.preparedAfterBlock !== 'bigint' || input.preparedAfterBlock < 0n) throw Error('Arc Trade execution policy is not verified.')
  if (await client.getChainId() !== 5042) throw Error('Arc Trade execution network mismatch.')
  const [tx,receipt,head] = await Promise.all([
    client.getTransaction({hash:transactionHash}),client.getTransactionReceipt({hash:transactionHash}),client.getBlockNumber({cacheTime:0}),
  ])
  if (!equal(tx.hash,transactionHash) || !equal(receipt.transactionHash,transactionHash)
    || tx.blockNumber === null || tx.blockHash === null || !hash(receipt.blockHash)
    || tx.blockNumber !== receipt.blockNumber || !equal(tx.blockHash,receipt.blockHash) || tx.value !== 0n)
    throw Error('Arc Trade transaction and receipt do not match.')
  if (receipt.blockNumber < 0n || head < receipt.blockNumber + 5n) throw Object.assign(Error('Arc Trade execution is awaiting confirmations.'),{code:'ARC_TRADE_EXECUTION_PENDING'})
  if (receipt.blockNumber <= input.preparedAfterBlock) throw Error('Arc Trade receipt predates the prepared action.')
  const block = await client.getBlock({blockNumber:receipt.blockNumber})
  if (!block.hash || !equal(block.hash,receipt.blockHash)) throw Error('Arc Trade receipt is not canonical.')
  if (receipt.status !== 'success' && receipt.status !== 'reverted') throw Error('Invalid Arc Trade receipt status.')
  const wrapped = wrapArcTradeCall(call)
  let execution:ArcTradeExecutionResult['execution'], operation:Operation|PackedOperation|undefined
  if (tx.to && equal(tx.from,call.account) && equal(tx.to,call.to) && equal(tx.input,call.data)) execution = 'direct'
  else if (tx.to && equal(tx.to,call.account) && equal(tx.input,wrapped)) execution = 'circle_smart_wallet'
  else if (tx.to && equal(tx.to,entryPoint) && policy.entryPointVersion==='0.7') {
    const decoded=decodeFunctionData({abi:ARC_TRADE_ENTRY_POINT_V07_ABI,data:tx.input})
    const [ops,beneficiary]=decoded.args
    if(ops.length!==1||!operationMatches(ops[0],call,wrapped)
      ||!equal(tx.input,encodeFunctionData({abi:ARC_TRADE_ENTRY_POINT_V07_ABI,functionName:'handleOps',args:[ops,beneficiary]})))
      throw Error('Arc Trade user operation does not match the prepared call.')
    operation=ops[0];execution='circle_user_operation'
  }
  else if (tx.to && equal(tx.to,entryPoint)) {
    const decoded = decodeFunctionData({abi:ARC_TRADE_ENTRY_POINT_ABI,data:tx.input})
    const [ops,beneficiary] = decoded.args
    if (ops.length !== 1 || !operationMatches(ops[0],call,wrapped)
      || !equal(tx.input,encodeFunctionData({abi:ARC_TRADE_ENTRY_POINT_ABI,functionName:'handleOps',args:[ops,beneficiary]})))
      throw Error('Arc Trade user operation does not match the prepared call.')
    operation = ops[0]
    execution = 'circle_user_operation'
  } else throw Error('Arc Trade transaction does not match the prepared call.')
  if(policy.entryPointVersion==='0.7'&&execution==='direct')throw Error('Arc Trade v0.7 requires a verified smart-wallet execution.')
  const codeMatches = async(address:Address,expected:Hex) => {
    const code = await client.getCode({address,blockNumber:receipt.blockNumber})
    if (!code || code === '0x' || !equal(keccak256(code),expected)) throw Error('Arc Trade execution runtime is not verified.')
  }
  if (execution !== 'direct') {
    await codeMatches(call.account,policy.walletRuntimeHash)
    const implementation = await client.getStorageAt({address:call.account,slot:ARC_TRADE_IMPLEMENTATION_SLOT,blockNumber:receipt.blockNumber})
    if (!implementation || !/^0x0{24}[a-f0-9]{40}$/i.test(implementation)
      || !equal('0x'+implementation.slice(-40),policy.walletImplementation)) throw Error('Arc Trade wallet implementation changed.')
    await codeMatches(policy.walletImplementation,policy.walletImplementationRuntimeHash)
    await verifyNativeWalletState(call.account,policy,client,receipt.blockNumber)
  }
  let status:ArcTradeExecutionResult['status'] = receipt.status === 'success' ? 'confirmed' : 'reverted'
  let userOperationHash:Hex|undefined
  if (operation) {
    await codeMatches(entryPoint,policy.entryPointRuntimeHash)
    userOperationHash = 'accountGasLimits' in operation ? arcTradePackedUserOperationHash(operation) : arcTradeUserOperationHash(operation)
    if (receipt.status === 'success') {
      const events = receipt.logs.filter(log => equal(log.address,entryPoint)).flatMap(log => {
        try {
          const decoded = decodeEventLog({abi:ARC_TRADE_ENTRY_POINT_ABI,eventName:'UserOperationEvent',data:log.data,topics:log.topics as [Hex,...Hex[]],strict:true})
          return [{log,args:decoded.args}]
        } catch { return [] }
      })
      if (events.length !== 1) throw Error('Arc Trade execution result is missing or ambiguous.')
      const {log,args} = events[0]
      const paymaster = operation.paymasterAndData === '0x' ? zeroAddress : operation.paymasterAndData.slice(0,42)
      if (log.removed || !equal(log.transactionHash,transactionHash) || !equal(log.blockHash,receipt.blockHash) || log.blockNumber !== receipt.blockNumber
        || !equal(args.userOpHash,userOperationHash) || !equal(args.sender,call.account) || args.nonce !== operation.nonce || !equal(args.paymaster,paymaster))
        throw Error('Arc Trade execution result does not match the prepared operation.')
      status = args.success ? 'confirmed' : 'reverted'
    }
  }
  // Re-read receipt as well as the canonical block after asynchronous reads.
  const [finalBlock,finalReceipt,chain] = await Promise.all([
    client.getBlock({blockNumber:receipt.blockNumber}),client.getTransactionReceipt({hash:transactionHash}),client.getChainId(),
  ])
  if (chain !== 5042 || !finalBlock.hash || !equal(finalBlock.hash,receipt.blockHash)
    || finalReceipt.blockNumber !== receipt.blockNumber || !equal(finalReceipt.blockHash,receipt.blockHash)
    || !equal(finalReceipt.transactionHash,transactionHash) || finalReceipt.status !== receipt.status)
    throw Error('Arc Trade execution changed during verification.')
  return {status,transactionHash,blockHash:receipt.blockHash,blockNumber:String(receipt.blockNumber),execution,...(userOperationHash ? {userOperationHash} : {})}
}
