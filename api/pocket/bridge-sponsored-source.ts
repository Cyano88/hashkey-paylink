import {privyKernel} from './xlayer-sponsored-cost.js'
import type {Hex} from 'viem'
import {inboundBridgeClient,inboundChains} from './inbound-bridge-networks.js'
import {readFinalizedBridgeReceipt} from './circle-bridge-source-reader.js'
import {sponsoredSwapOperationProof} from './sponsored-swap-operation-proof.js'

/** Exact approved ERC-4337 batch inside a finalized canonical transaction.
 * Receipt failures alone never prove that this user's operation failed. */
export async function readSponsoredBridgeSource(network:'bsc'|'xlayer'|'celo',hash:Hex,expected:{owner:string;callData:Hex;userOperationHash?:Hex;walletGas?:boolean},options:{env?:NodeJS.ProcessEnv;rpc?:Parameters<typeof readFinalizedBridgeReceipt>[3]}={}){
 const client=options.rpc?undefined:inboundBridgeClient(network,options.env)
 const rpc=options.rpc??(async request=>client!.request(request as Parameters<NonNullable<typeof client>['request']>[0]))
 const pending=():never=>{throw Object.assign(Error('Bridge source operation is still being verified.'),{status:409,code:'bridge_source_evidence_pending'})}
 return readFinalizedBridgeReceipt(network,hash,async(receipt,context)=>{
  const read=async()=>{
   const tx=await rpc({method:'eth_getTransactionByHash',params:[hash]}) as Record<string,unknown>|null
   const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
   const quantity=(v:unknown)=>typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v)?BigInt(v):pending()
   if(!tx||!same(tx.hash,hash)||!same(tx.blockHash,context.blockHash)||quantity(tx.blockNumber)!==context.blockNumber||quantity(tx.transactionIndex)!==context.index||quantity(tx.chainId)!==BigInt(inboundChains[network].id)||typeof tx.input!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(tx.input)||typeof tx.to!=='string')return pending()
   if(expected.walletGas){
    if(network!=='celo'||!same(tx.from,expected.owner)||!same(tx.to,expected.owner)||!same(tx.input,expected.callData)||quantity(tx.value)!==0n||!same(receipt.sender,expected.owner))return pending()
    const code=await rpc({method:'eth_getCode',params:[expected.owner,'0x'+context.blockNumber.toString(16)]})
    if(!same(code,'0xef0100'+privyKernel.slice(2)))return pending()
   }
   return {to:tx.to,input:tx.input as Hex}
  }
  const tx=await read(),outcome=expected.walletGas?(receipt.status==='success'?'confirmed' as const:'failed' as const):sponsoredSwapOperationProof(tx,receipt,expected)
  if(JSON.stringify(await read())!==JSON.stringify(tx))pending()
  let paidGasUnits:string|undefined
  if(expected.walletGas){
   const raw=await rpc({method:'eth_getTransactionReceipt',params:[hash]}) as Record<string,unknown>|null
   const units=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]+$/i.test(v)?BigInt(v):pending()
   if(!raw||raw.transactionHash!==hash||raw.blockHash!==context.blockHash||raw.feeCurrency!=null&&!/^0x0{40}$/i.test(String(raw.feeCurrency)))return pending()
   paidGasUnits=String(units(raw.gasUsed)*units(raw.effectiveGasPrice)+units(raw.l1Fee??'0x0'))
  }
  return {receipt,outcome,paidGasUnits}
 },rpc,true)
}
