import {createHash} from 'node:crypto'
import {Connection,PublicKey} from '@solana/web3.js'
import {readDurableJson,mutateDurableJson,hasRenderDurableStore} from '../render-durable-store.js'
import {readRecoveryEvmRpc} from '../evm-read.js'
import {solanaReadFetch} from '../solana-read.js'
import {getAssociatedTokenAddress} from '../solana-token.js'
import {evmActivity,solanaActivityRows,type EvmNetwork} from './wallet-chain-activity.js'
import {persistObservedWalletActivity} from './activity-feed.js'
import {withProviderFeature} from './provider-usage.js'
import {POCKET_USDT_ASSETS} from '../../src/pocket/lib/pocketUsdtAssets.js'
import type {PocketActivityRow} from '../../src/pocket/lib/pocketSchemas.js'

export type RecoveryState={version:1;next?:string;span?:number;anchor?:{number:string;hash:string};head?:string;before?:string;cycleHead?:string}
export function recoveryKey(owner:string,network:string,wallet:string,asset='stablecoins'){
 return 'pocket:wallet-recovery:v1:'+createHash('sha256').update(JSON.stringify([owner,network,network==='solana'?wallet:wallet.toLowerCase(),asset])).digest('hex')
}
/** Persist first, checkpoint second. Crash/retry can replay, never skip a page.
 * Compare-and-set prevents concurrent replicas from rewinding/overwriting progress. */
