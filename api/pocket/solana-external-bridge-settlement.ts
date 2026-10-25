import {Connection} from '@solana/web3.js'
import {formatUnits,type Hex} from 'viem'
import {getRpc} from '../relay-solana.js'
import {inboundBridgeClient} from './inbound-bridge-networks.js'
import {bscBridgeDeliveryCandidate,bscBridgeDeliveryProven,evmStablecoinDelta} from './bsc-bridge-evidence.js'
import {xlayerBridgeDeliveryCandidate,xlayerBridgeDeliveryProven} from './xlayer-bridge-evidence.js'
import {bscBridgeTokenAddress} from './bsc-bridge-provider.js'
import {appendPocketMoneyLedgerEvent} from './money-ledger.js'
import {durableSolanaUsdtBridgeStore,type SolanaUsdtBridgeRecord} from './solana-usdt-bridge-state.js'

export async function externalBridgeReceived(network:'solana'|'bsc'|'xlayer',asset:'USDC'|'USDT',hash:string,recipient:string){
 if(network==='solana'){
  const tx=await new Connection(getRpc(),'confirmed').getParsedTransaction(hash,{commitment:'finalized',maxSupportedTransactionVersion:0})
  if(!tx?.meta||tx.meta.err!==null||tx.transaction.signatures[0]!==hash)return null
  const mint=bscBridgeTokenAddress(network,asset)
  const sum=(rows:any[])=>{const seen=new Set<number>();return rows.filter(r=>r.owner===recipient&&r.mint===mint).reduce((v,r)=>{if(!Number.isSafeInteger(r.accountIndex)||r.accountIndex<0||seen.has(r.accountIndex)||r.uiTokenAmount?.decimals!==6||!/^\d+$/.test(r.uiTokenAmount.amount))throw Error('Invalid refund evidence.');seen.add(r.accountIndex);return v+BigInt(r.uiTokenAmount.amount)},0n)}
  if(!tx.meta.preTokenBalances||!tx.meta.postTokenBalances)return null
  return sum(tx.meta.postTokenBalances)-sum(tx.meta.preTokenBalances)
 }
 const rpc=inboundBridgeClient(network)
 if(await rpc.getChainId()!==(network==='bsc'?56:196))throw Error('Settlement network mismatch.')
 const receipt=await rpc.getTransactionReceipt({hash:hash as Hex}).catch(()=>null)
 if(!receipt)return null
 const block=await rpc.getBlock({blockNumber:receipt.blockNumber})
 if(block.hash!==receipt.blockHash||await rpc.getBlockNumber()<receipt.blockNumber+(network==='bsc'?14n:2n))return null
 return evmStablecoinDelta(receipt,network,asset,recipient,hash)
}
const defaults={store:durableSolanaUsdtBridgeStore,fetch:globalThis.fetch,received:externalBridgeReceived,ledger:appendPocketMoneyLedgerEvent,now:Date.now,apiKey:()=>process.env.RELAY_API_KEY||''}
export async function reconcileSolanaExternalBridge(owner:string,id:string,overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides},r=await d.store.read(id)
 if(!r||r.ownerId!==owner||!['bsc','xlayer'].includes(r.quote.destination))throw Error('Bridge not found.')
 async function terminal(record:SolanaUsdtBridgeRecord){
  const s=record.settlement!;const asset=s.asset||record.quote.asset
  await d.ledger({eventKey:'solana-usdt-bridge:'+record.id+':'+record.phase,ownerId:owner,executionId:record.id,rail:'wallet_bridge',state:record.phase as 'completed'|'refunded',asset,amount:formatUnits(BigInt(s.amountUnits),s.network==='bsc'?18:6),sourceNetwork:'solana',settlementNetwork:s.network,resourceId:record.id,providerReference:record.quote.requestId,transactionHash:record.signature,recordedAt:s.verifiedAt,metadata:{provider:'relay',destinationTxHash:s.transactionHash}})
  return {status:record.phase,settlement:s}
 }
 if(['completed','refunded'].includes(r.phase))return terminal(r)
 if(r.phase!=='source_confirmed'||!r.signature)return {status:r.phase}
 if(!d.apiKey())throw Error('Bridge recovery is unavailable.')
 const get=async(path:string)=>{const response=await d.fetch('https://api.relay.link'+path,{headers:{'x-api-key':d.apiKey()},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Bridge status is unavailable.');return response.json()}
 const status=await get('/intents/status/v3?requestId='+encodeURIComponent(r.quote.requestId))
 if(!['success','refund','failure'].includes(status.status))return {status:'pending'}
 const requests=await get('/requests/v3?'+new URLSearchParams({id:r.quote.requestId,orderId:r.quote.orderId,limit:'1'}))
 const binding={...r.quote,source:'solana' as const,sender:r.walletAddress,recipient:r.destinationAddress}
 const candidate=r.quote.destination==='bsc'?bscBridgeDeliveryCandidate(binding as any,r.signature,status,requests):xlayerBridgeDeliveryCandidate(binding as any,r.signature,status,requests)
 if(candidate.status!=='verify_delivery')return candidate
 if(candidate.network!=='solana'&&candidate.network!==r.quote.destination)return {status:'needs_attention'}
 const received=await d.received(candidate.network as 'solana'|'bsc'|'xlayer',candidate.asset,candidate.hash,candidate.recipient)
 if(received===null)return {status:'pending'}
 if(!(r.quote.destination==='bsc'?bscBridgeDeliveryProven(candidate as any,received):xlayerBridgeDeliveryProven(candidate as any,received)))return {status:'needs_attention'}
 const next=await d.store.update(id,current=>{
  if(!current||current.ownerId!==owner||current.signature!==r.signature||current.quote.orderId!==r.quote.orderId)throw Error('Bridge state changed.')
  if(['completed','refunded'].includes(current.phase))return current
  if(current.phase!=='source_confirmed')throw Error('Source confirmation changed.')
  return {...current,phase:candidate.outcome,settlement:{network:candidate.network as 'solana'|'bsc'|'xlayer',asset:candidate.asset,transactionHash:candidate.hash,amountUnits:String(received),verifiedAt:d.now()},updatedAt:d.now()}
 })
 return terminal(next)
}
