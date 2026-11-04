import type {Hex} from 'viem'
import {inboundBridgeClient,inboundChains} from './inbound-bridge-networks.js'
import {readFinalizedBridgeReceipt} from './circle-bridge-source-reader.js'
import {sponsoredSwapOperationProof} from './sponsored-swap-operation-proof.js'

/** Exact approved ERC-4337 batch inside a finalized canonical transaction.
 * Receipt failures alone never prove that this user's operation failed. */
export async function readSponsoredBridgeSource(network:'bsc'|'xlayer',hash:Hex,expected:{owner:string;callData:Hex;userOperationHash?:Hex},options:{env?:NodeJS.ProcessEnv;rpc?:Parameters<typeof readFinalizedBridgeReceipt>[3]}={}){
 const client=options.rpc?undefined:inboundBridgeClient(network,options.env)
 const rpc=options.rpc??(async request=>client!.request(request as Parameters<NonNullable<typeof client>['request']>[0]))
 const pending=():never=>{throw Object.assign(Error('Bridge source operation is still being verified.'),{status:409,code:'bridge_source_evidence_pending'})}
 return readFinalizedBridgeReceipt(network,hash,async(receipt,context)=>{
  const read=async()=>{
   const tx=await rpc({method:'eth_getTransactionByHash',params:[hash]}) as Record<string,unknown>|null
   const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
   const quantity=(v:unknown)=>typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v)?BigInt(v):pending()
   if(!tx||!same(tx.hash,hash)||!same(tx.blockHash,context.blockHash)||quantity(tx.blockNumber)!==context.blockNumber||quantity(tx.transactionIndex)!==context.index||quantity(tx.chainId)!==BigInt(inboundChains[network].id)||typeof tx.input!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(tx.input)||typeof tx.to!=='string')return pending()
   return {to:tx.to,input:tx.input as Hex}
  }
  const tx=await read(),outcome=sponsoredSwapOperationProof(tx,receipt,expected)
  if(JSON.stringify(await read())!==JSON.stringify(tx))pending()
  return {receipt,outcome}
 },rpc,true)
}