export async function commitRecovery<T>(prior:T|undefined,next:T,rows:PocketActivityRow[],d:{persist(rows:PocketActivityRow[]):Promise<void>;mutate(fn:(old:T|undefined)=>T):Promise<unknown>},signal:AbortSignal){
 signal.throwIfAborted()
 await d.persist(rows)
 signal.throwIfAborted()
 await d.mutate(old=>{if(JSON.stringify(old)!==JSON.stringify(prior))throw Error('Recovery checkpoint changed.');return next})
}
export function recoveryRange(next:string|undefined,head:bigint,budget=480n){
 const from=next===undefined?(head>119n?head-119n:0n):BigInt(next)
 if(from<0n||budget<=0n)throw Error('Invalid recovery cursor.')
 if(from>head)return null
 return {from,to:from+budget-1n<head?from+budget-1n:head}
}
export function solanaRecoveryPage(prior:RecoveryState|undefined,signatures:string[],limit:number):RecoveryState{
 if(new Set(signatures).size!==signatures.length||signatures.some(s=>s===prior?.before))throw Error('Repeated recovery page.')
 const head=prior?.cycleHead||signatures[0]||prior?.head
 // Initial activation establishes a baseline; it does not claim lifetime history.
 if(!prior?.head||signatures.length<limit)return {version:1,head}
 return {version:1,head:prior.head,cycleHead:head,before:signatures.at(-1)}
}
const hash=/^0x[0-9a-f]{64}$/i,quantity=/^0x[0-9a-f]+$/i
function block(value:any){
 if(!value||!hash.test(value.hash)||!quantity.test(value.number))throw Error('Recovery block unavailable.')
 return value as {number:string;hash:string}
}
export async function recoverWalletActivity(owner:string,network:string,wallet:string,parent:AbortSignal):Promise<PocketActivityRow[]>{
 if(!hasRenderDurableStore())return []
 const signal=AbortSignal.any([parent,AbortSignal.timeout(5000)])
 const persist=(rows:PocketActivityRow[])=>persistObservedWalletActivity(owner,rows)
 if(network!=='solana'){
  if(!['base','arbitrum','ethereum','polygon','arc'].includes(network))throw Error('Unsupported recovery network.')
  const net=network as EvmNetwork,key=recoveryKey(owner,network,wallet)
  let prior=await readDurableJson<RecoveryState>(key)
  const rpc=(method:string,params:any[])=>withProviderFeature('wallet-activity',()=>readRecoveryEvmRpc(net,method,params,signal))
  const finalized=block(await rpc('eth_getBlockByNumber',['finalized',false]))
  if(!prior){const first=recoveryRange(undefined,BigInt(finalized.number))!;prior=await mutateDurableJson<RecoveryState>(key,old=>old||{version:1,next:String(first.from)})}
  if(prior.version!==1||prior.next===undefined)throw Error('Invalid recovery state.')
  if(prior?.anchor){const saved=block(await rpc('eth_getBlockByNumber',[prior.anchor.number,false]));if(saved.hash.toLowerCase()!==prior.anchor.hash.toLowerCase())throw Error('Finalized recovery anchor changed.')}
  const configured=Number(process.env.POCKET_ACTIVITY_EVM_LOG_BLOCK_RANGE||120)
  const budget=BigInt(Math.min(prior.span||480,Math.max(1,Number.isFinite(configured)&&configured>0?Math.floor(configured):120)*12))
  const range=recoveryRange(prior?.next,BigInt(finalized.number),budget)
  if(!range)return []
  const end='0x'+range.to.toString(16),anchor=block(await rpc('eth_getBlockByNumber',[end,false]))
  if(BigInt(anchor.number)!==range.to)throw Error('Recovery block mismatch.')
  let rows:PocketActivityRow[]
  try{rows=await evmActivity(net,wallet,signal,readRecoveryEvmRpc,range)}catch(error){
   if(budget>1n&&(signal.aborted||String((error as Error).message).includes('budget')||String((error as Error).message).includes('limit'))){
    const previous=prior
    await mutateDurableJson<RecoveryState>(key,old=>JSON.stringify(old)===JSON.stringify(previous)?{...previous,span:Math.max(1,Math.floor(Number(budget)/2))}:old!)
   }
   throw error
  }
  const after=block(await rpc('eth_getBlockByNumber',[end,false]))
  if(after.hash!==anchor.hash)throw Error('Recovery range changed.')
  await commitRecovery(prior,{version:1,next:String(range.to+1n),anchor,span:prior.span},rows,{persist,mutate:fn=>mutateDurableJson<RecoveryState>(key,fn)},signal)
  console.info('[wallet-recovery]',JSON.stringify({network,blocks:Number(range.to-range.from+1n),lagBlocks:Number(BigInt(finalized.number)-range.to)}))
  return rows
 }
 const connection=new Connection(process.env.SOLANA_RPC_URL?.trim()||'https://api.mainnet-beta.solana.com',{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,init)=>withProviderFeature('wallet-activity',()=>solanaReadFetch(url,{...init,signal}))})
 if(await connection.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Wrong Solana recovery network.')
 const ownerKey=new PublicKey(wallet),rows:PocketActivityRow[]=[]
 for(const mint of ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',POCKET_USDT_ASSETS.solana.address]){
  const key=recoveryKey(owner,network,wallet,mint),prior=await readDurableJson<RecoveryState>(key),ata=await getAssociatedTokenAddress(new PublicKey(mint),ownerKey,true)
  const signatures=await connection.getSignaturesForAddress(ata,{limit:5,...(prior?.head?{until:prior.head}:{}),...(prior?.before?{before:prior.before}:{})},'finalized')
  if(signatures.some(s=>s.confirmationStatus!=='finalized'))throw Error('Recovery finality pending.')
  const transactions=signatures.length?await connection.getParsedTransactions(signatures.map(s=>s.signature),{commitment:'finalized',maxSupportedTransactionVersion:0}):[]
  if(transactions.length!==signatures.length||transactions.some((tx,i)=>!tx||tx.transaction.signatures[0]!==signatures[i].signature||!tx.meta||!tx.blockTime))throw Error('Incomplete recovery transactions.')
  const found=solanaActivityRows(ownerKey,signatures,transactions)
  const next=solanaRecoveryPage(prior,signatures.map(s=>s.signature),5)
  await commitRecovery(prior,next,found,{persist,mutate:fn=>mutateDurableJson<RecoveryState>(key,fn)},signal)
  rows.push(...found)
  console.info('[wallet-recovery]',JSON.stringify({network,signatures:signatures.length,paging:!!next.before}))
 }
 return rows
}
