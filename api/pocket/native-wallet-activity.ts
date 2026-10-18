import { createHash } from 'node:crypto'
import { circleLinkKey, readCircleLink, type CircleLinkRecord } from '../privy-circle-link.js'
import { hasRenderDurableStore, readDurableJson, mutateDurableJson } from '../render-durable-store.js'
import { persistObservedWalletActivity } from './activity-feed.js'
import { pocketNativeOnNetwork } from '../../src/pocket/lib/pocketNativeAssets.js'
import type { PocketActivityRow } from '../../src/pocket/lib/pocketSchemas.js'

export const nativeHistoryNetworks = ['ethereum','base','arbitrum','polygon','solana'] as const
const chains = {ethereum:'ETH',base:'BASE',arbitrum:'ARB',polygon:'MATIC',solana:'SOL'} as const
type Network = typeof nativeHistoryNetworks[number]
type Token = {id:string; blockchain:string; isNative:boolean; symbol:string; decimals:number}
type Transaction = {id:string; walletId:string; blockchain:string; tokenId?:string; operation?:string; transactionType?:string; state:string; txHash?:string; sourceAddress?:string; destinationAddress?:string; amounts?:string[]; createDate:string; firstConfirmDate?:string; updateDate?:string}
type Request = (path:string)=>Promise<{data:any; link:string|null}>
type Cursor = {path?:string; complete?:boolean; head?:string}
const tokenCache = new Map<string,Token>()
const sameAddress = (network:string,a?:string,b?:string) => Boolean(a&&b&&(network==='solana'?a===b:a.toLowerCase()===b.toLowerCase()))

export function circleNativeActivityRow(link:CircleLinkRecord, tx:Transaction, token:Token):PocketActivityRow|null {
 const network=link.chain as Network,asset=pocketNativeOnNetwork(network)
 if(!asset||!Object.hasOwn(chains,network)||tx.walletId!==link.circleWalletId||tx.blockchain!==chains[network]||token.id!==tx.tokenId||token.blockchain!==chains[network])throw Error('Native history scope mismatch.')
 if(!token.isNative)return null
 if(token.decimals!==asset.decimals||![asset.symbol,...(asset.symbol==='POL'?['MATIC']:[])].includes(token.symbol as never))throw Error('Native token identity mismatch.')
 if(tx.operation!=='TRANSFER'||!['INBOUND','OUTBOUND'].includes(tx.transactionType||'')||!['CONFIRMED','COMPLETE'].includes(tx.state))return null
 const incoming=tx.transactionType==='INBOUND'
 if(!sameAddress(network,incoming?tx.destinationAddress:tx.sourceAddress,link.circleWalletAddress))throw Error('Native history wallet mismatch.')
 const amount=tx.amounts?.length===1?tx.amounts[0]:''
 if(!new RegExp('^\\d{1,78}(?:\\.\\d{1,'+asset.decimals+'})?$').test(amount)||!/[1-9]/.test(amount)||!tx.id||!tx.txHash)return null
 if(network==='solana'?!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(tx.txHash):!/^0x[0-9a-f]{64}$/i.test(tx.txHash))throw Error('Native history reference invalid.')
 const ts=Date.parse(tx.firstConfirmDate||tx.createDate)
 if(!Number.isFinite(ts))throw Error('Native history date invalid.')
 return {eventId:'circle-native:'+tx.id,txHash:tx.txHash,chain:network,payer:tx.sourceAddress||'',recipient:tx.destinationAddress,amount,assetSymbol:asset.symbol,memo:incoming?asset.symbol+' deposit':asset.symbol+' sent',ts,source:incoming?'wallet-deposit':'wallet-withdrawal',settlementType:'wallet_transfer',direction:incoming?'in':'out',paycrestStatus:'confirmed'}
}

export function nativeHistoryNextPage(link:string|null,currentPath:string):string|undefined {
 const next=(link||'').split(',').filter(part=>/;\s*rel="next"/.test(part))
 if(!next.length)return undefined
 const match=next.length===1&&next[0].match(/^\s*<([^>]+)>/)
 if(!match)throw Error('Native history pagination invalid.')
 const current=new URL(currentPath,'https://api.circle.com'),url=new URL(match[1],current)
 if(url.origin!==current.origin||url.pathname!==current.pathname||url.username||url.password||url.hash||!url.searchParams.get('pageAfter')||url.searchParams.has('pageBefore'))throw Error('Native history pagination scope mismatch.')
 for(const key of ['walletIds','includeAll','pageSize'])if(url.searchParams.get(key)!==current.searchParams.get(key))throw Error('Native history pagination scope mismatch.')
 return url.pathname+url.search
}

