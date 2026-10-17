import {Connection,Transaction} from '@solana/web3.js'
import {getRpc} from '../relay-solana.js'
import {recordCirclePocketAction,type CirclePocketActionRecord} from '../circle-pocket-action-journal.js'
import {confirmsNativeSend,revertedNativeBatch,nativeEvmNetworks,openNativeSend,type NativeEvmNetwork,type NativeCallTrace} from './native-send-quote.js'
import {openNativeSolana,validateNativeSolanaTransaction} from './native-solana-send-quote.js'

export async function nativeSendRpc<T>(network:NativeEvmNetwork,method:string,params:unknown[]):Promise<T>{
 const urls={ethereum:process.env.PRIVATE_RPC_URL_ETHEREUM,base:process.env.PRIVATE_RPC_URL,arbitrum:process.env.PRIVATE_RPC_URL_ARB,polygon:process.env.PRIVATE_RPC_URL_POLYGON}
 const url=urls[network];if(!url)throw Error('Transaction connection unavailable.')
 const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000),redirect:'error'})
 if(!r.ok)throw Error('Transaction connection unavailable.');const body=await r.json();if(body.error||!Object.hasOwn(body,'result'))throw Error('Transaction verification unavailable.');return body.result
}
const defaults={rpc:nativeSendRpc,solana:()=>new Connection(getRpc(),'confirmed'),record:recordCirclePocketAction}
/** Reconcile only durable approved evidence; never create a provider challenge or a new transaction. */
export async function reconcileNativeSend(record:CirclePocketActionRecord,overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 if(record.action!=='wallet.native-send')throw Error('Invalid transfer record.')
 if(['completed','failed'].includes(record.status))return {status:record.status,txHash:record.metadata?.txHash}
 const token=record.metadata?.quoteToken;if(!token)throw Error('Missing approved transfer.')
 const hash=record.metadata?.txHash
 const finish=async(status:'completed'|'failed')=>{const saved=await d.record({...record,status});return {status:saved.status,txHash:saved.metadata?.txHash}}
 if(record.metadata?.network==='solana'){
  const q=openNativeSolana(token,record.ownerId,true)
  if(record.idempotencyKey!=='pocket:native-send:'+q.id)throw Error('Transfer reference mismatch.')
  const rpc=d.solana();if(await rpc.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Wrong Solana network.')
  const raw=record.metadata?.signedTransaction
  if(hash){
   if(!raw||validateNativeSolanaTransaction(q,raw,true).signature!==hash)throw Error('Invalid saved signature.')
   const receipt=await rpc.getTransaction(hash,{commitment:'confirmed',maxSupportedTransactionVersion:0})
   if(receipt?.meta){
    if(!Buffer.from(receipt.transaction.message.serialize()).equals(Transaction.from(Buffer.from(q.transaction,'base64')).serializeMessage()))throw Error('Transaction does not match the approved transfer.')
    return finish(receipt.meta.err?'failed':'completed')
   }
  }
  if(await rpc.getBlockHeight('finalized')>q.lastValidBlockHeight){
   const status=hash?(await rpc.getSignatureStatuses([hash],{searchTransactionHistory:true})).value[0]:null
   if(!status)return finish('failed')
  }else if(hash&&raw){await rpc.sendRawTransaction(Buffer.from(raw,'base64'),{skipPreflight:false,maxRetries:1}).catch(()=>{})}
  return {status:hash?'pending':'awaiting_approval',challengeId:record.metadata?.challengeId}
 }
 const q=openNativeSend(token,record.ownerId,true)
 if(record.idempotencyKey!=='pocket:native-send:'+q.id||record.metadata?.network!==q.network)throw Error('Transfer reference mismatch.')
 // Circle authentication stays in the foreground; only provider-bound hashes are persisted.
 if(!hash)return {status:'pending',challengeId:record.metadata?.challengeId}
 if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Invalid transaction reference.')
 if(Number(BigInt(await d.rpc<string>(q.network,'eth_chainId',[])))!==nativeEvmNetworks[q.network].id)throw Error('Transaction network mismatch.')
 const receipt=await d.rpc<{status:string;blockHash:string;blockNumber:string;transactionHash:string}|null>(q.network,'eth_getTransactionReceipt',[hash])
 if(!receipt||!['0x0','0x1'].includes(receipt.status)||receipt.transactionHash.toLowerCase()!==hash.toLowerCase())return {status:'pending'}
 const block=await d.rpc<{hash:string}|null>(q.network,'eth_getBlockByNumber',[receipt.blockNumber,false])
 if(!block||block.hash!==receipt.blockHash)return {status:'pending'}
 // This hash was bound to the owned Circle challenge before being persisted.
 if(receipt.status==='0x0')return finish('failed')
 const trace=await d.rpc<NativeCallTrace>(q.network,'debug_traceTransaction',[hash,{tracer:'callTracer'}])
 if(revertedNativeBatch(q,trace))return finish('failed')
 if(!confirmsNativeSend(q,trace))return {status:'pending'}
 return finish('completed')
}
