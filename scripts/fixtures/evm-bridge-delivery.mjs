import {readEvmBridgeDelivery} from '../../api/pocket/bridge-evm-delivery.ts'
import {inboundChains} from '../../api/pocket/inbound-bridge-networks.ts'
/** Adapter fixtures supply token logs; the real canonical reader consumes a
 * synthetic finalized RPC envelope. No network access or provider calls. */
export function fixtureEvmDelivery(read,canonical=()=>true,options={}){return async(network,asset,recipient,hash)=>{
 const r=await read(network,hash);if(!r||!canonical())return null
 const blockHash=r.blockHash??'0x'+'c'.repeat(64),height='0x'+BigInt(r.blockNumber??1).toString(16),anchor='0x'+'d'.repeat(64)
 const rpc=async({method,params})=>{
  if(method==='eth_chainId')return '0x'+(options.chainId??inboundChains[network].id).toString(16)
  if(method==='eth_getTransactionReceipt')return {...r,status:r.status==='success'?'0x1':'0x0',transactionHash:r.transactionHash??hash,blockHash,blockNumber:height,transactionIndex:'0x0',logs:r.logs.map((l,i)=>({...l,removed:l.removed??false,blockHash,blockNumber:height,transactionHash:r.transactionHash??hash,transactionIndex:'0x0',logIndex:'0x'+i.toString(16)}))}
  if(method==='eth_getBlockByNumber')return params[0]===height?{hash:options.blockHash??blockHash,number:height,transactions:[hash]}:{hash:anchor,number:r.finalityPending?'0x0':'0x100',transactions:[]}
  throw Error('Unexpected fixture RPC method '+method)
 }
 return readEvmBridgeDelivery(network,asset,recipient,hash,{rpc})
}}
