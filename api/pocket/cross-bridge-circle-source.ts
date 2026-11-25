import {decodeEventLog,parseAbi,type Hex} from 'viem'
import type {openCrossBridgeReview} from './cross-bridge-review.js'
import type {CircleKitSourceReceipt} from './circle-bridge-source-proof.js'
import {revertedNativeBatch,type NativeCallTrace} from './native-send-quote.js'
import {readFinalizedBridgeSource} from './circle-bridge-source-reader.js'
import {RELAY_BSC_CHAINS} from './cross-bridge-chains.js'
import {lifiAbi,LIFI_DIAMOND} from '../../src/pocket/lib/pocketLifiOutbound.js'

type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
const transfer=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const pending=():never=>{throw Object.assign(Error('Bridge source debit is still being verified.'),{status:409,code:'cross_bridge_source_pending'})}
/** Input is a reconstructed signed review. A successful wallet batch alone is
 * insufficient for token inputs: both the exact deposit and fee must be debited.
 * This proves source execution only, never destination delivery. */
export function proveCrossBridgeCircleSource(review:Review,hash:string,receipt:CircleKitSourceReceipt,trace:NativeCallTrace){
 const {quote:q,route,charged}=review,plan=charged.plan,wallet=q.wallets.source.address
 if(!['ethereum','base','arbitrum','polygon','arc'].includes(route.source)||q.wallets.source.provider!=='circle'||plan.kind!=='evm'||!/^0x[0-9a-f]{64}$/i.test(hash)||receipt.status!=='success'||!same(receipt.transactionHash,hash))return pending()
 const matches:NativeCallTrace[]=[]
 const walk=(node:NativeCallTrace,failed=false,depth=0)=>{
  if(depth>100)pending()
  const reverted=failed||!!node.error||!!node.revertReason
  if(node.type==='CALL'&&same(node.to,wallet)&&same(node.input,plan.callData)){if(reverted)pending();matches.push(node)}
  for(const child of node.calls||[])walk(child,reverted,depth+1)
 }
 walk(trace);if(matches.length!==1)pending()
 const outgoing:NativeCallTrace[]=[]
 const collect=(node:NativeCallTrace,depth=0)=>{
  // STATICCALL descendants cannot change state or emit transfer logs. Circle's
  // supportsInterface probes legitimately revert for ordinary ERC20 contracts.
  if(node.type==='STATICCALL')return
  if(depth>100||node.error||node.revertReason)pending()
  for(const child of node.calls||[]){
   if(same(child.from,wallet)&&child.type==='CALL')outgoing.push(child)
   if(['CREATE','CREATE2','SELFDESTRUCT'].includes(child.type||''))pending()
   collect(child,depth+1)
  }
 }
 collect(matches[0]);if(outgoing.length!==plan.calls.length)pending()
 for(let n=0;n<outgoing.length;n++){
  const actual=outgoing[n],expected=plan.calls[n]
  if(!same(actual.to,expected.target)||!same(actual.input,expected.data)||BigInt(actual.value||'0')!==expected.value)pending()
 }
 if(route.provider==='lifi'&&route.source==='base'&&route.destination==='celo'&&route.lifi.tool==='layerswap'){
  const movements:Array<{from:string;to:string;value:bigint}>=[]
  for(const log of receipt.logs){
   if(log.removed)pending()
   if(!same(log.address,route.tokenIn.address))continue
   try{const event=decodeEventLog({abi:transfer,eventName:'Transfer',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});if(same(event.args.from,wallet)||same(event.args.to,wallet))movements.push(event.args)}catch{/* Ignore unrelated ERC20 logs. */}
  }
  const reimbursement=movements.filter(m=>same(m.from,wallet)&&same(m.to,q.reimbursementRecipient)&&m.value===BigInt(q.reimbursementUnits))
  if(reimbursement.length!==1)return pending()
  const principalMovements=movements.filter(m=>m!==reimbursement[0]),principalDebit=principalMovements.reduce((sum,m)=>sum+(same(m.from,wallet)?m.value:0n)-(same(m.to,wallet)?m.value:0n),0n)
  if(principalDebit!==BigInt(route.amountUnits))return pending()
  const started=receipt.logs.filter(log=>{
   if(log.removed||!same(log.address,LIFI_DIAMOND))return false
   try{const {args}=decodeEventLog({abi:lifiAbi,eventName:'LiFiTransferStarted',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});const b=args.bridgeData;return same(b.transactionId,route.lifi.transactionId)&&b.bridge==='layerswap'&&same(b.sendingAssetId,route.lifi.bridgeTokenAddress)&&same(b.receiver,q.input.recipient)&&b.minAmount===BigInt(route.lifi.bridgeMinimumUnits)&&b.destinationChainId===42220n&&b.hasSourceSwaps&&!b.hasDestinationCall}catch{return false}
  })
  if(started.length!==1)return pending()
  return {sourceConfirmed:true as const,txHash:hash,totalUnits:q.totalUnits,reimbursementUnits:q.reimbursementUnits,planHash:q.planHash}
 }
 if(!route.tokenIn.native){
  const movements:Array<{from:string;to:string;value:bigint}>=[]
  for(const log of receipt.logs){
   if(log.removed)pending()
   if(!same(log.address,route.tokenIn.address))continue
   let event
   try{event=decodeEventLog({abi:transfer,eventName:'Transfer',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true})}catch{continue}
   if(same(event.args.from,wallet)||same(event.args.to,wallet))movements.push(event.args)
  }
  if(route.conversion){
   const feeIndex=movements.findIndex(m=>same(m.from,wallet)&&same(m.to,q.reimbursementRecipient)&&m.value===BigInt(q.reimbursementUnits))
   if(feeIndex<0)pending();movements.splice(feeIndex,1)
   // The approved swap may pull through a spender proxy. Verify its exact net
   // debit as well as the exact full call tree already checked above.
   const debit=movements.reduce((sum,m)=>sum+(same(m.from,wallet)?m.value:0n)-(same(m.to,wallet)?m.value:0n),0n)
   if(debit!==BigInt(route.amountUnits))pending()

  }else{
  const expected=[{to:RELAY_BSC_CHAINS[route.source].depository,value:BigInt(route.amountUnits)},{to:q.reimbursementRecipient,value:BigInt(q.reimbursementUnits)}]
  if(movements.length!==expected.length)pending()
  for(const item of expected){const index=movements.findIndex(m=>same(m.from,wallet)&&same(m.to,item.to)&&m.value===item.value);if(index<0)pending();movements.splice(index,1)}
  }
 }
 if(route.conversion){
   const deposits=receipt.logs.flatMap(log=>{if(log.removed)pending();if(!same(log.address,route.conversion!.bridgeToken.address))return [];try{return [decodeEventLog({abi:transfer,eventName:'Transfer',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true}).args]}catch{return []}}).filter(m=>same(m.from,wallet)&&same(m.to,RELAY_BSC_CHAINS[route.source].depository))
   if(deposits.length!==1||deposits[0].value!==BigInt(route.conversion.minimumUnits))pending()
 }
 return {sourceConfirmed:true as const,txHash:hash,totalUnits:q.totalUnits,reimbursementUnits:q.reimbursementUnits,planHash:q.planHash}
}
export async function readCrossBridgeCircleSource(review:Review,hash:string,rpc?:Parameters<typeof readFinalizedBridgeSource>[3]){
 const source=review.route.source
 if(source!=='ethereum'&&source!=='base'&&source!=='arbitrum'&&source!=='polygon'&&source!=='arc')return pending()
 return readFinalizedBridgeSource(source,hash,async(receipt,trace)=>proveCrossBridgeCircleSource(review,hash,receipt,trace),rpc)
}

/** Failure needs the same exact wallet-batch binding as success. A reverted
 * bundler receipt belonging to another operation cannot release this reserve. */
export async function readCrossBridgeCircleSourceState(review:Review,hash:string,rpc?:Parameters<typeof readFinalizedBridgeSource>[3]){
 const source=review.route.source,plan=review.charged.plan
 if(source!=='ethereum'&&source!=='base'&&source!=='arbitrum'&&source!=='polygon'&&source!=='arc'||plan.kind!=='evm'||review.quote.wallets.source.provider!=='circle')return pending()
 const result=await readFinalizedBridgeSource(source,hash,async(receipt,trace)=>{
  if(revertedNativeBatch({walletAddress:review.quote.wallets.source.address,callData:plan.callData},trace))return {state:'failed' as const}
  proveCrossBridgeCircleSource(review,hash,receipt,trace)
  return {state:'confirmed' as const}
 },rpc,true)
 return result.state
}
