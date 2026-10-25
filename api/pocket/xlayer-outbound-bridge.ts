import {validBridgeDestination,isPocketBridgeDestination,sameBridgeDestination} from '../../src/pocket/lib/pocketBridgeDestination.js'
import {arcChain} from '../../src/lib/chains.js'
import {readSolanaBridgeDelivery} from './bridge-solana-delivery.js'
import {cashBridgePurpose} from '../../src/pocket/lib/pocketCashBridgePurpose.js'
import {quoteLifiOutbound,lifiSourceProven,lifiDelivery} from './lifi-outbound-bridge.js'
import {lifiOutboundCalls,LIFI_DESTINATIONS,type LifiOutboundPlan,type OutboundDestination} from '../../src/pocket/lib/pocketLifiOutbound.js'
import {quoteXLayerBridgeSwap} from './xstocks-swap-provider.js'
import {xlayerConversionCalls,type XLayerBridgeConversion} from '../../src/pocket/lib/pocketXLayerBridgeConversion.js'
import {POCKET_XLAYER_MINIMUM_AMOUNT,POCKET_XLAYER_MINIMUM_UNITS} from '../../src/pocket/lib/pocketXLayerMinimum.js'
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {createPublicClient,custom,encodeFunctionData,formatUnits,getAddress,http,isAddress,parseAbi,parseUnits,type Hex} from 'viem'
import {base,xLayer,arbitrum,mainnet,polygon} from 'viem/chains'
import {readCircleLink,circleLinkKey} from '../privy-circle-link.js'
import {quoteRelayStablecoin,RELAY_STABLECOIN_CHAINS,stablecoinAddress,type RelayStablecoinRefund} from './xlayer-bridge-provider.js'
import {quoteXLayerReimbursement,openXLayerReimbursement,sealXLayerReimbursement,refreshXLayerReimbursement,type XLayerFeeQuote,type XLayerFeeEstimator,type XLayerReimbursementPolicy} from './xlayer-reimbursement.js'
import {evmStablecoinDelta,xlayerBridgeSourceProven,xlayerBridgeDeliveryCandidate,xlayerBridgeDeliveryProven} from './xlayer-bridge-evidence.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'