// Each page is persisted before advancing the durable backfill cursor. Provider
// outages and restarts cannot erase observed rows or skip an unfinished page.
export async function scanCircleNativeHistory(link:CircleLinkRecord, request:Request, dependencies:{readCursor():Promise<Cursor|undefined>; saveCursor(cursor:Cursor):Promise<void>; persist(rows:PocketActivityRow[]):Promise<void>}) {
 const network=link.chain as Network
 if(!Object.hasOwn(chains,network)||link.circleBlockchain!==chains[network])throw Error('Native history chain mismatch.')
 const {data}=await request('/v1/w3s/wallets/'+encodeURIComponent(link.circleWalletId)),wallet=data?.wallet
 if(!wallet||wallet.id!==link.circleWalletId||wallet.blockchain!==chains[network]||!sameAddress(network,wallet.address,link.circleWalletAddress))throw Error('Native history wallet binding changed.')
 const first='/v1/w3s/transactions?'+new URLSearchParams({walletIds:link.circleWalletId,includeAll:'true',pageSize:'50'})
 const cursor=await dependencies.readCursor(),tokens=tokenCache,observed:PocketActivityRow[]=[]
 let headIds:string[]=[]
 const readPage=async(path:string)=>{
  // Validate stored cursor just as strictly as a fresh provider Link.
  if(path!==first)nativeHistoryNextPage('<https://api.circle.com'+path+'>; rel="next"',first)
  const result=await request(path),transactions=result.data?.transactions
  if(!Array.isArray(transactions)||transactions.length>50)throw Error('Native history response invalid.')
  if(path===first)headIds=transactions.map((tx:Transaction)=>tx.id)
  const rows:PocketActivityRow[]=[]
  for(const tx of transactions as Transaction[]){
   if(tx.walletId!==link.circleWalletId||tx.blockchain!==chains[network])throw Error('Native history scope mismatch.')
   if(!tx.tokenId||tx.operation!=='TRANSFER'||!['CONFIRMED','COMPLETE'].includes(tx.state))continue
   if(!/^[a-zA-Z0-9-]{1,80}$/.test(tx.tokenId))throw Error('Native token reference invalid.')
   let token=tokens.get(tx.tokenId)
   if(!token){token=(await request('/v1/w3s/tokens/'+encodeURIComponent(tx.tokenId))).data?.token;if(!token)throw Error('Native token identity unavailable.');if(token.id!==tx.tokenId||token.blockchain!==chains[network])throw Error('Native token scope mismatch.');if(tokens.size>=512)tokens.delete(tokens.keys().next().value!);tokens.set(tx.tokenId,token)}
   const row=circleNativeActivityRow(link,tx,token);if(row)rows.push(row)
  }
  await dependencies.persist(rows);observed.push(...rows)
  return nativeHistoryNextPage(result.link,path)
 }
 const next=await readPage(first)
 if(cursor?.complete&&(!next||cursor.head&&headIds.includes(cursor.head))){await dependencies.saveCursor({complete:true,head:headIds[0]||cursor.head});return observed}
 const head=cursor?.complete?headIds[0]:cursor?.head||headIds[0]
 let path=cursor?.complete?next:cursor?.path||next
 // Bound work per refresh while continuing older pages on subsequent refreshes.
 for(let page=0;path&&page<2;page++){
  const following=await readPage(path)
  if(following===path)throw Error('Native history cursor repeated.')
  path=following
  await dependencies.saveCursor({path,complete:!path,head})
 }
 if(!path)await dependencies.saveCursor({complete:true,head})
 else await dependencies.saveCursor({path,head})
 return observed
}

const inflight=new Map<string,Promise<{payments:PocketActivityRow[];merchants:never[];collections:never[]}>>()
export async function readPocketNativeHistory(owner:string,network:Network) {
 const key='pocket:native-history:v1:'+createHash('sha256').update(owner+':'+network).digest('hex')
 const pending=inflight.get(key);if(pending)return pending
 const work=(async()=>{
  const empty={payments:[] as PocketActivityRow[],merchants:[] as never[],collections:[] as never[]}
  const link=await readCircleLink(circleLinkKey(owner,network,'payment'));if(!link)return empty
  if(link.privyUserId!==owner)throw Error('Native history owner mismatch.')
  const apiKey=process.env.CIRCLE_API_KEY;if(!apiKey||apiKey.startsWith('TEST_'))throw Error('Native history unavailable.')
  const signal=AbortSignal.timeout(13000)
  const request:Request=async path=>{const r=await fetch('https://api.circle.com'+path,{headers:{Authorization:'Bearer '+apiKey},signal,redirect:'error'});if(!r.ok)throw Error('Native history provider unavailable.');return {data:(await r.json()).data,link:r.headers.get('link')}}
  const cursorKey=key+':'+createHash('sha256').update(link.circleWalletId+':'+link.circleWalletAddress).digest('hex')
  const payments=await scanCircleNativeHistory(link,request,{readCursor:()=>readDurableJson<Cursor>(cursorKey),saveCursor:async cursor=>{if(hasRenderDurableStore())await mutateDurableJson(cursorKey,()=>cursor)},persist:rows=>persistObservedWalletActivity(owner,rows)})
  return {...empty,payments}
 })().finally(()=>inflight.delete(key))
 inflight.set(key,work);return work
}
