import {decodeFunctionData,encodeAbiParameters,encodeFunctionData,isAddress,parseAbi,parseEventLogs,type Hex} from 'viem'
import {recoverAuthorizationAddress} from 'viem/utils'
import {entryPoint07Abi} from 'viem/account-abstraction'
import type {XLayerCall} from './xlayer-reimbursement.js'

export const XLAYER_ENTRY_POINT='0x0000000071727de22e5e9d8baf0edac6f37da032' as Hex
const kernel='0xd6cedde84be40893d153be9d467cd6ad37875b28'
const kernelAbi=parseAbi(['function execute(bytes32 mode,bytes executionCalldata)'])
const eventAbi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
const stub='0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c'
export type XLayerCostRpc=(method:string,params:unknown[])=>Promise<any>
const invalid=():never=>{throw Error('X Layer sponsored cost could not be verified.')}
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
function quantity(value:unknown):bigint{
 if(typeof value!=='string'||!/^0x[0-9a-f]{1,64}$/i.test(value))return invalid()
 return BigInt(value)
}
/** Server-built calls only. Default batch execution reverts all calls on failure. */
export function encodeXLayerSponsoredBatch(calls:XLayerCall[]):Hex{
 if(!Array.isArray(calls)||!calls.length||calls.length>12||calls.some(c=>!isAddress(c.to)||c.value!=='0x0'||!/^0x(?:[0-9a-f]{2})*$/i.test(c.data)))return invalid()
 const data=encodeAbiParameters([{type:'tuple[]',components:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'callData',type:'bytes'}]}],[calls.map(c=>({target:c.to,value:0n,callData:c.data}))])
 return encodeFunctionData({abi:kernelAbi,functionName:'execute',args:[('0x01'+'00'.repeat(31)) as Hex,data]})
}
/** Read-only simulation, not a Privy billing quote. No signing or broadcasting. */
export async function estimateXLayerSponsoredBatchGas(rpc:XLayerCostRpc,wallet:Hex,calls:XLayerCall[]){
 return estimatePrivySponsoredBatchGas(rpc,wallet,calls,196)
}
/** Shared Privy Kernel simulation; each caller must supply its fixed network. */
export async function estimatePrivySponsoredBatchGas(rpc:XLayerCostRpc,wallet:Hex,calls:XLayerCall[],chainId:56|196){
 if(![56,196].includes(chainId)||!isAddress(wallet)||await rpc('eth_chainId',[])!=='0x'+chainId.toString(16))return invalid()
 const code=await rpc('eth_getCode',[wallet,'latest'])
 const requiresDelegation=code==='0x'
 // Never replace another delegation. A code-only override models Privy's
 // first-use upgrade without inventing funds, allowances or initialized storage.
 if(!requiresDelegation&&!same(code,'0xef0100'+kernel.slice(2)))return invalid()
 if(requiresDelegation){
  const entrypoint=await rpc('eth_call',[{to:kernel,data:encodeFunctionData({abi:parseAbi(['function entrypoint() view returns(address)']),functionName:'entrypoint'})},'latest'])
  if(!same(entrypoint,'0x'+'0'.repeat(24)+XLAYER_ENTRY_POINT.slice(2)))return invalid()
 }
 const nonce=await rpc('eth_call',[{to:XLAYER_ENTRY_POINT,data:encodeFunctionData({abi:entryPoint07Abi,functionName:'getNonce',args:[wallet,0n]})},'latest'])
 quantity(nonce)
 const callData=encodeXLayerSponsoredBatch(calls)
 const result=await rpc('eth_estimateUserOperationGas',[{sender:wallet,nonce,callData,callGasLimit:'0x0',verificationGasLimit:'0x0',preVerificationGas:'0x0',maxFeePerGas:'0x0',maxPriorityFeePerGas:'0x0',signature:stub},XLAYER_ENTRY_POINT,...(requiresDelegation?[{[wallet]:{code:'0xef0100'+kernel.slice(2)}}]:[])])
 const callGas=quantity(result?.callGasLimit),verificationGas=quantity(result?.verificationGasLimit),preVerificationGas=quantity(result?.preVerificationGas)
 if(callGas===0n||verificationGas===0n||preVerificationGas===0n||callGas+verificationGas+preVerificationGas>10000000n)return invalid()
 return {callData,callGas,verificationGas,preVerificationGas,totalGas:callGas+verificationGas+preVerificationGas,requiresDelegation}
}

export type XLayerCostBinding={transactionHash:Hex;userOperationHash:Hex;wallet:Hex;callData:Hex}
/** Only a single-operation bundler-sponsored receipt can attribute all outer gas
 * to one user. Never charge one user for other users' operations in a bundle.
 * This measures network cost, not Privy's invoice or any refund transaction. */
