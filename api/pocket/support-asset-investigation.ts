import {formatUnits,type Address,type Hex} from 'viem'
import {PublicKey} from '@solana/web3.js'
import {circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {solanaReadFetch} from '../solana-read.js'
import {supportStockWallet,supportStockClient} from './support-diagnostics.js'
import {stockAssets,stockUsdc,stockTokenAbi} from '../../src/pocket/lib/pocketXStocksWallet.js'
import type {SupportChainFinding} from './support-investigation-chain.js'
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
const unavailable=():SupportChainFinding=>({status:'unavailable',text:'The live check could not be completed. This does not prove the payment failed. Your reference is saved for support.'})
export function inspectSolanaSupportTransaction(tx:any,signature:string,wallet:string):SupportChainFinding{
 if(!tx)return {status:'not_found',text:'No finalized Solana transaction was returned for this signature. It could still be processing, or the signature or network may be wrong. I cannot confirm failure.'}
 if(tx.transaction?.signatures?.[0]!==signature||!tx.meta||!Number.isSafeInteger(tx.slot))return unavailable()
 if(tx.meta.err)return {status:'unmatched',text:'This Solana transaction failed on-chain. I cannot establish that it credited your Pocket wallet. The sender or support should review the original transfer.'}
 const pre=tx.meta.preTokenBalances,post=tx.meta.postTokenBalances
 if(!Array.isArray(pre)||!Array.isArray(post))return unavailable()
 if([...pre,...post].some(item=>item.mint===mint&&typeof item.owner!=='string'))return unavailable()
 const total=(items:any[])=>items.reduce((sum:bigint,item:any)=>{if(item.mint!==mint||item.owner!==wallet)return sum;if(item.uiTokenAmount?.decimals!==6||!/^\d+$/.test(item.uiTokenAmount?.amount)||!Number.isInteger(item.accountIndex))throw Error('Invalid token evidence');return sum+BigInt(item.uiTokenAmount.amount)},0n)
 let delta:bigint
 try{delta=total(post)-total(pre)}catch{return unavailable()}
 const matched=post.some((item:any)=>item.mint===mint&&item.owner===wallet)
 if(!matched||delta<=0n)return {status:'unmatched',text:'This finalized transaction does not show a positive USDC credit to your current Pocket Solana wallet. Check the mint, receiving address and signature with the sender.'}
 return {status:'included',text:'This finalized Solana transaction increased USDC held by your Pocket wallet by '+formatUnits(delta,6)+' USDC. That verifies the credit in this transaction, not your current balance or a bank payout. If Pocket still does not show it, support can check the activity record.'}
}
export async function checkSupportSolana(owner:string,signature:string):Promise<SupportChainFinding>{
 if(!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature))return unavailable()
 try{const link=await readCircleLink(circleLinkKey(owner,'solana','payment'));if(!link||link.chain!=='solana'||(link.purpose??'payment')!=='payment')return unavailable();new PublicKey(link.circleWalletAddress)
  const signal=AbortSignal.timeout(8000)
  const call=async(method:string,params:unknown[])=>{const r=await solanaReadFetch('https://api.mainnet-beta.solana.com',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal});const json=await r.json();if(json.error)throw Error('RPC');return json.result}
  const [cluster,tx]=await Promise.all([call('getGenesisHash',[]),call('getTransaction',[signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}])])
  if(cluster!==genesis)return unavailable()
  return inspectSolanaSupportTransaction(tx,signature,link.circleWalletAddress)
 }catch{return unavailable()}
}
export async function checkSupportStockTransaction(owner:string,hash:string,overrides:Partial<{wallet:typeof supportStockWallet;client:typeof supportStockClient}>={}):Promise<SupportChainFinding>{
 if(!/^0x[a-f0-9]{64}$/i.test(hash))return unavailable()
 try{
  const wallet=await (overrides.wallet||supportStockWallet)(owner),client=(overrides.client||supportStockClient)()
  if(await client.getChainId()!==196)return unavailable()
  const receipt=await client.getTransactionReceipt({hash:hash as Hex})
  if(receipt.transactionHash.toLowerCase()!==hash.toLowerCase()||receipt.status!=='success')return {status:'unmatched',text:'This hash does not show a successful X Layer transaction. Support can review it; I cannot confirm an incoming credit.'}
  const block=await client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)return unavailable()
  const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',to='0x'+wallet.slice(2).padStart(64,'0')
  const matches=new Map<string,bigint>()
  for(const log of receipt.logs){if(log.removed||log.topics[0]?.toLowerCase()!==topic||(log.topics[2]?.toLowerCase()!==to&&log.topics[1]?.toLowerCase()!==to)||!/^0x[a-f0-9]{64}$/i.test(log.data))continue;const asset=[...stockAssets,stockUsdc].find(a=>a.address.toLowerCase()===log.address.toLowerCase());if(asset)matches.set(asset.address,(matches.get(asset.address)||0n)+BigInt(log.data)*BigInt((log.topics[2]?.toLowerCase()===to?1:0)-(log.topics[1]?.toLowerCase()===to?1:0)))}
  if(matches.size>3)return {status:'unavailable',text:'This transaction contains several asset transfers. Support should review the complete transaction rather than return a partial result.'}
  const credits=[]
  for(const [address,units]of matches){if(units<=0n)continue;const asset=[...stockAssets,stockUsdc].find(a=>a.address===address)!;const decimals=await client.readContract({address:address as Address,abi:stockTokenAbi,functionName:'decimals',blockNumber:receipt.blockNumber});if(decimals>36)return unavailable();credits.push(formatUnits(units,decimals)+' '+asset.symbol)}
  if(!credits.length){const tx=await client.getTransaction({hash:hash as Hex});if(tx.hash.toLowerCase()===hash.toLowerCase()&&tx.blockHash===receipt.blockHash&&tx.to?.toLowerCase()===wallet.toLowerCase()&&tx.from.toLowerCase()!==wallet.toLowerCase()&&tx.value>0n)return {status:'included',text:'This successful X Layer transaction sent '+formatUnits(tx.value,18)+' OKB directly to your embedded XStocks wallet. This verifies the direct transfer, not your current balance.'};return {status:'unmatched',text:'This transaction does not show a supported token credit or direct OKB payment to your embedded XStocks wallet. Internal contract transfers may need support review.'}}
  return {status:'included',text:'The successful X Layer transaction includes '+credits.join(', ')+' net credit to your embedded XStocks wallet. This confirms the token transfer, not your current holdings or any later swap, bridge or bank payout. Support can review a missing activity entry.'}
 }catch{return unavailable()}
}
