import {isAddress,parseAbi,parseEventLogs,type Hex} from 'viem'
import {sponsoredSwapOperationProof} from './sponsored-swap-operation-proof.js'
import {bscSponsoredSwapCalls,validateBscSwap,type BscSwapQuote} from '../../src/pocket/lib/pocketBscSwap.js'
import {POCKET_BSC,pocketBscAsset} from '../../src/pocket/lib/pocketBsc.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
import {encodeXLayerSponsoredBatch,XLAYER_ENTRY_POINT,type XLayerCostRpc} from './xlayer-sponsored-cost.js'
import type {BscSettlement} from './bsc-operations.js'
const transfers=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const orders=parseAbi(['event OrderRecord(address fromToken,address toToken,address sender,uint256 fromAmount,uint256 returnAmount)'])
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const fail=():never=>{throw Error('Swap confirmation is still being verified.')}
const uint=(v:unknown)=>{if(typeof v!=='string'||!/^0x[0-9a-f]{1,64}$/i.test(v))return fail();return BigInt(v)}
const validHash=(v:unknown):v is Hex=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v)
/** Exact receipt proof. Provider status alone cannot declare a swap successful.
 * Await 15 canonical blocks before persisting either onchain terminal result. */
export async function readBscSwapSettlement(q:BscSwapQuote,hash:Hex,rpc:XLayerCostRpc,userOperationHash?:Hex):Promise<BscSettlement>{
 validateBscSwap(q,Date.now(),true)
 if(!validHash(hash)||userOperationHash!==undefined&&!validHash(userOperationHash)||uint(await rpc('eth_chainId',[]))!==56n)return fail()
 const [tx,r]=await Promise.all([rpc('eth_getTransactionByHash',[hash]),rpc('eth_getTransactionReceipt',[hash])])
 if(!tx||!r)return {status:'pending'}
 if(!same(tx.hash,hash)||!same(r.transactionHash,hash)||!validHash(r.blockHash)||!same(tx.blockHash,r.blockHash)||uint(tx.blockNumber)!==uint(r.blockNumber)||uint(tx.chainId)!==56n||!Array.isArray(r.logs))return fail()
 const block=await rpc('eth_getBlockByNumber',[r.blockNumber,false])
 if(!block||!same(block.hash,r.blockHash)||uint(block.number)!==uint(r.blockNumber))return fail()
 const head=uint(await rpc('eth_blockNumber',[]))
 if(head<uint(r.blockNumber)+14n)return {status:'pending'}
 const native=q.from==='BNB'
 if(native){
  if(!same(tx.from,q.walletAddress)||!same(tx.to,POCKET_BSC.router)||!same(r.to,tx.to)||!same(tx.input,q.tx.data)||uint(tx.value)!==BigInt(q.tradeInputUnits)||uint(tx.gas)>BigInt(q.nativeGas!.gasLimit)||uint(tx.maxFeePerGas)>BigInt(q.nativeGas!.maxFeePerGas))return fail()
 }else{
  if(!same(tx.to,XLAYER_ENTRY_POINT)||!same(r.to,XLAYER_ENTRY_POINT))return fail()
  // Rebuild at original issuance time only for comparison of settled calldata.
  const expected=encodeXLayerSponsoredBatch(bscSponsoredSwapCalls(q,q.issuedAt))
  if(sponsoredSwapOperationProof(tx,r,{owner:q.walletAddress,callData:expected,userOperationHash})==='failed')return {status:'failed'}
 }
 const nativeFee=native?uint(r.gasUsed)*uint(r.effectiveGasPrice):undefined
 if(native&&(nativeFee!<=0n||nativeFee!>BigInt(q.nativeGasReserveUnits)||uint(r.gasUsed)>BigInt(q.nativeGas!.gasLimit)||uint(r.effectiveGasPrice)>BigInt(q.nativeGas!.maxFeePerGas)))return fail()
 if(r.status==='0x0')return {status:'failed',...(nativeFee!==undefined?{nativeFeeUnits:String(nativeFee)}:{})}
 if(r.status!=='0x1')return fail()
 const input=pocketBscAsset(q.from),output=pocketBscAsset(q.to)
 // OrderRecord is emitted by the reviewed router after measuring receiver
 // balance delta. Check this exact route and amount, including native output.
 const records=parseEventLogs({abi:orders,logs:r.logs.filter((l:any)=>same(l.address,POCKET_BSC.router))})
 if(records.length!==1)return fail()
 const order=records[0].args
 // OKX emits tx.origin here: the bundler for a sponsored swap, not the wallet.
 // Wallet/receiver ownership is bound by the exact signed calls and operation proof above.
 if(!isAddress(tx.from)||!same(order.sender,tx.from)||!same(order.fromToken,input.address)||!same(order.toToken,output.address)||order.fromAmount!==BigInt(q.tradeInputUnits)||order.returnAmount<BigInt(q.minimumOutUnits))return fail()
 const tokenLogs=(address:string)=>parseEventLogs({abi:transfers,logs:r.logs.filter((l:any)=>same(l.address,address))})
 if(!native){
  const inputLogs=tokenLogs(input.address)
  const spent=inputLogs.reduce((n,l)=>n+(same(l.args.from,q.walletAddress)?l.args.value:0n)-(same(l.args.to,q.walletAddress)?l.args.value:0n),0n)
  const paid=inputLogs.filter(l=>same(l.args.from,q.walletAddress)&&same(l.args.to,EVM_PLATFORM_TREASURY))
  if(spent!==BigInt(q.totalInputUnits)||paid.length!==1||paid[0].args.value!==BigInt(q.reimbursementUnits))return fail()
 }else{
  const received=tokenLogs(output.address).reduce((n,l)=>n+(same(l.args.to,q.walletAddress)?l.args.value:0n)-(same(l.args.from,q.walletAddress)?l.args.value:0n),0n)
  if(received!==order.returnAmount)return fail()
 }
 return {status:'completed',amountOutUnits:String(order.returnAmount),...(nativeFee!==undefined?{nativeFeeUnits:String(nativeFee)}:{})}
}