export type XLayerOutboundQuote={purpose?:'cash';version:1;source:'xlayer';destination:OutboundDestination;lifi?:LifiOutboundPlan;destinationWalletId:string;destinationAddress:string;orderId:Hex;requestId:Hex;receiveUnits:string;minimumUnits:string;refundOptions:RelayStablecoinRefund[];conversion?:XLayerBridgeConversion;fee:XLayerFeeQuote}
const abi=parseAbi(['function approve(address,uint256) returns(bool)','function depositErc20(address,address,uint256,bytes32)'])
const hash=(s:unknown):s is Hex=>typeof s==='string'&&/^0x[0-9a-f]{64}$/i.test(s)
const units=(s:unknown):s is string=>typeof s==='string'&&/^[1-9]\d{0,19}$/.test(s)&&BigInt(s)<2n**64n
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
const invalid=():never=>{throw Error('Outbound bridge quote is unavailable or changed. Review the bridge again.')}
export function outboundBridgeCalls(q:Pick<XLayerOutboundQuote,'orderId'|'fee'|'conversion'|'lifi'>){
 if(q.lifi){if(q.fee.asset!=='USDT'||q.conversion)invalid();return lifiOutboundCalls(q.lifi,q.fee.issuedAt??Date.now())}
 if(q.conversion){if(q.fee.asset!=='USDT')invalid();return xlayerConversionCalls(q.conversion,q.fee.walletAddress,q.fee.amountUnits,q.orderId,q.fee.issuedAt??Date.now())}
 const token=getAddress(stablecoinAddress('xlayer',q.fee.asset)),depository=getAddress(RELAY_STABLECOIN_CHAINS.xlayer.depository)
 const approval=(amount:bigint)=>({to:token,value:'0x0' as const,data:encodeFunctionData({abi,functionName:'approve',args:[depository,amount]})})
 return [approval(0n),approval(BigInt(q.fee.amountUnits)),{to:depository,value:'0x0' as const,data:encodeFunctionData({abi,functionName:'depositErc20',args:[q.fee.walletAddress,token,BigInt(q.fee.amountUnits),q.orderId]})},approval(0n)]
}
function check(q:XLayerOutboundQuote,owner:string){
 cashBridgePurpose(q.purpose,q.destination)
 if(q?.version!==1||q.source!=='xlayer'||!isPocketBridgeDestination(q.destination)||q.destination==='arc'&&q.fee?.asset==='USDT'||!q.destinationWalletId||!validBridgeDestination(q.destination,q.destinationAddress)||!hash(q.orderId)||!hash(q.requestId)||q.fee?.ownerId!==owner||!['USDC','USDT'].includes(q.fee.asset)||!units(q.fee.amountUnits)||!units(q.receiveUnits)||!units(q.minimumUnits)||BigInt(q.minimumUnits)>BigInt(q.receiveUnits)||BigInt(q.receiveUnits)>BigInt(q.fee.amountUnits))invalid()
 if(q.lifi&&(q.destination!==q.lifi.destination||!same(q.destinationAddress,q.lifi.recipient)||!same(q.fee.walletAddress,q.lifi.owner)||q.fee.amountUnits!==q.lifi.amountUnits||q.receiveUnits!==q.lifi.receiveUnits||q.minimumUnits!==q.lifi.minimumUnits||q.orderId!==q.lifi.transactionId))invalid()
 if(!Array.isArray(q.refundOptions)||q.refundOptions.length!==2||new Set(q.refundOptions.map(r=>r.network)).size!==2)invalid()
 for(const r of q.refundOptions)if(!['xlayer',q.destination].includes(r.network)||r.asset!==(q.conversion&&r.network==='xlayer'?'USDC':q.fee.asset)||!sameBridgeDestination(r.network,r.recipient,r.network==='xlayer'?q.fee.walletAddress:q.destinationAddress))invalid()
 // Structural verification for recovery deliberately ignores quote expiry.
 const f=q.fee
 openXLayerReimbursement(sealXLayerReimbursement(f),{ownerId:owner,walletId:f.walletId,walletAddress:f.walletAddress,asset:f.asset,amountUnits:f.amountUnits,intentId:f.intentId},outboundBridgeCalls(q),f.issuedAt)
}
function mac(payload:string){const secret=process.env.POCKET_SWAP_QUOTE_SECRET||'';if(secret.length<32)return invalid();return createHmac('sha256',secret).update('pocket:xlayer:outbound:v1:'+payload).digest()}
export function sealOutboundBridge(q:XLayerOutboundQuote){check(q,q.fee.ownerId);const body=Buffer.from(JSON.stringify(q)).toString('base64url');return body+'.'+mac(body).toString('base64url')}
export function openOutboundBridge(token:string,owner:string){
 if(typeof token!=='string'||token.length>60000)invalid()
 const [body,sig,extra]=token.split('.'),expected=mac(body),actual=Buffer.from(sig||'','base64url')
 if(extra||expected.length!==actual.length||!timingSafeEqual(expected,actual))invalid()
 const q=JSON.parse(Buffer.from(body,'base64url').toString()) as XLayerOutboundQuote;check(q,owner);return q
}
export function outboundBridgePreview(q:XLayerOutboundQuote){return {...(q.purpose?{purpose:q.purpose}:{}),id:q.fee.intentId,rail:'xlayer' as const,execution:'privy' as const,...(q.lifi?{lifi:q.lifi}:{}),...(q.conversion?{conversion:q.conversion,refundOptions:q.refundOptions}:{}),walletAddress:q.fee.walletAddress,orderId:q.orderId,source:q.source,destination:q.destination,asset:q.fee.asset,amount:formatUnits(BigInt(q.fee.amountUnits),6),receive:formatUnits(BigInt(q.receiveUnits),6),minimumReceive:formatUnits(BigInt(q.minimumUnits),6),networkFee:formatUnits(BigInt(q.fee.networkFeeUnits),6),fee:formatUnits(BigInt(q.fee.totalUnits)-BigInt(q.receiveUnits),6),total:formatUnits(BigInt(q.fee.totalUnits),6),expiresAt:q.fee.expiresAt,destinationAddress:q.destinationAddress}}
const chainMap={base,xlayer:xLayer,arbitrum,ethereum:mainnet,polygon,arc:arcChain}
const client=(network:Exclude<OutboundDestination,'solana'>|'xlayer')=>{
 const url=process.env['PRIVATE_RPC_URL_'+network.toUpperCase()]||(network==='base'?process.env.PRIVATE_RPC_URL:network==='arbitrum'?process.env.PRIVATE_RPC_URL_ARB:undefined)
 const fallback=network==='ethereum'?'https://ethereum-rpc.publicnode.com':network==='polygon'?'https://polygon-bor-rpc.publicnode.com':undefined
 const transport=http(url||fallback,{timeout:15000,retryCount:0})({chain:chainMap[network]})
 return createPublicClient({chain:chainMap[network],transport:custom({request:({method,params}:any)=>transport.request({method,params:params??[]})},{retryCount:0})})
}
const destination=async(owner:string,network:OutboundDestination='base')=>{const w=await readCircleLink(circleLinkKey(owner,network,'payment'));if(!w)throw Object.assign(Error('Open your '+network+' wallet to continue.'),{status:409});if(!validBridgeDestination(network,w.circleWalletAddress))invalid();return {id:w.circleWalletId,address:network==='solana'?w.circleWalletAddress:getAddress(w.circleWalletAddress)}}
const defaults={client,destination,route:quoteRelayStablecoin,convert:quoteXLayerBridgeSwap,fetch:globalThis.fetch,now:Date.now,solanaDelivery:readSolanaBridgeDelivery,apiKey:()=>process.env.RELAY_API_KEY||''}
export function createXLayerOutboundBridge(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 const networks=async(network:OutboundDestination='base')=>{if(await d.client('xlayer').getChainId()!==196||network!=='solana'&&await d.client(network).getChainId()!==chainMap[network].id)invalid()}
 const receipt=async(network:Exclude<OutboundDestination,'solana'>|'xlayer',txHash:Hex)=>{
  const rpc=d.client(network);if(await rpc.getChainId()!==chainMap[network].id)invalid()
  const r=await rpc.getTransactionReceipt({hash:txHash}).catch(()=>null);if(!r)return null
  const block=await rpc.getBlock({blockNumber:r.blockNumber});return same(r.transactionHash,txHash)&&same(block.hash,r.blockHash)?r:null
 }
 return {
  async quote(input:{purpose?:'cash';ownerId:string;walletId:string;walletAddress:Hex;asset:'USDC'|'USDT';amount:string;destination?:OutboundDestination},estimate:XLayerFeeEstimator,pricing:XLayerReimbursementPolicy){
   if(!['USDC','USDT'].includes(input.asset)||!/^\d{1,12}(\.\d{1,6})?$/.test(input.amount)||parseUnits(input.amount,6)<=0n)invalid()
   if(parseUnits(input.amount,6)<POCKET_XLAYER_MINIMUM_UNITS)throw Error('Minimum bridge amount is '+POCKET_XLAYER_MINIMUM_AMOUNT+' '+input.asset+'.')
   const target=input.destination||'base',purpose=cashBridgePurpose(input.purpose,input.destination||'base')
   if(!isPocketBridgeDestination(target)||target==='arc'&&input.asset==='USDT')invalid()
   await networks(target);const w=await d.destination(input.ownerId,target),amountUnits=parseUnits(input.amount,6).toString()
   const available=await d.client('xlayer').readContract({address:getAddress(stablecoinAddress('xlayer',input.asset)),abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[input.walletAddress]})
   if(BigInt(amountUnits)>=available)throw Object.assign(Error('Insufficient '+input.asset+' to cover the bridge and network fee. Enter a smaller amount.'),{status:422})
   if(input.asset==='USDT'&&(LIFI_DESTINATIONS as readonly string[]).includes(target)){
    const lifi=await quoteLifiOutbound({destination:target as typeof LIFI_DESTINATIONS[number],owner:input.walletAddress,recipient:w.address as Hex,amountUnits},d.fetch)
    const binding={ownerId:input.ownerId,walletId:input.walletId,walletAddress:input.walletAddress,asset:input.asset,amountUnits,intentId:randomUUID()}
    const fee=await quoteXLayerReimbursement(binding,lifiOutboundCalls(lifi,d.now()),lifi.expiresAt,estimate,pricing,d.now,available)
    const q:XLayerOutboundQuote={...purpose,version:1,source:'xlayer',destination:target,destinationWalletId:w.id,destinationAddress:w.address,orderId:lifi.transactionId,requestId:lifi.transactionId,receiveUnits:lifi.receiveUnits,minimumUnits:lifi.minimumUnits,refundOptions:[{network:'xlayer',asset:'USDT',recipient:input.walletAddress},{network:target,asset:'USDT',recipient:w.address}],lifi,fee}
    check(q,input.ownerId);return q
   }
   const swap=input.asset==='USDT'?await d.convert({owner:input.walletAddress,amount:input.amount}):undefined
   const conversion=swap?{swap,depositUnits:swap.minimumOutUnits}:undefined
   const depositUnits=conversion?.depositUnits||amountUnits
   const route=await d.route({asset:input.asset,source:'xlayer',destination:target,sender:input.walletAddress,recipient:w.address,amountUnits:depositUnits,...(conversion?{inputAsset:'USDC' as const}:{})},d.apiKey(),d.fetch)
   if(route.source!=='xlayer'||route.destination!==target||route.asset!==input.asset||route.amountUnits!==depositUnits||route.execution.kind!=='evm'||!hash(route.requestId))invalid()
   const binding={ownerId:input.ownerId,walletId:input.walletId,walletAddress:input.walletAddress,asset:input.asset,amountUnits,intentId:randomUUID()}
   const calls=outboundBridgeCalls({orderId:route.orderId,fee:{...binding,issuedAt:d.now()} as XLayerFeeQuote,conversion})
   const fee=await quoteXLayerReimbursement(binding,calls,Math.min(route.expiresAt,swap?.expiresAt??route.expiresAt),estimate,pricing,d.now,available)
   const q:XLayerOutboundQuote={...purpose,version:1,source:'xlayer',destination:target,destinationWalletId:w.id,destinationAddress:w.address,orderId:route.orderId,requestId:route.requestId as Hex,receiveUnits:route.receiveUnits,minimumUnits:route.minimumUnits,refundOptions:route.refundOptions,...(conversion?{conversion}:{}),fee}
   check(q,input.ownerId);return q
  },
  async preflight(q:XLayerOutboundQuote,estimate:XLayerFeeEstimator){
   await networks(q.destination);const w=await d.destination(q.fee.ownerId,q.destination)
   if(w.id!==q.destinationWalletId||!sameBridgeDestination(q.destination,w.address,q.destinationAddress))invalid()
   await refreshXLayerReimbursement(q.fee,outboundBridgeCalls(q),estimate,d.now)
  },
  async recoverSource(q:XLayerOutboundQuote):Promise<Hex|null>{
   if(q.lifi)return null
   if(!d.apiKey())return null
   const r=await d.fetch('https://api.relay.link/intents/status/v3?requestId='+encodeURIComponent(q.requestId),{headers:{'x-api-key':d.apiKey()},redirect:'error',signal:AbortSignal.timeout(15000)})
   if(!r.ok)return null
   const status=await r.json()
   if(status.originChainId!==196||!Array.isArray(status.inTxHashes)||status.inTxHashes.length!==1||!hash(status.inTxHashes[0]))return null
   const candidate=status.inTxHashes[0] as Hex,source=await receipt('xlayer',candidate)
   const binding={asset:q.fee.asset,source:q.source,destination:q.destination,sender:q.fee.walletAddress,recipient:q.destinationAddress,amountUnits:q.fee.amountUnits,...(q.conversion?{depositAsset:'USDC' as const,depositUnits:q.conversion.depositUnits}:{}),minimumUnits:q.minimumUnits,orderId:q.orderId,requestId:q.requestId,networkFeeUnits:q.fee.networkFeeUnits,reimbursementTreasury:EVM_PLATFORM_TREASURY}
   return source&&xlayerBridgeSourceProven(binding,source,candidate)?candidate:null
  },
  async status(q:XLayerOutboundQuote,sourceHash:Hex){
   const binding={asset:q.fee.asset,source:q.source,destination:q.destination,sender:q.fee.walletAddress,recipient:q.destinationAddress,amountUnits:q.fee.amountUnits,...(q.conversion?{depositAsset:'USDC' as const,depositUnits:q.conversion.depositUnits}:{}),minimumUnits:q.minimumUnits,orderId:q.orderId,requestId:q.requestId,refundOptions:q.refundOptions,networkFeeUnits:q.fee.networkFeeUnits,reimbursementTreasury:EVM_PLATFORM_TREASURY}
   const source=await receipt('xlayer',sourceHash)
   if(!source)return {status:'pending' as const}
   if(source.status==='reverted')return {status:'failed' as const}
   if(q.lifi){if(!lifiSourceProven(q.lifi,q.fee.networkFeeUnits,source,sourceHash))return {status:'needs_attention' as const};return lifiDelivery(q.lifi,sourceHash,receipt,d.fetch)}
   if(!xlayerBridgeSourceProven(binding,source,sourceHash))return {status:'needs_attention' as const}
   const get=async(path:string)=>{if(!d.apiKey())invalid();const r=await d.fetch('https://api.relay.link'+path,{headers:{'x-api-key':d.apiKey()},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)invalid();return r.json()}
   const status=await get('/intents/status/v3?requestId='+encodeURIComponent(q.requestId))
   if(!['success','refund','failure'].includes(status.status))return {status:'pending' as const,sourceConfirmed:true}
   const requests=await get('/requests/v3?'+new URLSearchParams({id:q.requestId,orderId:q.orderId,limit:'1'}))
   const candidate=xlayerBridgeDeliveryCandidate(binding,sourceHash,status,requests)
   if(candidate.status!=='verify_delivery')return candidate
   if(candidate.network!==q.destination&&candidate.network!=='xlayer')return {status:'needs_attention' as const}
   const delivered=candidate.network==='solana'?null:await receipt(candidate.network as Exclude<OutboundDestination,'solana'>|'xlayer',candidate.hash as Hex)
   if(candidate.network!=='solana'&&!delivered)return {status:'pending' as const,sourceConfirmed:true}
   const delta=candidate.network==='solana'?await d.solanaDelivery(candidate.asset,candidate.recipient,candidate.hash):evmStablecoinDelta(delivered!,candidate.network,candidate.asset,candidate.recipient,candidate.hash)
   if(!xlayerBridgeDeliveryProven(candidate,delta))return {status:'needs_attention' as const}
   return {status:candidate.outcome,destinationTxHash:candidate.hash,sourceConfirmed:true,...(candidate.outcome==='refunded'?{refundAsset:candidate.asset,refundNetwork:candidate.network,refundAmount:formatUnits(delta!,6)}:{cashReceivedAmount:formatUnits(delta!,6)})}
  },
 }
}
