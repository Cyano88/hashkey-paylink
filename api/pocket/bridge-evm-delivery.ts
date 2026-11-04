import {inboundBridgeClient,type inboundChains} from './inbound-bridge-networks.js'
import {readFinalizedBridgeReceipt} from './circle-bridge-source-reader.js'
import {evmStablecoinDelta} from './bsc-bridge-evidence.js'

/** A Relay hash is a candidate only. The caller must bind it to the saved
 * order/refund plan; this reader independently proves canonical token receipt.
 * Unsupported finalized-tag RPCs fail closed; confirmation counts are not a fallback. */
export async function readCanonicalEvmBridgeReceipt(network:keyof typeof inboundChains,hash:string,options:{env?:NodeJS.ProcessEnv;rpc?:Parameters<typeof readFinalizedBridgeReceipt>[3]}={}){
 let rpc=options.rpc
 if(!rpc&&(network==='bsc'||network==='xlayer')){
  const client=inboundBridgeClient(network,options.env)
  rpc=async request=>client.request(request as Parameters<typeof client.request>[0])
 }
 const result=await readFinalizedBridgeReceipt(network,hash,async receipt=>({receipt}),rpc)
 return result.receipt
}
export async function readEvmBridgeDelivery(network:keyof typeof inboundChains,asset:'USDC'|'USDT',recipient:string,hash:string,options:Parameters<typeof readCanonicalEvmBridgeReceipt>[2]={}){
 return evmStablecoinDelta(await readCanonicalEvmBridgeReceipt(network,hash,options),network,asset,recipient,hash)
}
