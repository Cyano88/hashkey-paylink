import {randomUUID} from 'node:crypto'
import {decodeEventLog,formatUnits,parseAbi,parseUnits} from 'viem'
import {PublicKey} from '@solana/web3.js'
import {quoteRelayUsdt,RELAY_USDT_CHAINS} from './usdt-relay-provider.js'
import {bridgeError,sameAddress,type UsdtBridgeQuote} from './usdt-bridge-provider.js'
import {POCKET_USDT_ASSETS} from '../../src/pocket/lib/pocketUsdtAssets.js'
import {chainReceived} from './solana-usdt-bridge-settlement.js'

export const solanaUsdtDestinationEnabled=()=>process.env.POCKET_EVM_SOLANA_USDT_BRIDGE_ENABLED==='true'
// Official RelayDepository.sol: RelayErc20Deposit has four non-indexed arguments.
// https://github.com/relayprotocol/relay-depository/blob/main/packages/ethereum-vm/src/RelayDepository.sol
export const RELAY_DEPOSIT_EVENT=parseAbi(['event RelayErc20Deposit(address from,address token,uint256 amount,bytes32 id)'])
export async function quoteEvmSolanaUsdt(input:{ownerId:string;walletId:string;walletAddress:`0x${string}`;destinationAddress:string;source:string;amount:string},fetcher=fetch):Promise<UsdtBridgeQuote>{
 if(input.source!=='arbitrum')bridgeError('This Solana bridge route is not available yet.')
 if(!/^\d+(\.\d{1,6})?$/.test(input.amount)||input.amount.length>40)bridgeError('Enter a USDT amount.')
 const amountUnits=parseUnits(input.amount,6).toString(),destinationAddress=new PublicKey(input.destinationAddress).toBase58()
 const route=await quoteRelayUsdt({source:'arbitrum',destination:'solana',sender:input.walletAddress,recipient:destinationAddress,amountUnits},process.env.RELAY_API_KEY||'',fetcher)
 if(route.execution.kind!=='evm')throw Error('Unexpected bridge transaction format.')
 return {...input,source:'arbitrum',destination:'solana',destinationAddress,id:randomUUID(),amount:formatUnits(BigInt(amountUnits),6),amountUnits,
 receive:formatUnits(BigInt(route.receiveUnits),6),minimumReceive:formatUnits(BigInt(route.minimumUnits),6),minimumUnits:route.minimumUnits,
 fee:formatUnits(BigInt(amountUnits)-BigInt(route.receiveUnits),6),expiresAt:route.expiresAt,callData:route.execution.callData,
 transactionId:route.orderId,requestId:route.requestId,provider:'relay'}
}
export function relayUsdtDepositMatches(q:UsdtBridgeQuote,logs:readonly any[]){
 if(q.provider!=='relay'||q.source!=='arbitrum'||q.destination!=='solana')return false
 return logs.filter(log=>{
  if(log.removed||!sameAddress(log.address,RELAY_USDT_CHAINS.arbitrum.depository))return false
  try{const {args}=decodeEventLog({abi:RELAY_DEPOSIT_EVENT,data:log.data,topics:log.topics});return sameAddress(args.from,q.walletAddress)&&sameAddress(args.token,POCKET_USDT_ASSETS.arbitrum.address)&&args.amount===BigInt(q.amountUnits)&&sameAddress(args.id,q.transactionId)}catch{return false}
 }).length===1
}
const hashValid=(network:string,value:unknown):value is string=>typeof value==='string'&&(network==='solana'?/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value):/^0x[0-9a-fA-F]{64}$/.test(value))
type Settlement={network:'arbitrum'|'solana';transactionHash:string;amountUnits:string}
type Delivery={status:'pending'|'needs_attention'}|{status:'completed'|'refunded';settlement:Settlement}
/** Only called after the exact source order, debit and reimbursement are proven. */
export async function readEvmSolanaUsdtDelivery(q:UsdtBridgeQuote,txHash:string,overrides:Partial<{fetch:typeof fetch;received:typeof chainReceived;apiKey:string}>={}):Promise<Delivery>{
 const deps={fetch:globalThis.fetch,received:chainReceived,apiKey:process.env.RELAY_API_KEY||'',...overrides}
 if(q.provider!=='relay'||q.source!=='arbitrum'||q.destination!=='solana'||!hashValid('arbitrum',q.requestId)||!hashValid('arbitrum',q.transactionId)||!hashValid('arbitrum',txHash))throw Error('Invalid saved Relay route.')
 if(!deps.apiKey.trim())throw Error('Bridge recovery provider is not configured.')
 const get=async(path:string)=>{const res=await deps.fetch('https://api.relay.link'+path,{headers:{'x-api-key':deps.apiKey},signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('Bridge status temporarily unavailable.');return res.json()}
 const status=await get('/intents/status/v3?requestId='+encodeURIComponent(q.requestId!))
 if(!['success','refund','failure'].includes(status?.status))return {status:'pending'}
 if(status.status==='failure')return {status:'needs_attention'}
 if(status.originChainId!==42161||!Array.isArray(status.inTxHashes)||!status.inTxHashes.some((h:unknown)=>sameAddress(h,txHash)))return {status:'needs_attention'}
 const data=await get('/requests/v3?'+new URLSearchParams({id:q.requestId!,orderId:q.transactionId,limit:'1'}))
 if(!Array.isArray(data?.requests)||data.requests.length!==1)return {status:'pending'}
 const request=data.requests[0]
 if(!sameAddress(request.id,q.requestId!)||!sameAddress(request.protocol?.orderId,q.transactionId)||request.protocol?.hubType!=='onchain'||request.status!==status.status||!sameAddress(request.user,q.walletAddress)||request.recipient!==q.destinationAddress||!Array.isArray(request.data?.inTxs)||!request.data.inTxs.some((t:any)=>sameAddress(t.txHash,txHash)&&t.chainId===42161&&t.status==='success'))return {status:'needs_attention'}
 let network:Settlement['network']='solana',recipient=q.destinationAddress,expected:bigint|null=null
 if(status.status==='refund'){
  const refund=request.data.refundCurrencyData
  if(refund?.currency?.chainId!==42161&&refund?.currency?.chainId!==RELAY_USDT_CHAINS.solana.id)return {status:'needs_attention'}
  network=refund.currency.chainId===42161?'arbitrum':'solana';recipient=network==='arbitrum'?q.walletAddress:q.destinationAddress
  const token=POCKET_USDT_ASSETS[network].address
  if(!(network==='solana'?refund.currency.address===token:sameAddress(refund.currency.address,token))||refund.currency.decimals!==6||!/^\d{1,20}$/.test(String(refund.amount))||BigInt(refund.amount)<=0n||BigInt(refund.amount)>BigInt(q.amountUnits))return {status:'needs_attention'}
  expected=BigInt(refund.amount)
 }else if(status.destinationChainId!==RELAY_USDT_CHAINS.solana.id)return {status:'needs_attention'}
 if(!Array.isArray(request.data.outTxs)||!Array.isArray(status.txHashes))return {status:'pending'}
 const outputs=request.data.outTxs.filter((t:any)=>t.status==='success'&&t.chainId===RELAY_USDT_CHAINS[network].id&&status.txHashes.includes(t.txHash))
 if(outputs.length!==1||!hashValid(network,outputs[0].txHash))return {status:'needs_attention'}
 const hash=outputs[0].txHash,received=await deps.received(network,hash,recipient)
 if(received===null)return {status:'pending'}
 if(received<=0n||received>BigInt(q.amountUnits)||(expected!==null?received!==expected:received<BigInt(q.minimumUnits)))return {status:'needs_attention'}
 return {status:status.status==='refund'?'refunded':'completed',settlement:{network,transactionHash:hash,amountUnits:String(received)}}
}
