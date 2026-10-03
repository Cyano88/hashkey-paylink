import { decodeEventLog, decodeFunctionData, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, parseAbi, parseAbiParameters, stringToHex, toHex, zeroAddress, type Address, type Hex } from 'viem'

// Candidate verification only: this module neither signs nor broadcasts. HTTP
// integration must persist the trusted planner's call before issuing a challenge.
export const ARC_TRADE_ENTRY_POINT = getAddress('0x5FF137D4b0FDcd49DCa30c7CF57E578a026d2789')
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
type Operation = {
  sender:Address; nonce:bigint; initCode:Hex; callData:Hex; callGasLimit:bigint;
  verificationGasLimit:bigint; preVerificationGas:bigint; maxFeePerGas:bigint;
  maxPriorityFeePerGas:bigint; paymasterAndData:Hex; signature:Hex;
}
type Log = { address:Address; data:Hex; topics:readonly Hex[]; removed?:boolean; transactionHash:Hex; blockHash:Hex; blockNumber:bigint }
export type ArcTradeExecutionReader = {
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
    || equal(call.account,call.to) || equal(call.to,ARC_TRADE_ENTRY_POINT)) throw Error('Invalid prepared Arc Trade call.')
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
function operationMatches(op:Operation, call:ArcTradeExecutionCall, wrapped:Hex) {
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
  walletRuntimeHash:Hex; entryPointRuntimeHash:Hex;
  walletImplementation:Address; walletImplementationRuntimeHash:Hex;
}
// Populate only after verifying the actual Circle wallet implementation and
// EntryPoint on Arc. A candidate policy is not a production release.
export const ARC_TRADE_EXECUTION_POLICY:ArcTradeExecutionPolicy|null = null
export async function verifyArcTradeExecutionAccount(account:Address,policy:ArcTradeExecutionPolicy,client:ArcTradeExecutionReader) {
  if(await client.getChainId()!==5042)throw Error('Arc Trade execution network mismatch.')
  if(!hash(policy.walletRuntimeHash)||!hash(policy.walletImplementationRuntimeHash)||!hash(policy.entryPointRuntimeHash)
    ||getAddress(policy.walletImplementation)===zeroAddress||getAddress(account)===zeroAddress)throw Error('Arc Trade execution policy is not verified.')
  const blockNumber=await client.getBlockNumber({cacheTime:0}),block=await client.getBlock({blockNumber})
  for(const [address,expected] of [[account,policy.walletRuntimeHash],[policy.walletImplementation,policy.walletImplementationRuntimeHash],[ARC_TRADE_ENTRY_POINT,policy.entryPointRuntimeHash]] as const){
    const code=await client.getCode({address,blockNumber})
    if(!code||code==='0x'||!equal(keccak256(code),expected))throw Error('Arc Trade execution runtime is not verified.')
  }
  const implementation=await client.getStorageAt({address:account,slot:ARC_TRADE_IMPLEMENTATION_SLOT,blockNumber})
  if(!implementation||!/^0x0{24}[a-f0-9]{40}$/i.test(implementation)||!equal('0x'+implementation.slice(-40),policy.walletImplementation))throw Error('Arc Trade wallet implementation changed.')
  const latest=await client.getBlock({blockNumber})
  if(!block.hash||!latest.hash||!equal(block.hash,latest.hash)||await client.getChainId()!==5042)throw Error('Arc Trade wallet state changed during verification.')
}
export async function verifyArcTradeExecution(input:{
  call:ArcTradeExecutionCall; transactionHash:Hex; policy:ArcTradeExecutionPolicy; preparedAfterBlock:bigint;
}, client:ArcTradeExecutionReader):Promise<ArcTradeExecutionResult> {
  const {call,transactionHash,policy} = input
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
  let execution:ArcTradeExecutionResult['execution'], operation:Operation|undefined
  if (tx.to && equal(tx.from,call.account) && equal(tx.to,call.to) && equal(tx.input,call.data)) execution = 'direct'
  else if (tx.to && equal(tx.to,call.account) && equal(tx.input,wrapped)) execution = 'circle_smart_wallet'
  else if (tx.to && equal(tx.to,ARC_TRADE_ENTRY_POINT)) {
    const decoded = decodeFunctionData({abi:ARC_TRADE_ENTRY_POINT_ABI,data:tx.input})
    const [ops,beneficiary] = decoded.args
    if (ops.length !== 1 || !operationMatches(ops[0],call,wrapped)
      || !equal(tx.input,encodeFunctionData({abi:ARC_TRADE_ENTRY_POINT_ABI,functionName:'handleOps',args:[ops,beneficiary]})))
      throw Error('Arc Trade user operation does not match the prepared call.')
    operation = ops[0]
    execution = 'circle_user_operation'
  } else throw Error('Arc Trade transaction does not match the prepared call.')
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
  }
  let status:ArcTradeExecutionResult['status'] = receipt.status === 'success' ? 'confirmed' : 'reverted'
  let userOperationHash:Hex|undefined
  if (operation) {
    await codeMatches(ARC_TRADE_ENTRY_POINT,policy.entryPointRuntimeHash)
    userOperationHash = arcTradeUserOperationHash(operation)
    if (receipt.status === 'success') {
      const events = receipt.logs.filter(log => equal(log.address,ARC_TRADE_ENTRY_POINT)).flatMap(log => {
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
