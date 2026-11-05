import {parseUnits} from 'viem'
import {readDisplaySettlement,assertDisplaySnapshotCurrent} from './display-balance-settlement.js'
import type {CircleLinkRecord} from '../privy-circle-link.js'
import {providerUsageFetch,circleUsageOperation} from './provider-usage.js'

const chains={base:'BASE',arbitrum:'ARB',ethereum:'ETH',polygon:'MATIC',solana:'SOL',arc:'ARC'} as const
export type DisplayToken={address:string;decimals:number}
/** Display only. Identity, network, token and precision must all match before publishing. */
export async function fetchCircleTokenUnits(link:CircleLinkRecord,token:DisplayToken,fetcher=fetch,settlement=readDisplaySettlement):Promise<bigint>{
 const chain=chains[link.chain],key=process.env.CIRCLE_API_KEY
 if(!chain||!key||key.startsWith('TEST_')||link.circleBlockchain!==chain||!Number.isInteger(token.decimals)||token.decimals<0||token.decimals>36)throw Error('Circle balance configuration unavailable.')
 const same=(a:unknown,b:string)=>typeof a==='string'&&(link.chain==='solana'?a===b:a.toLowerCase()===b.toLowerCase())
 const path='/v1/w3s/wallets/'+encodeURIComponent(link.circleWalletId),signal=AbortSignal.timeout(6000)
 const request=async(path:string)=>{
  const r=await providerUsageFetch({feature:'balance-display',network:link.chain,operation:circleUsageOperation(path)},fetcher)('https://api.circle.com'+path,{headers:{Authorization:'Bearer '+key},signal,redirect:'error'})
  if(!r.ok||/;\s*rel="next"/.test(r.headers.get('link')||''))throw Error('Incomplete Circle balance.')
  const body=await r.json();if(!body.data)throw Error('Invalid Circle balance.');return body.data
 }
 const [{wallet},{tokenBalances:rows}]=await Promise.all([request(path),request(path+'/balances?'+new URLSearchParams({includeAll:'true',tokenAddress:token.address,pageSize:'50'}))])
 if(!wallet||wallet.id!==link.circleWalletId||wallet.blockchain!==chain||!same(wallet.address,link.circleWalletAddress))throw Error('Circle wallet binding changed.')
 if(!Array.isArray(rows)||rows.length>1)throw Error('Incomplete Circle token balance.')
 const settledAt=await settlement(link,token)
 if(!rows.length){assertDisplaySnapshotCurrent(undefined,settledAt);return 0n}
 const row=rows[0],t=row.token
 if(!t||t.blockchain!==chain||!same(t.tokenAddress,token.address)||t.decimals!==token.decimals||t.isNative===true||typeof row.amount!=='string'||!new RegExp('^\\d{1,78}(?:\\.\\d{1,'+Math.max(1,token.decimals)+'})?$').test(row.amount)||(row.amount.split('.')[1]?.length||0)>token.decimals)throw Error('Invalid Circle token balance.')
 assertDisplaySnapshotCurrent(row.updateDate,settledAt)
 const units=parseUnits(row.amount,token.decimals);if(units>=2n**256n)throw Error('Invalid Circle amount.');return units
}

export function createCircleTokenDisplayReader(provider=fetchCircleTokenUnits,now=Date.now){
 const entries=new Map<string,{value?:bigint;at?:number;retryAt?:number;pending?:Promise<bigint>}>()
 return async(link:CircleLinkRecord,token:DisplayToken,fallback:()=>Promise<bigint>,fresh=false)=>{
  const key=JSON.stringify([link.privyUserId,link.chain,link.circleWalletId,link.circleWalletAddress,link.updatedAt,token.address,token.decimals])
  let e=entries.get(key);if(!e){e={};entries.set(key,e)}
  if(e.pending)return e.pending
  if(!fresh&&e.value!==undefined&&now()-(e.at||0)<30000)return e.value
  const current=e
  current.pending=(async()=>{
   let value:bigint
   if(now()>=(current.retryAt||0)){
    try{value=await provider(link,token);current.retryAt=0}
    catch{current.retryAt=now()+60000;value=await fallback()}
   }else value=await fallback()
   if(typeof value!=='bigint'||value<0n||value>=2n**256n)throw Error('Invalid token balance.')
   current.value=value;current.at=now();return value
  })()
  try{return await current.pending}finally{current.pending=undefined;if(entries.size>1000)for(const[k,v]of entries)if(k!==key&&!v.pending){entries.delete(k);break}}
 }
}
export const readCircleTokenDisplay=createCircleTokenDisplayReader()
