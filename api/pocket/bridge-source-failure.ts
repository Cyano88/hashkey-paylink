import {readFinalizedBridgeSource} from './circle-bridge-source-reader.js'
import type {CircleKitSourceReceipt} from './circle-bridge-source-proof.js'
import type {NativeCallTrace} from './native-send-quote.js'
import type {InboundEvmSource} from './inbound-bridge-networks.js'
type Binding={source:InboundEvmSource;walletAddress:string;callData:string}
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
function pending():never{throw Object.assign(Error('The source transaction outcome is still being verified.'),{status:409,code:'bridge_source_failure_pending'})}
/** Receipt status alone is insufficient for sponsored batches: require exactly
 * the approved wallet invocation, including failure inherited from its parent. */
export function proveBridgeSourceFailure(q:Binding,receipt:CircleKitSourceReceipt,trace:NativeCallTrace){
 if(!/^0x[0-9a-f]{40}$/i.test(q.walletAddress)||!/^0x(?:[0-9a-f]{2}){4,}$/i.test(q.callData))pending()
 const matches:boolean[]=[]
 let nodes=0
 function visit(node:NativeCallTrace,parentFailed=false,depth=0){
  if(++nodes>10000||depth>100)pending()
  const failed=parentFailed||!!node.error||!!node.revertReason
  if(node.type==='CALL'&&same(node.to,q.walletAddress)&&same(node.input,q.callData))matches.push(failed)
  for(const child of node.calls??[])visit(child,failed,depth+1)
 }
 visit(trace)
 if(matches.length!==1)pending()
 return {failed:receipt.status==='reverted'||matches[0]}
}
export async function readBridgeSourceFailure(q:Binding,hash:string,rpc?:Parameters<typeof readFinalizedBridgeSource>[3]){
 const proof=await readFinalizedBridgeSource(q.source,hash,async(receipt,trace)=>proveBridgeSourceFailure(q,receipt,trace),rpc,true)
 return proof.failed
}

export async function readBridgeSourceSuccess(q:Binding,hash:string,rpc?:Parameters<typeof readFinalizedBridgeSource>[3]){
 const proof=await readFinalizedBridgeSource(q.source,hash,async(receipt,trace)=>{
  if(proveBridgeSourceFailure(q,receipt,trace).failed)pending()
  return {receipt}
 },rpc)
 return {...proof.receipt,blockHash:proof.blockHash,blockNumber:BigInt(proof.blockNumber)}
}
