import {createPublicClient,decodeEventLog,formatUnits,http,parseAbi,type Hex} from 'viem'
import {base,arbitrum} from 'viem/chains'
import {Connection} from '@solana/web3.js'
import {getRpc} from '../relay-solana.js'
import {POCKET_USDT_ASSETS} from '../../src/pocket/lib/pocketUsdtAssets.js'
import {appendPocketMoneyLedgerEvent} from './money-ledger.js'
import {RELAY_USDT_CHAINS} from './usdt-relay-provider.js'
import {durableSolanaUsdtBridgeStore,type SolanaUsdtBridgeRecord,type SolanaUsdtBridgeStore} from './solana-usdt-bridge-state.js'

type Network='solana'|'base'|'arbitrum'
const transfer=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const units=(n:unknown):n is string=>typeof n==='string'&&/^(0|[1-9]\d{0,19})$/.test(n)
const hashValid=(n:Network,h:unknown):h is string=>typeof h==='string'&&(n==='solana'?/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(h):/^0x[0-9a-fA-F]{64}$/.test(h))

// Chain evidence is net USDT received, not a provider amount or wallet balance refresh.
export function evmUsdtReceived(receipt:any,network:'base'|'arbitrum',recipient:string,hash:string){
 if(!receipt||receipt.status!=='success'||!same(receipt.transactionHash,hash)||!Array.isArray(receipt.logs))return null
 let total=0n
 for(const log of receipt.logs){
  if(!same(log.address,POCKET_USDT_ASSETS[network].address))continue
  if(log.removed)return null
  try{const event=decodeEventLog({abi:transfer,data:log.data,topics:log.topics});total+=(same(event.args.to,recipient)?event.args.value:0n)-(same(event.args.from,recipient)?event.args.value:0n)}catch{/* Other USDT events are not transfers. */}
 }
 return total
}
export function solanaUsdtReceived(tx:any,recipient:string,hash:string){
 if(!tx?.meta||tx.meta.err!==null||tx.transaction?.signatures?.[0]!==hash||!Array.isArray(tx.meta.preTokenBalances)||!Array.isArray(tx.meta.postTokenBalances))return null
 const mint=POCKET_USDT_ASSETS.solana.address
 const sum=(rows:any[])=>{
  const seen=new Set<number>();let value=0n
  for(const row of rows){
   if(row.owner!==recipient||row.mint!==mint)continue
   if(!Number.isSafeInteger(row.accountIndex)||row.accountIndex<0||seen.has(row.accountIndex)||row.uiTokenAmount?.decimals!==6||!units(row.uiTokenAmount?.amount))throw Error('Invalid Solana token evidence.')
   seen.add(row.accountIndex);value+=BigInt(row.uiTokenAmount.amount)
  }
  return value
 }
 try{return sum(tx.meta.postTokenBalances)-sum(tx.meta.preTokenBalances)}catch{return null}
}

export type SettlementDependencies={
 store:SolanaUsdtBridgeStore;fetch:typeof fetch;apiKey:string;now:()=>number;
 received:(network:Network,hash:string,recipient:string)=>Promise<bigint|null>;
 ledger:typeof appendPocketMoneyLedgerEvent;
}
export async function chainReceived(network:Network,hash:string,recipient:string){
 if(network==='solana'){
  const rpc=new Connection(getRpc(),'confirmed')
  return solanaUsdtReceived(await rpc.getParsedTransaction(hash,{commitment:'confirmed',maxSupportedTransactionVersion:0}),recipient,hash)
 }
 const rpc=createPublicClient({chain:{base,arbitrum}[network],transport:http(process.env['PRIVATE_RPC_URL_'+network.toUpperCase()]||undefined,{timeout:15000})})
 if(await rpc.getChainId()!==RELAY_USDT_CHAINS[network].id)throw Error('Settlement RPC network mismatch.')
 const receipt=await rpc.getTransactionReceipt({hash:hash as Hex})
 const block=await rpc.getBlock({blockNumber:receipt.blockNumber})
 if(!same(block.hash,receipt.blockHash))return null
 return evmUsdtReceived(receipt,network,recipient,hash)
}
async function writeLedger(r:SolanaUsdtBridgeRecord,deps:SettlementDependencies){
 if(!r.settlement||!['completed','refunded'].includes(r.phase))return
 await deps.ledger({eventKey:'solana-usdt-bridge:'+r.id+':'+r.phase,ownerId:r.ownerId,executionId:r.id,rail:'wallet_bridge',state:r.phase,asset:'USDT',amount:formatUnits(BigInt(r.quote.amountUnits),6),sourceNetwork:'solana',settlementNetwork:r.settlement.network,resourceId:r.id,providerReference:r.quote.requestId,transactionHash:r.signature,recordedAt:r.settlement.verifiedAt,metadata:{provider:'relay',orderId:r.quote.orderId,assetSymbol:'USDT',settlementTxHash:r.settlement.transactionHash,settledAmount:formatUnits(BigInt(r.settlement.amountUnits),6),settledAmountUnits:r.settlement.amountUnits,networkFeeUnits:r.quote.networkFeeUnits,providerFeeUnits:r.quote.providerFeeUnits}})
}

