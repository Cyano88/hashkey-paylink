import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
﻿import {decodeEventLog,formatUnits,parseAbi,type Hex} from 'viem'
import {recordCirclePocketAction,type CirclePocketActionRecord} from '../circle-pocket-action-journal.js'
import {nativeSwapPair} from '../../src/pocket/lib/pocketNativeSwap.js'
import {nativeSendRpc} from './native-send-reconciliation.js'
import {nativeEvmNetworks,revertedNativeBatch,type NativeCallTrace} from './native-send-quote.js'
import {nativeSwapCalls,openNativeEvmSwap,sameSwapAddress,type NativeEvmSwapQuote} from './native-evm-swap-quote.js'
type Trace=NativeCallTrace&{calls?:Trace[];logs?:{address:string;data:Hex;topics:Hex[]}[]}
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
export function nativeSwapOutput(q:NativeEvmSwapQuote,trace:Trace):bigint|null{
 const matches:Trace[]=[]
 const walk=(node:Trace,visit:(node:Trace)=>void,failed=false,depth=0)=>{if(depth>100)throw Error('Trace too deep.');const reverted=failed||!!node.error||!!node.revertReason;if(!reverted)visit(node);for(const child of node.calls||[])walk(child,visit,reverted,depth+1)}
 walk(trace,node=>{if(node.type==='CALL'&&sameSwapAddress(node.to,q.walletAddress)&&sameSwapAddress(node.input,q.callData))matches.push(node)})
 if(matches.length!==1)return null
 // Circle can self-dispatch executeBatch. The matched envelope is not a batch payment.
 const outgoing:Trace[]=[];walk(matches[0],node=>{if(node!==matches[0]&&node.type==='CALL'&&sameSwapAddress(node.from,q.walletAddress))outgoing.push(node)})
 const expected=nativeSwapCalls(q)
 if(outgoing.length!==expected.length||outgoing.some((call,i)=>!sameSwapAddress(call.to,expected[i].target)||!sameSwapAddress(call.input||'0x',expected[i].data)||BigInt(call.value||'0')!==expected[i].value))return null
 const router=outgoing.find(node=>sameSwapAddress(node.to,q.tx.to)&&sameSwapAddress(node.input,q.tx.data))
 if(!router)return null
 const {tokenIn,tokenOut}=nativeSwapPair(q.network,q.from,q.to);let amount=0n
 if(q.version===2){
  const feeCall=outgoing[outgoing.length-1];let paid=0n
  walk(feeCall,node=>{for(const log of node.logs||[]){if(!sameSwapAddress(log.address,tokenIn.address))continue;try{const e=decodeEventLog({abi:transferAbi,data:log.data,topics:log.topics as [Hex,...Hex[]]});if(sameSwapAddress(e.args.from,q.walletAddress)&&sameSwapAddress(e.args.to,EVM_PLATFORM_TREASURY))paid+=e.args.value}catch{}}})
  if(paid!==BigInt(q.stableFeeUnits!))return null
 }
 walk(router,node=>{
  if(tokenOut.native){
   if(node.type==='CALL'&&sameSwapAddress(node.to,q.walletAddress))amount+=BigInt(node.value||'0')
   if(node.type==='CALL'&&sameSwapAddress(node.from,q.walletAddress))amount-=BigInt(node.value||'0')
  }else for(const log of node.logs||[]){
   if(!sameSwapAddress(log.address,tokenOut.address))continue
   try{const event=decodeEventLog({abi:transferAbi,data:log.data,topics:log.topics as [Hex,...Hex[]]});if(sameSwapAddress(event.args.to,q.walletAddress))amount+=event.args.value;if(sameSwapAddress(event.args.from,q.walletAddress))amount-=event.args.value}catch{/* Ignore unrelated events. */}
  }
 })
 return amount>=BigInt(q.minimumOutUnits)?amount:null
}
const defaults={rpc:nativeSendRpc,record:recordCirclePocketAction}
export async function reconcileNativeEvmSwap(record:CirclePocketActionRecord,overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 if(record.action!=='wallet.native-swap')throw Error('Invalid swap record.')
 if(['completed','failed'].includes(record.status))return {status:record.status,txHash:record.metadata?.txHash,amountOut:record.metadata?.amountOut}
 const q=openNativeEvmSwap(record.metadata?.quoteToken||'',record.ownerId,true)
 if(record.idempotencyKey!=='pocket:native-swap:'+q.id||record.metadata?.network!==q.network)throw Error('Swap reference mismatch.')
 const hash=record.metadata?.txHash
 if(!hash)return {status:'pending',challengeId:record.metadata?.challengeId}
 if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Invalid swap hash.')
 if(Number(BigInt(await d.rpc<string>(q.network,'eth_chainId',[])))!==nativeEvmNetworks[q.network].id)throw Error('Swap network mismatch.')
 const receipt=await d.rpc<{status:string;blockHash:string;blockNumber:string;transactionHash:string}|null>(q.network,'eth_getTransactionReceipt',[hash])
 if(!receipt||!['0x0','0x1'].includes(receipt.status)||!sameSwapAddress(receipt.transactionHash,hash))return {status:'pending'}
 const block=await d.rpc<{hash:string}|null>(q.network,'eth_getBlockByNumber',[receipt.blockNumber,false])
 if(!block||block.hash!==receipt.blockHash)return {status:'pending'}
 const failed=async()=>{const saved=await d.record({...record,status:'failed'});return {status:saved.status,txHash:saved.metadata?.txHash,amountOut:saved.metadata?.amountOut}}
 if(receipt.status==='0x0')return failed()
 const trace=await d.rpc<Trace>(q.network,'debug_traceTransaction',[hash,{tracer:'callTracer',tracerConfig:{withLog:true}}])
 if(revertedNativeBatch(q,trace))return failed()
 const gross=nativeSwapOutput(q,trace)
 if(gross===null)return {status:'pending'}
 const {tokenOut}=nativeSwapPair(q.network,q.from,q.to),net=gross-(q.version===1&&tokenOut.native?BigInt(q.feeUnits):0n)
 const saved=await d.record({...record,status:'completed',metadata:{...record.metadata!,amountOut:formatUnits(net,tokenOut.decimals)}})
 return {status:saved.status,txHash:saved.metadata?.txHash,amountOut:saved.metadata?.amountOut}
}
