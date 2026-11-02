import {Connection,PublicKey} from '@solana/web3.js'
import type {CircleLinkRecord} from '../privy-circle-link.js'
import type {WalletEvent} from './wallet-event-inbox.js'
import {readRecoveryEvmRpc} from '../evm-read.js'
import {solanaReadFetch} from '../solana-read.js'
import {providerUsageFetch,withProviderFeature} from './provider-usage.js'
import {evmActivity,solanaActivityRows} from './wallet-chain-activity.js'
export async function verifyWalletEvent(event:WalletEvent,link:CircleLinkRecord,d={read:readRecoveryEvmRpc,fetch:fetch}){
 if(event.walletId!==link.circleWalletId||event.blockchain!==link.circleBlockchain)throw Error('Wallet event ownership mismatch.')
 const signal=AbortSignal.timeout(10000)
 const response=await providerUsageFetch({feature:'wallet-activity',network:link.chain,operation:'transaction-read'},d.fetch)('https://api.circle.com/v1/w3s/transactions/'+event.transactionId,{headers:{Authorization:'Bearer '+process.env.CIRCLE_API_KEY},signal,redirect:'error'})
 if(!response.ok)throw Error('Wallet event lookup unavailable.')
 const tx=(await response.json()).data?.transaction
 if(!tx||tx.id!==event.transactionId||tx.walletId!==link.circleWalletId||tx.blockchain!==link.circleBlockchain||tx.state!=='COMPLETE')throw Error('Wallet event not complete.')
 const hash=tx.txHash
 if(link.chain==='solana'){
  if(typeof hash!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(hash))throw Error('Invalid event signature.')
  const connection=new Connection(process.env.SOLANA_RPC_URL?.trim()||'https://api.mainnet-beta.solana.com',{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,init)=>withProviderFeature('wallet-activity',()=>solanaReadFetch(url,{...init,signal}))})
  if(await connection.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Wrong Solana event network.')
  const parsed=await connection.getParsedTransaction(hash,{commitment:'finalized',maxSupportedTransactionVersion:0})
  if(!parsed||!parsed.meta||parsed.meta.err||!parsed.blockTime||parsed.transaction.signatures[0]!==hash)throw Error('Wallet event proof unavailable.')
  return solanaActivityRows(new PublicKey(link.circleWalletAddress),[{signature:hash,blockTime:parsed.blockTime}],[parsed])
 }
 if(typeof hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Invalid event hash.')
 const rpc=(method:string,params:any[])=>withProviderFeature('wallet-activity',()=>d.read(link.chain as Exclude<CircleLinkRecord['chain'],'solana'>,method,params,signal))
 const receipt=await rpc('eth_getTransactionReceipt',[hash]) as any,head=await rpc('eth_getBlockByNumber',['finalized',false]) as any
 if(!receipt||receipt.transactionHash?.toLowerCase()!==hash.toLowerCase()||receipt.status!=='0x1'||!receipt.blockNumber||!head?.number||BigInt(head.number)<BigInt(receipt.blockNumber))throw Error('Wallet event finality pending.')
 const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]) as any
 if(!block?.hash||block.hash.toLowerCase()!==receipt.blockHash?.toLowerCase())throw Error('Wallet event block changed.')
 const rows=await evmActivity(link.chain,link.circleWalletAddress,signal,d.read,{from:BigInt(receipt.blockNumber),to:BigInt(receipt.blockNumber)})
 return rows.filter(row=>row.txHash?.toLowerCase()===hash.toLowerCase())
}