export async function readXLayerSponsoredNetworkCost(rpc:XLayerCostRpc,binding:XLayerCostBinding){
 if(!/^0x[0-9a-f]{64}$/i.test(binding.transactionHash)||!/^0x[0-9a-f]{64}$/i.test(binding.userOperationHash)||!isAddress(binding.wallet)||await rpc('eth_chainId',[])!=='0xc4')return invalid()
 const [receipt,tx]=await Promise.all([rpc('eth_getTransactionReceipt',[binding.transactionHash]),rpc('eth_getTransactionByHash',[binding.transactionHash])])
 if(!receipt||!tx)return null
 if(receipt.status!=='0x1'||!same(receipt.transactionHash,binding.transactionHash)||!same(tx.hash,binding.transactionHash)||!same(receipt.to,XLAYER_ENTRY_POINT)||!same(tx.to,XLAYER_ENTRY_POINT)||quantity(tx.chainId)!==196n||!/^0x[0-9a-f]{64}$/i.test(receipt.blockHash)||!same(tx.blockHash,receipt.blockHash)||quantity(tx.blockNumber)!==quantity(receipt.blockNumber))return invalid()
 const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false])
 if(!block||!same(block.hash,receipt.blockHash))return invalid()
 const decoded=decodeFunctionData({abi:entryPoint07Abi,data:tx.input})
 if(decoded.functionName!=='handleOps')return invalid()
 const operations=decoded.args[0]
 if(operations.length!==1)return invalid()
 const op=operations[0]
 if(!same(op.sender,binding.wallet)||!same(op.callData,binding.callData)||op.paymasterAndData!=='0x'||BigInt(op.gasFees)!==0n)return invalid()
 const events=parseEventLogs({abi:eventAbi,logs:receipt.logs.filter((log:any)=>same(log.address,XLAYER_ENTRY_POINT))})
 if(events.length!==1)return invalid()
 const event=events[0].args
 if(!same(event.userOpHash,binding.userOperationHash)||!same(event.sender,binding.wallet)||event.nonce!==op.nonce||!event.success||event.actualGasCost!==0n||!/^0x0{40}$/i.test(event.paymaster))return invalid()
 const gasUsed=quantity(receipt.gasUsed),gasPrice=quantity(receipt.effectiveGasPrice)
 // The observed X Layer receipts expose l1Fee. Missing is not equivalent to zero.
 const l1Fee=quantity(receipt.l1Fee)
 // X Layer includes DA footprint blobGasUsed even on non-blob transactions.
 // Its L1 charge is l1Fee; multiplying that footprint would double-count DA.
 if(!['0x2','0x4'].includes(tx.type))return invalid()
 if(tx.type==='0x4'){
  if(!Array.isArray(tx.authorizationList)||tx.authorizationList.length!==1)return invalid()
  const auth=tx.authorizationList[0],nonce=quantity(auth.nonce),chainId=quantity(auth.chainId),yParity=quantity(auth.yParity)
  if(!same(auth.address,kernel)||![0n,196n].includes(chainId)||nonce>BigInt(Number.MAX_SAFE_INTEGER)||yParity>1n)return invalid()
  const authority=await recoverAuthorizationAddress({authorization:{address:auth.address,nonce:Number(nonce),chainId:Number(chainId),yParity:Number(yParity),r:auth.r,s:auth.s}})
  if(!same(authority,binding.wallet))return invalid()
 }
 const blobFee=0n
 if(gasUsed===0n||gasPrice===0n)return invalid()
 return {networkCostWei:gasUsed*gasPrice+l1Fee+blobFee,l1FeeWei:l1Fee,executionCostWei:gasUsed*gasPrice,blobFeeWei:blobFee,blockHash:receipt.blockHash as Hex}
}

/** The approved quote is the final reimbursement: Pocket retains any surplus
 * and absorbs any shortfall. No refund or additional user debit is created.
 * Network-cost variance is accounting data, not Privy's full billed charge. */
export function reconcileXLayerQuotedReimbursement(quotedUnits:bigint,networkCostWei:bigint,okbStablecoinRateScaled8:bigint){
 if(quotedUnits<=0n||networkCostWei<0n||okbStablecoinRateScaled8<=0n)return invalid()
 const denominator=10n**20n
 const actualUnits=(networkCostWei*okbStablecoinRateScaled8+denominator-1n)/denominator
 return {actualUnits,collectedUnits:quotedUnits,retainedSurplusUnits:quotedUnits>actualUnits?quotedUnits-actualUnits:0n,absorbedUnits:actualUnits>quotedUnits?actualUnits-quotedUnits:0n}
}

/** Pricing policy for a COMPLETE cost estimate in smallest stablecoin units,
 * including provider charges and the reimbursement call. A network-only RPC
 * estimate must not be passed off as a complete cost. Configure the margin
 * explicitly; this is protection against variance, not a guaranteed cost cap. */
export function priceXLayerReimbursement(estimatedCostUnits:bigint,marginBps:number,minimumFeeUnits:bigint){
 if(estimatedCostUnits<=0n||!Number.isSafeInteger(marginBps)||marginBps<=0||marginBps>10000||minimumFeeUnits<0n)return invalid()
 const buffered=(estimatedCostUnits*BigInt(10000+marginBps)+9999n)/10000n
 return buffered>minimumFeeUnits?buffered:minimumFeeUnits
}

/** Recheck the SAME approved batch immediately before submission. Keep the
 * approved fee when cost falls; require a new approval when its buffer no
 * longer fits. Never silently increase the debit or remove the margin. */
export function assertXLayerReimbursementCoverage(approvedFeeUnits:bigint,freshEstimatedCostUnits:bigint,marginBps:number,minimumFeeUnits:bigint){
 const required=priceXLayerReimbursement(freshEstimatedCostUnits,marginBps,minimumFeeUnits)
 if(approvedFeeUnits<required)throw Error('Network fee increased. Review the updated transfer.')
 return approvedFeeUnits
}
