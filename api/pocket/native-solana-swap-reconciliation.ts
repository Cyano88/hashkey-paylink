import {Connection,PublicKey,VersionedTransaction} from '@solana/web3.js'
import {formatUnits} from 'viem'
import bs58 from 'bs58'
import {getRpc} from '../relay-solana.js'
import {recordCirclePocketAction,type CirclePocketActionRecord} from '../circle-pocket-action-journal.js'
import {nativeSwapPair} from '../../src/pocket/lib/pocketNativeSwap.js'
import {openSolSwap,type SolSwapQuote} from './native-solana-swap-quote.js'
import {verifyNativeSolanaSwapSignature} from './native-solana-swap-preflight.js'

export function solSwapReceiptOutput(q:SolSwapQuote,receipt:any):bigint|null{
 const approved=VersionedTransaction.deserialize(Buffer.from(q.transaction,'base64'))
 if(!receipt?.meta||receipt.meta.err||!Buffer.from(receipt.transaction.message.serialize()).equals(Buffer.from(approved.message.serialize())))return null
 const meta=receipt.meta,keys=receipt.transaction.message.getAccountKeys({accountKeysFromLookups:meta.loadedAddresses})
 const walletIndex=q.sponsorship?1:0
 if(keys.get(0)?.toBase58()!==(q.sponsorship?.sponsor||q.walletAddress)||keys.get(walletIndex)?.toBase58()!==q.walletAddress||!Number.isSafeInteger(meta.fee)||String(meta.fee)!==q.feeUnits)return null
 if(![meta.preBalances?.[walletIndex],meta.postBalances?.[walletIndex]].every(n=>Number.isSafeInteger(n)&&n>=0))return null
 if(q.sponsorship&&(![meta.preBalances?.[0],meta.postBalances?.[0]].every(n=>Number.isSafeInteger(n)&&n>=0)||meta.preBalances[0]!==meta.postBalances[0]))return null
 const {tokenIn,tokenOut}=nativeSwapPair('solana',q.from,q.to),stable=tokenIn.native?tokenOut:tokenIn
 const wallet=new PublicKey(q.walletAddress),token=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
 const ata=PublicKey.findProgramAddressSync([wallet.toBuffer(),token.toBuffer(),new PublicKey(stable.address).toBuffer()],new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'))[0].toBase58()
 const balances=(rows:any[])=>{const map=new Map<number,bigint>();for(const row of rows||[]){if(row.owner!==q.walletAddress)continue;if(!Number.isInteger(row.accountIndex)||map.has(row.accountIndex)||!/^\d+$/.test(row.uiTokenAmount?.amount||''))throw Error('Invalid token balance evidence.');if(keys.get(row.accountIndex)?.toBase58()===ata&&(row.mint!==stable.address||row.uiTokenAmount.decimals!==stable.decimals))throw Error('Invalid swap token evidence.');map.set(row.accountIndex,BigInt(row.uiTokenAmount.amount))}return map}
 const before=balances(meta.preTokenBalances),after=balances(meta.postTokenBalances)
 let stableDelta=0n,found=false
 for(const index of new Set([...before.keys(),...after.keys()])){const delta=(after.get(index)||0n)-(before.get(index)||0n);if(keys.get(index)?.toBase58()===ata){stableDelta=delta;found=true}else if(delta!==0n)return null}
 if(!found)return null
 const nativeDelta=BigInt(meta.postBalances[walletIndex])-BigInt(meta.preBalances[walletIndex]),fee=BigInt(q.feeUnits),rent=BigInt(q.rentUnits)
 if(tokenIn.native){if(nativeDelta!==-BigInt(q.amountUnits)-fee-rent||stableDelta<BigInt(q.minimumOutUnits))return null;return stableDelta}
 if(stableDelta!==-BigInt(q.amountUnits)||nativeDelta+fee<BigInt(q.minimumOutUnits))return null
 return q.sponsorship?nativeDelta:nativeDelta+fee
}
const defaults={rpc:()=>new Connection(getRpc(),'confirmed'),record:recordCirclePocketAction}
export async function reconcileNativeSolanaSwap(record:CirclePocketActionRecord,overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 if(record.action!=='wallet.native-swap'||record.metadata?.network!=='solana')throw Error('Invalid Solana swap record.')
 if(['completed','failed'].includes(record.status))return {status:record.status,txHash:record.metadata.txHash,amountOut:record.metadata.amountOut}
 const q=openSolSwap(record.metadata.quoteToken||'',record.ownerId,true)
 if(record.idempotencyKey!=='pocket:native-swap:'+q.id||record.metadata.walletAddress!==q.walletAddress)throw Error('Swap reference mismatch.')
 const rpc=d.rpc();if(await rpc.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Wrong Solana network.')
 const raw=record.metadata.signedTransaction,hash=record.metadata.txHash
 const finish=async(status:'completed'|'failed',amountOut?:string)=>{const saved=await d.record({...record,status,metadata:{...record.metadata,...(amountOut?{amountOut}:{})}});return {status:saved.status,txHash:saved.metadata?.txHash,amountOut:saved.metadata?.amountOut}}
 if(hash){
  if(!raw||bs58.encode(verifyNativeSolanaSwapSignature(q.transaction,raw,q.walletAddress,q.sponsorship?.sponsor,true).signatures[0])!==hash)throw Error('Invalid swap signature.')
  const receipt=await rpc.getTransaction(hash,{commitment:'confirmed',maxSupportedTransactionVersion:0})
  if(receipt?.meta){
   if(!Buffer.from(receipt.transaction.message.serialize()).equals(Buffer.from(VersionedTransaction.deserialize(Buffer.from(q.transaction,'base64')).message.serialize())))throw Error('Swap message mismatch.')
   if(receipt.meta.err)return finish('failed')
   const output=solSwapReceiptOutput(q,receipt);if(output!==null)return finish('completed',formatUnits(output,nativeSwapPair('solana',q.from,q.to).tokenOut.decimals))
   return {status:'pending',txHash:hash}
  }
 }
 if(await rpc.getBlockHeight('finalized')>q.lastValidBlockHeight){const state=hash?(await rpc.getSignatureStatuses([hash],{searchTransactionHistory:true})).value[0]:null;if(!state)return finish('failed')}
 else if(hash&&raw)await rpc.sendRawTransaction(Buffer.from(raw,'base64'),{skipPreflight:false,maxRetries:1}).catch(()=>{})
 return {status:hash?'pending':'awaiting_approval',challengeId:record.metadata.challengeId,txHash:hash}
}
