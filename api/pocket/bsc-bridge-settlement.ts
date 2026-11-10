import {formatUnits,type Hex} from 'viem'
import {type inboundChains} from './inbound-bridge-networks.js'
import {readSolanaBridgeDelivery} from './bridge-solana-delivery.js'
import {readEvmBridgeDelivery} from './bridge-evm-delivery.js'
import {bscBridgeSourceProven,bscBridgeDeliveryCandidate,bscBridgeDeliveryProven} from './bsc-bridge-evidence.js'
import {readSponsoredBridgeSource} from './bridge-sponsored-source.js'
import {encodeXLayerSponsoredBatch} from './xlayer-sponsored-cost.js'
import {bscOutboundCalls,type BscOutboundQuote} from '../../src/pocket/lib/pocketBscOutboundBridge.js'
import {evmGasRecipient} from '../../src/lib/platformFees.js'
import type {BscBridgeSettlement} from './bsc-bridge-operations.js'
export function createBscBridgeSettlement(env:NodeJS.ProcessEnv=process.env,fetcher=fetch){
 return async(q:BscOutboundQuote,hash:Hex,userOperationHash?:Hex):Promise<BscBridgeSettlement>=>{
  const waiting={status:'pending' as const}
  const {receipt:r,outcome}=await readSponsoredBridgeSource('bsc',hash,{owner:q.walletAddress,callData:encodeXLayerSponsoredBatch(bscOutboundCalls(q,q.issuedAt)),userOperationHash},{env})
  if(outcome==='failed')return {status:'failed'}
  const binding={asset:q.asset,source:q.source,destination:q.destination,sender:q.walletAddress,recipient:q.destinationAddress,amountUnits:q.amountUnits,refundOptions:q.refundOptions,minimumUnits:q.minimumOutUnits,orderId:q.orderId,requestId:q.requestId,networkFeeUnits:q.reimbursementUnits,reimbursementTreasury:evmGasRecipient(q)}
  if(!bscBridgeSourceProven(binding,r,hash))throw Error('Bridge deposit is still being verified.')
  const get=async(path:string)=>{const r=await fetcher('https://api.relay.link'+path,{headers:{'x-api-key':env.RELAY_API_KEY||''},signal:AbortSignal.timeout(12000),redirect:'error'});if(!r.ok)throw Error('Bridge delivery is still being verified.');return r.json()}
  const [status,requests]=await Promise.all([get('/intents/status/v3?requestId='+encodeURIComponent(q.requestId)),get('/requests/v3?'+new URLSearchParams({id:q.requestId,orderId:q.orderId,limit:'1'}))])
  const candidate=bscBridgeDeliveryCandidate(binding,hash,status,requests)
  if(candidate.status!=='verify_delivery'||![q.destination,'bsc'].includes(candidate.network))return waiting
  const delta=candidate.network==='solana'?await readSolanaBridgeDelivery(candidate.asset,candidate.recipient,candidate.hash):await readEvmBridgeDelivery(candidate.network as keyof typeof inboundChains,candidate.asset,candidate.recipient,candidate.hash,{env})
  if(!bscBridgeDeliveryProven(candidate,delta))throw Error('Bridge delivery is still being verified.')
  return {status:candidate.outcome,destinationTxHash:candidate.hash,...(candidate.outcome==='completed'?{amountOutUnits:String(delta)}:{refundAsset:candidate.asset,refundAmount:formatUnits(delta!,candidate.network==='bsc'?18:6),refundNetwork:candidate.network})}
 }
}
