import type { CircleLinkRecord } from '../privy-circle-link.js'
export const circleBalanceTokens = {
 base:['BASE','0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],arbitrum:['ARB','0xaf88d065e77c8cC2239327C5EDb3A432268e5831'],ethereum:['ETH','0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],polygon:['MATIC','0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'],solana:['SOL','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],arc:['ARC','0x3600000000000000000000000000000000000000'],
} as const
const same=(a:string,b:string,solana:boolean)=>solana?a===b:a.toLowerCase()===b.toLowerCase()
export async function fetchCircleDisplayBalance(link:CircleLinkRecord,fetcher=fetch){
 const [chain,token]=circleBalanceTokens[link.chain],solana=link.chain==='solana',key=process.env.CIRCLE_API_KEY
 if(!key||key.startsWith('TEST_')||link.circleBlockchain!==chain)throw Error('Circle balance configuration unavailable.')
 const signal=AbortSignal.timeout(6000)
 const request=async(path:string)=>{const r=await fetcher('https://api.circle.com'+path,{headers:{Authorization:'Bearer '+key},signal,redirect:'error'});if(!r.ok)throw Error('Circle balance unavailable.');const body=await r.json();if(!body.data)throw Error('Invalid Circle response.');return {data:body.data,next:/;\s*rel="next"/.test(r.headers.get('link')||'')}}
 const path='/v1/w3s/wallets/'+encodeURIComponent(link.circleWalletId)
 // The authenticated handler supplies the owner link; verify the provider wallet binding too.
 const {data:{wallet}}=await request(path)
 if(!wallet||wallet.id!==link.circleWalletId||wallet.blockchain!==chain||typeof wallet.address!=='string'||!same(wallet.address,link.circleWalletAddress,solana))throw Error('Circle wallet binding changed.')
 const {data,next}=await request(path+'/balances?'+new URLSearchParams({includeAll:'true',tokenAddress:token,pageSize:'50'}))
 if(next||!Array.isArray(data.tokenBalances)||data.tokenBalances.length>1)throw Error('Incomplete Circle balance.')
 // A complete, explicitly token-filtered response may establish zero. An error never does.
 if(!data.tokenBalances.length)return 0
 const row=data.tokenBalances[0],t=row.token
 if(!t||t.blockchain!==chain||typeof t.tokenAddress!=='string'||!same(t.tokenAddress,token,solana)||t.decimals!==6||t.isNative===true||typeof row.amount!=='string'||!/^\d{1,78}(?:\.\d{1,6})?$/.test(row.amount))throw Error('Invalid Circle USDC balance.')
 const balance=Number(row.amount);if(!Number.isFinite(balance)||balance<0)throw Error('Invalid Circle amount.');return balance
}
export function createCircleDisplayBalanceReader(provider=fetchCircleDisplayBalance,now=Date.now){
 type Result={balance:number;observedAt:number;source:'circle'|'rpc'}
 const entries=new Map<string,{result?:Result;pending?:Promise<Result>;retryAt?:number}>()
 return async(link:CircleLinkRecord,fallback:()=>Promise<number>,fresh=false):Promise<Result>=>{
  const key=JSON.stringify([link.privyUserId,link.chain,link.circleWalletId,link.circleWalletAddress,link.updatedAt]);let entry=entries.get(key)
  if(!entry){entry={};entries.set(key,entry)}
  if(entry.pending){await entry.pending;if(!fresh)return entry.result!}
  if(!fresh&&entry.result&&now()-entry.result.observedAt<30000)return entry.result
  const current=entry
  current.pending=(async()=>{if(!fresh&&now()>=(current.retryAt||0)){try{return {balance:await provider(link),observedAt:now(),source:'circle' as const}}catch{current.retryAt=now()+60000}}return {balance:await fallback(),observedAt:now(),source:'rpc' as const}})()
  try{current.result=await current.pending;return current.result}finally{current.pending=undefined;if(entries.size>500)for(const[k,v]of entries)if(k!==key&&!v.pending){entries.delete(k);break}}
 }
}
export const readCircleDisplayBalance=createCircleDisplayBalanceReader()
