import {decodeEventLog,decodeFunctionData,formatUnits,parseAbi,type Hex} from 'viem'
import type {EvmBridgeFeeQuote} from './evm-bridge-reimbursement.js'
import type {CircleKitSourceReceipt} from './circle-bridge-source-proof.js'
import type {NativeCallTrace} from './native-send-quote.js'
import {validatePocketBridgeMessage} from './bridge-proof.js'
import {readFinalizedBridgeSource} from './circle-bridge-source-reader.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'

const abi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)','event MessageSent(bytes message)','event Transfer(address indexed from,address indexed to,uint256 value)'])
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const fail=():never=>{throw Object.assign(Error('Direct bridge source evidence is still being verified.'),{status:409})}
/** Requires the canonical finalized envelope and a hash already bound to the
 * saved Circle reference/calldata. No destination-completion claim is made. */
export async function proveDirectCctpSource(q:EvmBridgeFeeQuote,receipt:CircleKitSourceReceipt,trace:NativeCallTrace){
 const matches:Array<{node:NativeCallTrace;failed:boolean}>=[]
 const visit=(node:NativeCallTrace,failed=false,depth=0)=>{
  if(depth>100)fail()
  failed=failed||!!node.error||!!node.revertReason
  if(node.type==='CALL'&&same(node.to,q.walletAddress)&&same(node.input,q.callData))matches.push({node,failed})
  for(const child of node.calls||[])visit(child,failed,depth+1)
 }
 visit(trace);if(matches.length!==1)fail()
 if(matches[0].failed)return {outcome:'source_failed' as const}
 if(receipt.status!=='success')fail()
 const approved=decodeFunctionData({abi,data:q.callData})
 if(approved.functionName!=='executeBatch')fail()
 const expected=(approved.args as unknown as [Array<{target:Hex;value:bigint;data:Hex}>])[0],calls:NativeCallTrace[]=[]
 const collect=(node:NativeCallTrace,depth=0)=>{if(node.type==='STATICCALL')return;if(depth>100||node.error||node.revertReason)fail();for(const child of node.calls||[]){if(child.type==='CALL'&&same(child.from,q.walletAddress))calls.push(child);collect(child,depth+1)}}
 collect(matches[0].node)
 if(calls.length!==expected.length)fail()
 for(let i=0;i<calls.length;i++)if(!same(calls[i].to,expected[i].target)||!same(calls[i].input,expected[i].data)||BigInt(calls[i].value||'0')!==expected[i].value)fail()
 const messages:Hex[]=[],transfers:Array<{from:string;to:string;value:bigint}>=[]
 for(const log of receipt.logs){
  if(log.removed)fail()
  if(same(log.address,'0x81D40F21F12A8F0E3252Bccb954D722d4c464B64'))try{messages.push(decodeEventLog({abi,eventName:'MessageSent',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true}).args.message)}catch{}
  if(same(log.address,q.tokenAddress))try{transfers.push(decodeEventLog({abi,eventName:'Transfer',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true}).args)}catch{}
 }
 if(messages.length!==1)fail()
 await validatePocketBridgeMessage(messages[0],{source:q.source as Parameters<typeof validatePocketBridgeMessage>[1]['source'],destination:q.destination as Parameters<typeof validatePocketBridgeMessage>[1]['destination'],sourceAddress:q.walletAddress,destinationAddress:q.destinationAddress,amount:formatUnits(BigInt(q.amountUnits),6),txHash:receipt.transactionHash})
 const outgoing=transfers.filter(t=>same(t.from,q.walletAddress))
 if(transfers.some(t=>same(t.to,q.walletAddress))||outgoing.length!==2||!outgoing.some(t=>same(t.to,'0x'+'0'.repeat(40))&&t.value===BigInt(q.bridgeDebitUnits))||!outgoing.some(t=>same(t.to,EVM_PLATFORM_TREASURY)&&t.value===BigInt(q.networkFeeUnits)))fail()
 return {outcome:'source_confirmed' as const}
}
export async function readDirectCctpSource(q:EvmBridgeFeeQuote,hash:Hex,rpc?:Parameters<typeof readFinalizedBridgeSource>[3]){
 return readFinalizedBridgeSource(q.source as Parameters<typeof readFinalizedBridgeSource>[0],hash,(receipt,trace)=>proveDirectCctpSource(q,receipt,trace),rpc,true)
}
