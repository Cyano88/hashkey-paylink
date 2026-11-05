import {inboundBridgeClient,inboundChains} from './inbound-bridge-networks.js'
import {readBridgeProofEvmRpc} from '../evm-read.js'
import {readFinalizedBridgeReceipt} from './circle-bridge-source-reader.js'
import type {NativeCallTrace} from './native-send-quote.js'
export type NativeBridgeNetwork='ethereum'|'base'|'arbitrum'|'polygon'|'bsc'|'xlayer'
const pending=():never=>{throw Object.assign(Error('Native bridge delivery is still being verified.'),{status:409,code:'bridge_native_delivery_pending'})}
const same=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase()
const address=(a:unknown):a is string=>typeof a==='string'&&/^0x[0-9a-f]{40}$/i.test(a)
const quantity=(v:unknown)=>typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v)&&BigInt(v)<2n**256n?BigInt(v):pending()
/** Net successful CALL value. Delegate/static calls do not transfer their
 * inherited msg.value. Unsupported selfdestruct/create flows fail closed. */
export function nativeBridgeTraceDelta(trace:NativeCallTrace,recipient:string){
 if(!address(recipient)||!trace||trace.type!=='CALL'||trace.error||trace.revertReason||same(trace.from,recipient))pending()
 let nodes=0,delta=0n
 function visit(t:NativeCallTrace,depth=0){
  if(!t||typeof t!=='object'||Array.isArray(t)||++nodes>10000||depth>100||!['CALL','STATICCALL','DELEGATECALL','CALLCODE'].includes(t.type??''))pending()
  if(t.error||t.revertReason)return
  if(!address(t.from)||!address(t.to)||t.calls!==undefined&&!Array.isArray(t.calls))pending()
  if(t.type==='CALL'){
   const value=quantity(t.value??'0x0')
   delta+=(same(t.to,recipient)?value:0n)-(same(t.from,recipient)?value:0n)
  }
  for(const child of t.calls??[])visit(child,depth+1)
 }
 visit(trace)
 return delta
}
/** The provider hash must first match the saved delivery/refund plan. Gas-paying
 * recipient transactions remain unresolved; no guessed gas or balance delta. */
export async function readNativeBridgeDelivery(network:NativeBridgeNetwork,hash:string,recipient:string,options:{env?:NodeJS.ProcessEnv;rpc?:Parameters<typeof readFinalizedBridgeReceipt>[3]}={}){
 if(!['ethereum','base','arbitrum','polygon','bsc','xlayer'].includes(network)||!address(recipient))pending()
 const client=!options.rpc&&(network==='bsc'||network==='xlayer')?inboundBridgeClient(network,options.env):undefined
 const raw=options.rpc??(client?async(request:{method:string;params:unknown[]})=>client.request(request as Parameters<typeof client.request>[0]):async({method,params}:{method:string;params:unknown[]})=>readBridgeProofEvmRpc(network as 'base'|'arbitrum'|'ethereum'|'polygon',method,params))
 const rpc:NonNullable<typeof options.rpc>=async request=>{try{return await raw(request)}catch{throw Object.assign(Error('Native bridge RPC evidence is unavailable.'),{status:503,code:'bridge_native_rpc_unavailable'})}}
 const proof=await readFinalizedBridgeReceipt(network,hash,async(_receipt,context)=>{
  const transaction=async()=>{
   const t=await rpc({method:'eth_getTransactionByHash',params:[hash]}) as Record<string,unknown>|null
   if(!t||!same(t.hash,hash)||!same(t.blockHash,context.blockHash)||quantity(t.blockNumber)!==context.blockNumber||quantity(t.transactionIndex)!==context.index||quantity(t.chainId)!==BigInt(inboundChains[network].id)||!address(t.from)||!address(t.to)||typeof t.input!=='string'||!/^0x(?:[0-9a-f]{2})*$/i.test(t.input))return pending()
   return {from:t.from,to:t.to,input:t.input,value:quantity(t.value).toString()}
  }
  const tx=await transaction(),trace=await rpc({method:'debug_traceTransaction',params:[hash,{tracer:'callTracer'}]}) as NativeCallTrace
  if(!trace||!same(trace.from,tx.from)||!same(trace.to,tx.to)||!same(trace.input,tx.input)||quantity(trace.value??'0x0').toString()!==tx.value)pending()
  const amount=nativeBridgeTraceDelta(trace,recipient)
  const again=await rpc({method:'debug_traceTransaction',params:[hash,{tracer:'callTracer'}]}) as NativeCallTrace
  if(JSON.stringify(again)!==JSON.stringify(trace)||JSON.stringify(await transaction())!==JSON.stringify(tx))pending()
  return {amount}
 },rpc)
 return proof.amount
}
