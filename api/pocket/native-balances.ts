import {circleLinkKey,type CircleLinkRecord} from '../privy-circle-link.js'
import {pocketNativeOnNetwork,type PocketNativeBalance} from '../../src/pocket/lib/pocketNativeAssets.js'

const networks=['ethereum','base','arbitrum','polygon','solana'] as const
const chains={ethereum:'ETH',base:'BASE',arbitrum:'ARB',polygon:'MATIC',solana:'SOL'} as const
const priceIds={ETH:'ethereum',POL:'polygon-ecosystem-token',SOL:'solana'} as const

/** Provider display reads only. Never feeds a payment quote or changes RPC use. */
export async function fetchCircleNativeBalance(link:CircleLinkRecord,fetcher=fetch) {
 const asset=pocketNativeOnNetwork(link.chain),chain=chains[link.chain as keyof typeof chains]
 const key=process.env.CIRCLE_API_KEY
 if(!asset||!chain||!key||key.startsWith('TEST_')||link.circleBlockchain!==chain)throw Error('Native balance unavailable.')
 const signal=AbortSignal.timeout(8000)
 const request=async(path:string)=>{const r=await fetcher('https://api.circle.com'+path,{headers:{Authorization:'Bearer '+key},signal,redirect:'error'});if(!r.ok)throw Error('Native balance unavailable.');return {body:await r.json(),next:/;\s*rel="next"/.test(r.headers.get('link')||'')}}
 const path='/v1/w3s/wallets/'+encodeURIComponent(link.circleWalletId)
 const {body:{data:{wallet}={}}}=await request(path)
 const same=(a:string,b:string)=>link.chain==='solana'?a===b:a.toLowerCase()===b.toLowerCase()
 if(!wallet||wallet.id!==link.circleWalletId||wallet.blockchain!==chain||typeof wallet.address!=='string'||!same(wallet.address,link.circleWalletAddress))throw Error('Wallet binding changed.')
 let cursor='',found:number|undefined
 const seen=new Set<string>()
 for(let page=0;page<10;page++){
  const {body,next}=await request(path+'/balances?'+new URLSearchParams({includeAll:'true',pageSize:'50',...(cursor?{pageAfter:cursor}:{})}))
  const rows=body?.data?.tokenBalances
  if(!Array.isArray(rows))throw Error('Incomplete native balance.')
  for(const row of rows){
   if(row?.token?.isNative!==true)continue
   const token=row.token
   if(found!==undefined||token.blockchain!==chain||token.decimals!==asset.decimals||!([asset.symbol,...(asset.symbol==='POL'?['MATIC']:[])] as string[]).includes(token.symbol)||typeof row.amount!=='string'||!new RegExp('^\\d{1,78}(?:\\.\\d{1,'+asset.decimals+'})?$').test(row.amount))throw Error('Invalid native balance.')
   found=Number(row.amount)
   if(!Number.isFinite(found)||found<0)throw Error('Invalid native amount.')
  }
  if(!next)return found??0
  const last=rows.at(-1)?.token?.id
  if(typeof last!=='string'||seen.has(last))throw Error('Incomplete native balance.')
  seen.add(last);cursor=last
 }
 throw Error('Incomplete native balance.')
}

export function createNativeBalanceReader(read=fetchCircleNativeBalance,fetcher=fetch,now=Date.now) {
 const cache=new Map<string,{at:number;quantity:number}>(),pending=new Map<string,Promise<number>>()
 let prices:{at:number;values:Partial<Record<string,number>>}|undefined,pricePending:Promise<Partial<Record<string,number>>>|undefined
 const readPrices=async()=>{
  if(prices&&now()-prices.at<60000)return prices.values
  if(pricePending)return pricePending
  pricePending=(async()=>{try{
   const r=await fetcher('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,polygon-ecosystem-token,solana&vs_currencies=usd&include_last_updated_at=true',{signal:AbortSignal.timeout(5000)})
   if(!r.ok)throw Error('Price unavailable')
   const b=await r.json(),values:Partial<Record<string,number>>={}
   for(const [symbol,id] of Object.entries(priceIds)){const p=b[id];if(Number.isFinite(p?.usd)&&p.usd>0&&Number.isFinite(p.last_updated_at)&&now()-p.last_updated_at*1000<180000&&p.last_updated_at*1000<=now()+30000)values[symbol]=p.usd}
   prices={at:now(),values};return values
  }catch{return {}}})().finally(()=>{pricePending=undefined})
  return pricePending
 }
 return async(userId:string,readLink:(key:string)=>Promise<CircleLinkRecord|null>):Promise<PocketNativeBalance[]>=>{
  const market=readPrices()
  return Promise.all(networks.map(async network=>{
   const asset=pocketNativeOnNetwork(network)!,base={network,symbol:asset.symbol,observedAt:now()};let address:string|null=null
   try{
    const link=await readLink(circleLinkKey(userId,network,'payment'))
    if(!link)return {...base,address:null,quantity:0,valueUsd:0,status:'ok' as const}
    if(link.privyUserId!==userId||link.chain!==network||(link.purpose??'payment')!=='payment')throw Error('Wallet owner changed')
    address=link.circleWalletAddress
    const key=JSON.stringify([userId,network,link.circleWalletId,address,link.updatedAt]),old=cache.get(key)
    let quantity:number
    if(old&&now()-old.at<30000)quantity=old.quantity
    else{
     let work=pending.get(key)
     if(!work){work=read(link).then(quantity=>{if(!Number.isFinite(quantity)||quantity<0)throw Error('Invalid native balance');cache.set(key,{at:now(),quantity});if(cache.size>500)cache.delete(cache.keys().next().value!);return quantity}).finally(()=>pending.delete(key));pending.set(key,work)}
     quantity=await work
    }
    const price=(await market)[asset.symbol]
    return {...base,address,quantity,valueUsd:quantity===0?0:price?quantity*price:null,status:'ok' as const}
   }catch{return {...base,address,quantity:null,valueUsd:null,status:'error' as const}}
  }))
 }
}
export const readPocketNativeBalances=createNativeBalanceReader()
