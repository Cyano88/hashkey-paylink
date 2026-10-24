import {createPublicClient,http,formatUnits,type Hex} from 'viem'
import {base,bsc} from 'viem/chains'
import {bscBridgeSourceProven,bscBridgeDeliveryCandidate,bscBridgeDeliveryProven,evmStablecoinDelta} from './bsc-bridge-evidence.js'
import {sponsoredSwapOperationProof} from './sponsored-swap-operation-proof.js'
import {encodeXLayerSponsoredBatch,XLAYER_ENTRY_POINT} from './xlayer-sponsored-cost.js'
import {bscOutboundCalls,type BscOutboundQuote} from '../../src/pocket/lib/pocketBscOutboundBridge.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
import type {BscBridgeSettlement} from './bsc-bridge-operations.js'
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
export function createBscBridgeSettlement(env:NodeJS.ProcessEnv=process.env,fetcher=fetch){
 const clients={base:createPublicClient({chain:base,transport:http(env.PRIVATE_RPC_URL_BASE,{retryCount:0})}),bsc:createPublicClient({chain:bsc,transport:http(env.PRIVATE_RPC_URL_BSC,{retryCount:0})})}
 const receipt=async(network:'base'|'bsc',hash:Hex)=>{const c=clients[network];if(await c.getChainId()!==(network==='bsc'?56:8453))throw Error('Bridge network mismatch.');const r=await c.getTransactionReceipt({hash}).catch(()=>null);if(!r)return null;const [block,head]=await Promise.all([c.getBlock({blockNumber:r.blockNumber}),c.getBlockNumber()]);if(!same(block.hash,r.blockHash)||head<r.blockNumber+(network==='bsc'?14n:2n))return null;return r}
 return async(q:BscOutboundQuote,hash:Hex,userOperationHash?:Hex):Promise<BscBridgeSettlement>=>{
  const waiting={status:'pending' as const};const r=await receipt('bsc',hash);if(!r)return waiting
  const tx=await clients.bsc.getTransaction({hash});if(!same(tx.to,XLAYER_ENTRY_POINT)||!same(tx.blockHash,r.blockHash))throw Error('Bridge submission is still being verified.')
  const rawTx={...tx,input:tx.input},rawReceipt={...r,status:r.status==='success'?'0x1':'0x0'}
  if(sponsoredSwapOperationProof(rawTx,rawReceipt,{owner:q.walletAddress,callData:encodeXLayerSponsoredBatch(bscOutboundCalls(q,q.issuedAt)),userOperationHash})==='failed')return {status:'failed'}
  const binding={asset:q.asset,source:q.source,destination:q.destination,sender:q.walletAddress,recipient:q.destinationAddress,amountUnits:q.amountUnits,minimumUnits:q.minimumOutUnits,orderId:q.orderId,requestId:q.requestId,networkFeeUnits:q.reimbursementUnits,reimbursementTreasury:EVM_PLATFORM_TREASURY}
  if(!bscBridgeSourceProven(binding,r,hash))throw Error('Bridge deposit is still being verified.')
  const get=async(path:string)=>{const r=await fetcher('https://api.relay.link'+path,{headers:{'x-api-key':env.RELAY_API_KEY||''},signal:AbortSignal.timeout(12000),redirect:'error'});if(!r.ok)throw Error('Bridge delivery is still being verified.');return r.json()}
  const [status,requests]=await Promise.all([get('/intents/status/v3?requestId='+encodeURIComponent(q.requestId)),get('/requests/v3?'+new URLSearchParams({id:q.requestId,orderId:q.orderId,limit:'1'}))])
  const candidate=bscBridgeDeliveryCandidate(binding,hash,status,requests)
  if(candidate.status!=='verify_delivery'||!['base','bsc'].includes(candidate.network))return waiting
  const delivered=await receipt(candidate.network as 'base'|'bsc',candidate.hash as Hex);if(!delivered)return waiting
  const delta=evmStablecoinDelta(delivered,candidate.network as 'base'|'bsc',q.asset,candidate.recipient,candidate.hash)
  if(!bscBridgeDeliveryProven(candidate,delta))throw Error('Bridge delivery is still being verified.')
  return {status:candidate.outcome,destinationTxHash:candidate.hash,...(candidate.outcome==='completed'?{amountOutUnits:String(delta)}:{refundAmount:formatUnits(delta!,candidate.network==='bsc'?18:6),refundNetwork:candidate.network})}
 }
}