export async function reconcileSolanaUsdtSettlement(ownerId:string,id:string,overrides:Partial<SettlementDependencies>={}){
 const deps:SettlementDependencies={store:durableSolanaUsdtBridgeStore,fetch:globalThis.fetch,apiKey:process.env.RELAY_API_KEY||'',now:Date.now,received:chainReceived,ledger:appendPocketMoneyLedgerEvent,...overrides}
 const r=await deps.store.read(id)
 if(!r||r.ownerId!==ownerId)throw Object.assign(Error('Bridge not found.'),{status:404})
 if(['completed','refunded'].includes(r.phase)){await writeLedger(r,deps);return {status:r.phase,settlement:r.settlement}}
 if(r.phase!=='source_confirmed'||!r.signature)return {status:r.phase}
 if(!deps.apiKey.trim())throw Error('Bridge recovery provider is not configured.')
 if(!/^0x[0-9a-fA-F]{64}$/.test(r.quote.requestId)||!/^0x[0-9a-fA-F]{64}$/.test(r.quote.orderId))throw Error('Invalid saved bridge reference.')
 const get=async(path:string)=>{const response=await deps.fetch('https://api.relay.link'+path,{headers:{'x-api-key':deps.apiKey},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Bridge status temporarily unavailable.');return response.json()}
 const status=await get('/intents/status/v3?requestId='+encodeURIComponent(r.quote.requestId))
 if(!['success','refund','failure'].includes(status?.status))return {status:'pending'}
 const destination=r.quote.destination
 if(destination!=='base'&&destination!=='arbitrum')throw Error('Invalid saved bridge destination.')
 if(status.originChainId!==RELAY_USDT_CHAINS.solana.id||!Array.isArray(status.inTxHashes)||!status.inTxHashes.includes(r.signature))return {status:'needs_attention'}
 if(status.status==='failure')return {status:'needs_attention'}
 const data=await get('/requests/v3?'+new URLSearchParams({id:r.quote.requestId,orderId:r.quote.orderId,limit:'1'}))
 if(!Array.isArray(data?.requests)||data.requests.length!==1)return {status:'pending'}
 const request=data.requests[0]
 if(request.id!==r.quote.requestId||!same(request.protocol?.orderId,r.quote.orderId)||request.protocol?.hubType!=='onchain'||request.status!==status.status||request.user!==r.walletAddress||!same(request.recipient,r.destinationAddress)||!Array.isArray(request.data?.inTxs)||!request.data.inTxs.some((t:any)=>t.txHash===r.signature&&t.chainId===RELAY_USDT_CHAINS.solana.id&&t.status==='success'))return {status:'needs_attention'}
 let network:Network=destination,recipient=r.destinationAddress,expected:bigint|null=null
 if(status.status==='refund'){
  const refund=request.data.refundCurrencyData
  network=refund?.currency?.chainId===RELAY_USDT_CHAINS.solana.id?'solana':destination
  recipient=network==='solana'?r.walletAddress:r.destinationAddress
  if(refund?.currency?.chainId!==RELAY_USDT_CHAINS[network].id||!(network==='solana'?refund.currency.address===POCKET_USDT_ASSETS.solana.address:same(refund.currency.address,POCKET_USDT_ASSETS[network].address))||refund.currency.decimals!==6||!units(refund.amount)||BigInt(refund.amount)<=0n||BigInt(refund.amount)>BigInt(r.quote.amountUnits))return {status:'needs_attention'}
  expected=BigInt(refund.amount)
 }else if(status.destinationChainId!==RELAY_USDT_CHAINS[destination].id)return {status:'needs_attention'}
 if(!Array.isArray(request.data.outTxs)||!Array.isArray(status.txHashes))return {status:'pending'}
 // The supported route is one deposit and one output payment. Multiple successful
 // output transactions require explicit reconciliation, never additive guessing.
 const outputs=request.data.outTxs.filter((t:any)=>t.status==='success'&&t.chainId===RELAY_USDT_CHAINS[network].id&&status.txHashes.includes(t.txHash))
 if(outputs.length!==1||!hashValid(network,outputs[0].txHash))return {status:'needs_attention'}
 const hash=outputs[0].txHash,received=await deps.received(network,hash,recipient)
 if(received===null)return {status:'pending'}
 if(received<=0n||received>BigInt(r.quote.amountUnits)||(expected!==null?received!==expected:received<BigInt(r.quote.minimumUnits)))return {status:'needs_attention'}
 const updated=await deps.store.update(id,current=>{
  if(!current||current.ownerId!==ownerId||current.signature!==r.signature||current.quote.orderId!==r.quote.orderId)throw Error('Bridge recovery state changed.')
  if(['completed','refunded'].includes(current.phase))return current
  if(current.phase!=='source_confirmed')throw Error('Source bridge confirmation changed.')
  return {...current,phase:status.status==='refund'?'refunded':'completed',settlement:{network,transactionHash:hash,amountUnits:String(received),verifiedAt:deps.now()},updatedAt:deps.now()}
 })
 // Retried on every terminal read if the ledger write fails after persistence.
 await writeLedger(updated,deps)
 return {status:updated.phase,settlement:updated.settlement}
}
