import {decodeEventLog,formatUnits,parseAbi,type Hex} from 'viem'
import {recordCirclePocketAction,type CirclePocketActionRecord} from '../circle-pocket-action-journal.js'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
import {nativeSendRpc} from './native-send-reconciliation.js'
import {revertedNativeBatch,type NativeCallTrace} from './native-send-quote.js'
import {CASH_CONVERSION_ACTION,CASH_CONVERSION_PREFIX,cashConversionCalls,openCashConversion,sameCashAddress,type CashConversionQuote} from './cash-conversion-quote.js'
type Trace=NativeCallTrace&{calls?:Trace[];logs?:{address:string;data:Hex;topics:Hex[]}[]}
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
function walk(node:Trace,visit:(node:Trace)=>void,failed=false,depth=0){
 if(depth>100)throw Error('Trace too deep.')
 const reverted=failed||!!node.error||!!node.revertReason
 if(!reverted)visit(node)
 for(const child of node.calls||[])walk(child,visit,reverted,depth+1)
}
function netToken(trace:Trace,token:string,wallet:string){
 let net=0n
 walk(trace,node=>{for(const log of node.logs||[]){
  if(!sameCashAddress(log.address,token))continue
  try{const event=decodeEventLog({abi:transferAbi,data:log.data,topics:log.topics as [Hex,...Hex[]]});if(sameCashAddress(event.args.to,wallet))net+=event.args.value;if(sameCashAddress(event.args.from,wallet))net-=event.args.value}catch{/* Other events do not establish payment. */}
 }})
 return net
}
/** Prove the exact batch, input debit, output and repayment; never infer Cash from a wallet balance. */
export function cashConversionOutput(q:CashConversionQuote,trace:Trace):bigint|null{
 const matches:Trace[]=[]
 walk(trace,node=>{if(node.type==='CALL'&&sameCashAddress(node.to,q.walletAddress)&&sameCashAddress(node.input,q.callData))matches.push(node)})
 if(matches.length!==1)return null
 const outgoing:Trace[]=[]
 walk(matches[0],node=>{if(node!==matches[0]&&node.type==='CALL'&&sameCashAddress(node.from,q.walletAddress))outgoing.push(node)})
 const expected=cashConversionCalls(q)
 if(outgoing.length!==expected.length||outgoing.some((call,i)=>!sameCashAddress(call.to,expected[i].target)||!sameCashAddress(call.input||'0x',expected[i].data)||BigInt(call.value||'0')!==0n))return null
 const router=outgoing[2],repayment=outgoing[4]
 const gross=netToken(router,BASE_STABLECOINS.USDC.address,q.walletAddress),fee=BigInt(q.feeUnits)
 if(gross<BigInt(q.minimumOutUnits)||netToken(router,BASE_STABLECOINS.USDT.address,q.walletAddress)!==-BigInt(q.amountUnits))return null
 if(netToken(repayment,BASE_STABLECOINS.USDC.address,q.walletAddress)!==-fee||netToken(repayment,BASE_STABLECOINS.USDC.address,EVM_PLATFORM_TREASURY)!==fee)return null
 // Entire batch must agree; no hidden transfer in an approval or callback.
 if(netToken(matches[0],BASE_STABLECOINS.USDC.address,q.walletAddress)!==gross-fee||netToken(matches[0],BASE_STABLECOINS.USDT.address,q.walletAddress)!==-BigInt(q.amountUnits))return null
 return gross-fee
}
const defaults={rpc:nativeSendRpc,record:recordCirclePocketAction}
export async function reconcileCashConversion(record:CirclePocketActionRecord,overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 if(record.action!==CASH_CONVERSION_ACTION)throw Error('Invalid cash conversion record.')
 const q=openCashConversion(record.metadata?.quoteToken||'',record.ownerId,true)
 if(record.idempotencyKey!==CASH_CONVERSION_PREFIX+q.id||record.metadata?.network!=='base')throw Error('Cash conversion reference mismatch.')
 if(['completed','failed'].includes(record.status))return {status:record.status,txHash:record.metadata?.txHash,amountOut:record.metadata?.amountOut}
 const hash=record.metadata?.txHash
 if(!hash)return {status:'pending',challengeId:record.metadata?.challengeId}
 if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Invalid conversion reference.')
 if(BigInt(await d.rpc<string>('base','eth_chainId',[]))!==8453n)throw Error('Cash conversion network mismatch.')
 const receipt=await d.rpc<{status:string;blockHash:string;blockNumber:string;transactionHash:string}|null>('base','eth_getTransactionReceipt',[hash])
 if(!receipt||!['0x0','0x1'].includes(receipt.status)||!sameCashAddress(receipt.transactionHash,hash))return {status:'pending'}
 const block=await d.rpc<{hash:string}|null>('base','eth_getBlockByNumber',[receipt.blockNumber,false])
 if(!block||block.hash!==receipt.blockHash)return {status:'pending'}
 const failed=async()=>{const saved=await d.record({...record,status:'failed'});return {status:saved.status,txHash:saved.metadata?.txHash}}
 if(receipt.status==='0x0')return failed()
 const trace=await d.rpc<Trace>('base','debug_traceTransaction',[hash,{tracer:'callTracer',tracerConfig:{withLog:true}}])
 if(revertedNativeBatch(q,trace))return failed()
 const net=cashConversionOutput(q,trace)
 if(net===null)return {status:'pending'}
 const saved=await d.record({...record,status:'completed',metadata:{...record.metadata!,amountOut:formatUnits(net,6)}})
 return {status:saved.status,txHash:saved.metadata?.txHash,amountOut:saved.metadata?.amountOut}
}
