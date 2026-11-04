import {Connection,PublicKey} from '@solana/web3.js'
import {getRpc} from '../relay-solana.js'
import {bscBridgeTokenAddress} from './bsc-bridge-provider.js'

export function solanaBridgeTokenDelta(tx:any,asset:'USDC'|'USDT',recipient:string,hash:string):bigint|null {
 if(!tx?.meta||tx.meta.err!==null||tx.transaction?.signatures?.[0]!==hash||!Array.isArray(tx.meta.preTokenBalances)||!Array.isArray(tx.meta.postTokenBalances))return null
 const mint=bscBridgeTokenAddress('solana',asset)
 const sum=(rows:any[])=>{const seen=new Set<number>();let amount=0n;for(const row of rows){if(row.owner!==recipient||row.mint!==mint)continue;if(!Number.isSafeInteger(row.accountIndex)||row.accountIndex<0||seen.has(row.accountIndex)||row.uiTokenAmount?.decimals!==6||!/^\d{1,20}$/.test(row.uiTokenAmount?.amount))throw Error('Invalid Solana delivery evidence.');seen.add(row.accountIndex);amount+=BigInt(row.uiTokenAmount.amount)}return amount}
 try{return sum(tx.meta.postTokenBalances)-sum(tx.meta.preTokenBalances)}catch{return null}
}
type DeliveryRpc=Pick<Connection,'getGenesisHash'|'getParsedTransaction'|'getSlot'|'getBlockSignatures'>
const MAINNET_GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
/** A provider's delivery/refund hash is a candidate, not settlement proof. */
export async function readSolanaBridgeDelivery(asset:'USDC'|'USDT',recipient:string,hash:string,rpcOverride?:DeliveryRpc,verifyTransaction?:(tx:NonNullable<Awaited<ReturnType<Connection['getParsedTransaction']>>>)=>boolean){
 if(!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(hash))return null
 const rpc=rpcOverride??new Connection(getRpc(),{commitment:'finalized',disableRetryOnRateLimit:true,fetch:async(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000),redirect:'error'})})
 if(await rpc.getGenesisHash()!==MAINNET_GENESIS)throw Error('Solana delivery network mismatch.')
 const options={commitment:'finalized' as const,maxSupportedTransactionVersion:0}
 const tx=await rpc.getParsedTransaction(hash,options)
 if(!tx||!Number.isSafeInteger(tx.slot)||tx.slot<0)return null
 const delta=solanaBridgeTokenDelta(tx,asset,recipient,hash)
 if(delta===null)return null
 if(verifyTransaction&&!verifyTransaction(tx))return null
 const finalized=await rpc.getSlot('finalized')
 if(!Number.isSafeInteger(finalized)||finalized<tx.slot)return null
 const block=await rpc.getBlockSignatures(tx.slot,'finalized')
 const includes=(value:typeof block)=>value&&new PublicKey(value.blockhash).toBase58()===value.blockhash&&value.signatures.filter(s=>s===hash).length===1
 if(!includes(block))return null
 const again=await rpc.getParsedTransaction(hash,options)
 const blockAgain=await rpc.getBlockSignatures(tx.slot,'finalized')
 if(await rpc.getGenesisHash()!==MAINNET_GENESIS)throw Error('Solana delivery network changed.')
 if(!again||again.slot!==tx.slot||!includes(blockAgain)||blockAgain!.blockhash!==block!.blockhash)return null
 // Recheck the exact transaction and token-account evidence after block reads.
 const fingerprint=(value:NonNullable<typeof tx>)=>JSON.stringify({transaction:value.transaction,err:value.meta?.err,pre:value.meta?.preTokenBalances,post:value.meta?.postTokenBalances,inner:value.meta?.innerInstructions})
 if(fingerprint(again)!==fingerprint(tx)||solanaBridgeTokenDelta(again,asset,recipient,hash)!==delta)return null
 return delta
}
