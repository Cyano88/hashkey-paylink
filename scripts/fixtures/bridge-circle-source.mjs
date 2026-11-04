import {readBridgeSourceSuccess} from '../../api/pocket/bridge-source-failure.ts'
import {inboundChains} from '../../api/pocket/inbound-bridge-networks.ts'
export function fixtureCircleSource(read,settings=()=>({})){return async(q,hash)=>{
 const r=await read(q.source,hash),s=settings(),blockHash=r?.blockHash??'0x'+'c'.repeat(64),height='0x'+BigInt(r?.blockNumber??1).toString(16),anchor='0x'+'d'.repeat(64)
 let traced=false
 return readBridgeSourceSuccess(q,hash,async({method,params})=>{
  if(method==='eth_chainId')return '0x'+inboundChains[q.source].id.toString(16)
  if(method==='debug_traceTransaction'){traced=true;if(s.noTrace)throw Error('Trace unavailable');return {type:'CALL',to:q.walletAddress,input:s.wrongCall?'0x87654321':q.callData,...(s.failed?{error:'reverted'}:{})}}
  if(method==='eth_getTransactionReceipt')return r?{...r,status:r.status==='success'?'0x1':'0x0',transactionHash:r.transactionHash??hash,blockHash,blockNumber:height,transactionIndex:'0x0',logs:r.logs.map((l,i)=>({...l,removed:l.removed??false,blockHash,blockNumber:height,transactionHash:hash,transactionIndex:'0x0',logIndex:'0x'+i.toString(16)}))}:null
  if(method==='eth_getBlockByNumber')return params[0]===height?{hash:s.reorg&&traced?anchor:blockHash,number:height,transactions:[hash]}:{hash:anchor,number:s.unfinalized?'0x0':'0x100',transactions:[]}
  throw Error('Unexpected source fixture '+method)
 })
}}
