import {decodeEventLog,parseAbi,formatUnits,type Hex} from 'viem'
import {CIRCLE_KIT_BRIDGE,type buildCircleKitFeeBatch} from './circle-bridge-platform-fee.js'
import {validatePocketBridgeMessage} from './bridge-proof.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
import type {NativeCallTrace} from './native-send-quote.js'
const transmitter='0x81D40F21F12A8F0E3252Bccb954D722d4c464B64'
const events=parseAbi(['event MessageSent(bytes message)','event Transfer(address indexed from,address indexed to,uint256 value)'])
type Batch=Awaited<ReturnType<typeof buildCircleKitFeeBatch>>
type Log={address:string;topics:readonly Hex[];data:Hex;removed?:boolean}
export type CircleKitSourceReceipt={status:string;transactionHash:string;logs:readonly Log[]}
export type CircleKitSourceExpectation={walletAddress:Hex;destinationAddress:string;txHash:Hex;batch:Batch;developerFeeUnits:bigint}
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const fail=():never=>{throw Object.assign(Error('Circle bridge source and fee evidence could not be verified.'),{status:409,code:'circle_bridge_evidence_pending'})}
/** Called only after RPC chain ID, canonical receipt block and finality checks.
 * A successful bundler receipt or a Kit-sender message alone proves no ownership. */
export async function proveCircleKitSource(expected:CircleKitSourceExpectation,receipt:CircleKitSourceReceipt,trace:NativeCallTrace){
 const {batch,walletAddress,txHash}=expected
 if(!/^0x[0-9a-f]{64}$/i.test(txHash)||receipt.status!=='success'||!same(receipt.transactionHash,txHash)||expected.developerFeeUnits<=0n||expected.developerFeeUnits>BigInt(batch.platformFee.grossAmountUnits))fail()
 const matches:NativeCallTrace[]=[]
 const visit=(node:NativeCallTrace,reverted=false,depth=0)=>{
  if(depth>100)fail()
  const failed=reverted||!!node.error||!!node.revertReason
  if(node.type==='CALL'&&same(node.to,walletAddress)&&same(node.input,batch.callData)){if(failed)fail();matches.push(node)}
  for(const child of node.calls||[])visit(child,failed,depth+1)
 }
 visit(trace);if(matches.length!==1)fail()
 const calls:NativeCallTrace[]=[]
 const collect=(node:NativeCallTrace,depth=0)=>{if(node.type==='STATICCALL')return;if(depth>100||node.error||node.revertReason)fail();for(const c of node.calls||[]){if(same(c.from,walletAddress)&&c.type==='CALL')calls.push(c);collect(c,depth+1)}}
 collect(matches[0])
 if(calls.length!==batch.calls.length)fail()
 for(let n=0;n<calls.length;n++){const actual=calls[n],approved=batch.calls[n];if(!same(actual.to,approved.target)||!same(actual.input,approved.data)||BigInt(actual.value||'0')!==approved.value)fail()}
 const token=batch.bridgeParams.burnToken,transfers:Array<{from:string;to:string;value:bigint}>=[],messages:string[]=[]
 for(const log of receipt.logs){
  if(log.removed)fail()
  if(same(log.address,transmitter)){
   try{const event=decodeEventLog({abi:events,eventName:'MessageSent',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});messages.push(event.args.message)}catch{ /* unrelated transmitter event */ }
  }
  if(same(log.address,token)){
   try{const event=decodeEventLog({abi:events,eventName:'Transfer',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});transfers.push(event.args)}catch{ /* approval and other token events */ }
  }
 }
 // One message only: do not attribute another user's burn in a bundled receipt.
 if(messages.length!==1)fail()
 await validatePocketBridgeMessage(messages[0],{source:batch.source,destination:batch.destination,sourceAddress:CIRCLE_KIT_BRIDGE,destinationAddress:expected.destinationAddress,amount:formatUnits(batch.burnUnits-batch.bridgeParams.maxFee,6),txHash})
 const outgoing=transfers.filter(t=>same(t.from,walletAddress)),incoming=transfers.filter(t=>same(t.to,walletAddress))
 const reimbursement=batch.totalUnits-batch.approvalUnits
 if(incoming.length||outgoing.length!==2||!outgoing.some(t=>same(t.to,CIRCLE_KIT_BRIDGE)&&t.value===batch.approvalUnits)||!outgoing.some(t=>same(t.to,EVM_PLATFORM_TREASURY)&&t.value===reimbursement))fail()
 const revenue=transfers.filter(t=>same(t.to,batch.platformFee.recipient)||same(t.from,batch.platformFee.recipient))
 if(revenue.length!==1||!same(revenue[0].from,CIRCLE_KIT_BRIDGE)||revenue[0].value!==expected.developerFeeUnits)fail()
 return {sourceConfirmed:true as const,txHash,message:messages[0],platformFee:{collector:'circle_bridge_kit' as const,state:'collected' as const,recipient:batch.platformFee.recipient,grossAmountUnits:batch.platformFee.grossAmountUnits,developerAmountUnits:String(revenue[0].value)},reimbursementUnits:String(reimbursement)}
}
