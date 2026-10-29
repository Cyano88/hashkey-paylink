import {createHmac} from 'node:crypto'
import {okxCredentials} from './pocket/xstocks-swap-provider.js'
export type NativeFeeAsset = 'ethereum' | 'polygon' | 'solana'
const native = {
 ethereum:{chainIndex:'1',tokenContractAddress:'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'},
 polygon:{chainIndex:'137',tokenContractAddress:'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'},
 solana:{chainIndex:'501',tokenContractAddress:'11111111111111111111111111111111'},
} as const
const stable = {USDC:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',USDT:'0xdac17f958d2ee523a2206206994597c13d831ec7'} as const
const fail=():never=>{throw Error('Fresh network fee pricing is unavailable.')}
/** Independent fresh prices only; never treats a stablecoin as a fixed dollar. */
export async function readFallbackNetworkPrices(asset:NativeFeeAsset,stablecoin:'USDC'|'USDT',fetcher=fetch,now=Date.now) {
 const credentials=okxCredentials()
 if(!credentials.key||!credentials.secret||!credentials.passphrase)return fail()
 const requested=[native[asset],{chainIndex:'1',tokenContractAddress:stable[stablecoin]}]
 if(requested.some(row=>!row))return fail()
 const path='/api/v6/dex/market/price',body=JSON.stringify(requested),timestamp=new Date(now()).toISOString()
 const signature=createHmac('sha256',credentials.secret).update(timestamp+'POST'+path+body).digest('base64')
 const response=await fetcher('https://web3.okx.com'+path,{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json','OK-ACCESS-KEY':credentials.key,'OK-ACCESS-SIGN':signature,'OK-ACCESS-PASSPHRASE':credentials.passphrase,'OK-ACCESS-TIMESTAMP':timestamp}})
 const result=await response.json()
 if(!response.ok||result.code!=='0'||!Array.isArray(result.data))return fail()
 const values=requested.map(request=>{
  const rows=result.data.filter((row:any)=>String(row.chainIndex)===request.chainIndex&&typeof row.tokenContractAddress==='string'&&(request.chainIndex==='501'?row.tokenContractAddress===request.tokenContractAddress:row.tokenContractAddress.toLowerCase()===request.tokenContractAddress))
  if(rows.length!==1)return fail()
  const usd=Number(rows[0].price),at=Number(rows[0].time)
  if(!Number.isFinite(usd)||usd<=0||!Number.isSafeInteger(at)||at>now()+5000||now()-at>=180000)return fail()
  return {usd,at}
 })
 return {native:values[0].usd,stable:values[1].usd,oldestPriceAt:Math.min(...values.map(v=>v.at))}
}
