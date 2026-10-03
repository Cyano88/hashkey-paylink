import {createHmac} from 'node:crypto'
import {decodeEventLog,type Hex,type PublicClient} from 'viem'
import type {GiftRecord} from './types.js'

const hash=(value:unknown):value is Hex=>typeof value==='string'&&/^0x[0-9a-f]{64}$/i.test(value)
// Cache provider discovery only, never a provider's assertion of settlement.
const cache=new Map<string,{until:number;result:Promise<Hex[]>}>()
export function cachedDiscovery(key:string,read:()=>Promise<Hex[]>,now=Date.now()):Promise<Hex[]>{
 const old=cache.get(key);if(old&&old.until>now)return old.result
 if(cache.size>=256)cache.delete(cache.keys().next().value!)
 const result=read().catch(()=>[])
 cache.set(key,{until:now+15000,result});return result
}
export async function discoverGiftTransactions(r:GiftRecord,height:bigint,fetcher:typeof fetch=fetch):Promise<Hex[]>{
 const known=new Set([r.fundingHash,r.refundHash,r.settlementHash,...Object.values(r.settlements||{}).map(s=>s.hash)].filter(Boolean))
 const saved=(r.eventHints||[]).filter(h=>hash(h)&&!known.has(h))
 const key=[r.deployment.chainId,r.deployment.escrow,r.giftId,r.evidenceScanBlock||'',...saved].join(':')
 const discovered=await cachedDiscovery(key,async()=>{
  if(r.deployment.network==='base'){
   if(!process.env.CIRCLE_API_KEY)return []
   const ids=[r.funding,r.refund,r.claim,...Object.values(r.claims||{})].filter(a=>a?.transactionId).map(a=>a!.transactionId!)
   const values=await Promise.all([...new Set(ids)].slice(-8).map(async id=>{
    if(!/^[a-f0-9-]{36}$/i.test(id))return undefined
    const response=await fetcher('https://api.circle.com/v1/w3s/transactions/'+id,{headers:{Authorization:'Bearer '+process.env.CIRCLE_API_KEY},signal:AbortSignal.timeout(4000),redirect:'error'})
    if(!response.ok)return undefined
    const body=await response.json();return body?.data?.transaction?.txHash
   }))
   return values.filter(hash)
  }
  if(r.deployment.network!=='xlayer')return []
  const dedicated=['OKX_DEX_API_KEY','OKX_DEX_SECRET_KEY','OKX_DEX_PASSPHRASE'].some(k=>!!process.env[k])
  const key=process.env[dedicated?'OKX_DEX_API_KEY':'OKX_API_KEY'],secret=process.env[dedicated?'OKX_DEX_SECRET_KEY':'OKX_SECRET_KEY'],passphrase=process.env[dedicated?'OKX_DEX_PASSPHRASE':'OKX_PASSPHRASE']
  if(!key||!secret||!passphrase)return []
  const start=BigInt(r.evidenceScanBlock||r.deployment.deploymentBlock||'0')
  const path='/api/v5/xlayer/log/by-block-and-address?'+new URLSearchParams({chainShortName:'xlayer',startBlockHeight:String(start>height?height:start),endBlockHeight:String(height),address:r.deployment.escrow})
  const timestamp=new Date().toISOString(),signature=createHmac('sha256',secret).update(timestamp+'GET'+path).digest('base64')
  const response=await fetcher('https://web3.okx.com'+path,{headers:{'OK-ACCESS-KEY':key,'OK-ACCESS-SIGN':signature,'OK-ACCESS-PASSPHRASE':passphrase,'OK-ACCESS-TIMESTAMP':timestamp},signal:AbortSignal.timeout(4000),redirect:'error'})
  if(!response.ok)return []
  const body=await response.json();if(body.code!=='0'||!Array.isArray(body.data))return []
  // Empty, truncated or delayed indexer results never advance a chain cursor.
  return body.data.filter((l:any)=>l.address?.toLowerCase()===r.deployment.escrow.toLowerCase()&&l.topics?.[1]?.toLowerCase()===r.giftId.toLowerCase()).map((l:any)=>l.txId).filter(hash)
 })
 return [...new Set([...saved,...discovered])].filter(h=>!known.has(h)).slice(0,16)
}

/** A provider supplies transaction locations only. Accept logs exclusively from canonical RPC receipts. */
export async function verifiedHintLogs(client:PublicClient,r:GiftRecord,height:bigint,events:readonly any[],hints:readonly Hex[]){
 const logs:any[]=[]
 await Promise.all([...new Set(hints)].slice(0,16).map(async tx=>{
  try{
   const receipt=await client.getTransactionReceipt({hash:tx})
   if(receipt.status!=='success'||receipt.blockNumber<BigInt(r.deployment.deploymentBlock||'0')||receipt.blockNumber>height||receipt.transactionHash.toLowerCase()!==tx.toLowerCase())return
   const block=await client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)return
   for(const log of receipt.logs){
    if(log.removed||log.address.toLowerCase()!==r.deployment.escrow.toLowerCase())continue
    try{const decoded=decodeEventLog({abi:events,data:log.data,topics:log.topics,strict:true}) as any
     if(decoded.args.giftId?.toLowerCase()===r.giftId.toLowerCase())logs.push({...log,args:decoded.args,eventName:decoded.eventName,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,transactionHash:tx,removed:false})
    }catch{/* Other events in the same transaction. */}
   }
  }catch{/* Unavailable hints fall back to bounded RPC scanning. */}
 }))
 return logs
}
