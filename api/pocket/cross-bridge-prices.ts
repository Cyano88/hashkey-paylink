import {createHmac} from 'node:crypto'
import {okxCredentials} from './xstocks-swap-provider.js'
import {crossBridgeAsset,type CrossBridgeNetwork} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {RELAY_BSC_CHAINS} from './cross-bridge-chains.js'
import type {CrossBridgePrice} from './cross-bridge-reimbursement.js'
const fail=():never=>{throw Object.assign(Error('Fresh bridge fee pricing is unavailable.'),{status:503})}
/** Round gas upward and reimbursement-asset price downward. Never use floating
 * point conversion, stablecoin pegs, receipt time as price time or stale fallback. */
function scaled(value:unknown,up:boolean){
 if(typeof value!=='string'||! /^(0|[1-9]\d{0,11})(?:\.\d{1,64})?$/.test(value))return fail()
 const [whole,fraction='']=value.split('.'),tail=fraction.slice(8)
 const result=BigInt(whole)*100000000n+BigInt((fraction.slice(0,8)).padEnd(8,'0'))+(up&&/[1-9]/.test(tail)?1n:0n)
 if(result<=0n||result>10n**20n)return fail()
 return result
}
type PriceOptions={fetcher?:typeof fetch;now?:()=>number;credentials?:ReturnType<typeof okxCredentials>}
type Prices={gasPrice:CrossBridgePrice;assetPrice:CrossBridgePrice}
const pending=new Map<string,Promise<Prices>>()
const recent=new Map<string,{at:number;prices:Prices}>()
export async function readCrossBridgePrices(network:CrossBridgeNetwork,asset:string,options:PriceOptions={}):Promise<Prices>{
 if(options.fetcher||options.credentials)return fetchPrices(network,asset,options)
 const key=JSON.stringify([network,asset]),now=(options.now??Date.now)(),entry=recent.get(key)
 if(entry&&now>=entry.at&&now-entry.at<2000&&Math.min(entry.prices.gasPrice.observedAt,entry.prices.assetPrice.observedAt)>now-5000)return entry.prices
 const active=pending.get(key)
 if(active)return active
 const request=fetchPrices(network,asset,options).then(prices=>{
  recent.set(key,{at:(options.now??Date.now)(),prices})
  return prices
 }).finally(()=>pending.delete(key))
 pending.set(key,request)
 return request
}
async function fetchPrices(network:CrossBridgeNetwork,asset:string,options:PriceOptions):Promise<Prices>{
 try{return await fetchOkxPrices(network,asset,options)}catch(error){
  if(network!=='celo'||!['CELO','USDC','USDT'].includes(asset))throw error
 }
 try{return await readCeloMarketPrices(asset,options)}catch{
  try{return await readCeloBookPrices(asset,options)}catch{return fail()}
 }
}
async function readCeloBookPrices(asset:string,options:PriceOptions):Promise<Prices>{
 const book=async(symbol:string)=>{
  const response=await (options.fetcher??fetch)('https://api.kraken.com/0/public/Depth?pair='+symbol+'USD&count=1',{redirect:'error',signal:AbortSignal.timeout(2500)})
  if(!response.ok)return fail()
  const data=await response.json(),key=symbol==='USDT'?'USDTZUSD':symbol+'USD'
  if(!Array.isArray(data.error)||data.error.length||!data.result?.[key])return fail()
  return data.result[key]
 }
 const native=book('CELO'),[gas,token]=await Promise.all([native,asset==='CELO'?native:book(asset)])
 const read=(level:unknown,up:boolean)=>{
  if(!Array.isArray(level)||!Number.isSafeInteger(level[2]))return fail()
  const observedAt=level[2]*1000,now=(options.now??Date.now)()
  if(observedAt<=now-30000||observedAt>now+5000)return fail()
  return {scaled8:scaled(level[0],up),observedAt}
 }
 return {gasPrice:read(gas.asks?.[0],true),assetPrice:read(token.bids?.[0],false)}
}
async function readCeloMarketPrices(asset:string,options:PriceOptions):Promise<Prices>{
 const id=asset==='USDC'?'usd-coin':asset==='USDT'?'tether':'celo'
 const ids=id==='celo'?id:'celo,'+id
 const response=await (options.fetcher??fetch)('https://api.coingecko.com/api/v3/simple/price?ids='+ids+'&vs_currencies=usd&include_last_updated_at=true&precision=full',{redirect:'error',signal:AbortSignal.timeout(3500)})
 if(!response.ok)return fail()
 const rows=await response.json(),now=(options.now??Date.now)()
 function read(id:string,up:boolean):CrossBridgePrice{
  const row=rows?.[id],observedAt=row?.last_updated_at*1000
  if(!Number.isSafeInteger(row?.last_updated_at)||observedAt<=now-30000||observedAt>now+5000||typeof row.usd!=='number')return fail()
  return {scaled8:scaled(String(row.usd),up),observedAt}
 }
 return {gasPrice:read('celo',true),assetPrice:read(id,false)}
}
async function fetchOkxPrices(network:CrossBridgeNetwork,asset:string,options:PriceOptions):Promise<Prices>{
 // Circle-issued Arc USDC/EURC share the same denomination as their Base assets.
 // Use fresh, timestamped market prices, never a fixed dollar peg.
 const pricingNetwork=network==='arc'?'base':network
 const token=crossBridgeAsset(pricingNetwork,asset),chainIndex=pricingNetwork==='solana'?'501':String(RELAY_BSC_CHAINS[pricingNetwork].id)
 const native=network==='arc'?crossBridgeAsset('base','USDC').address:network==='solana'?'11111111111111111111111111111111':'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
 const address=token.native?native:token.address,addresses=[...new Set([native,address])]
 const now=options.now??Date.now,credentials=options.credentials??okxCredentials(),fetcher=options.fetcher??fetch
 if(!credentials.key||!credentials.secret||!credentials.passphrase)return fail()
 const path='/api/v6/dex/market/price',body=JSON.stringify(addresses.map(tokenContractAddress=>({chainIndex,tokenContractAddress}))),timestamp=new Date(now()).toISOString()
 const signature=createHmac('sha256',credentials.secret).update(timestamp+'POST'+path+body).digest('base64')
 const response=await fetcher('https://web3.okx.com'+path,{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json','OK-ACCESS-KEY':credentials.key,'OK-ACCESS-SIGN':signature,'OK-ACCESS-PASSPHRASE':credentials.passphrase,'OK-ACCESS-TIMESTAMP':timestamp}})
 if(!response.ok){if(process.env.NODE_ENV==='production')console.warn('bridge_fee_price_http',{network,asset,status:response.status});return fail()}
 const result=await response.json()
 if(result?.code!=='0'||!Array.isArray(result.data)||result.data.length!==addresses.length)return fail()
 const same=(a:unknown,b:string)=>typeof a==='string'&&(network==='solana'?a===b:a.toLowerCase()===b.toLowerCase())
 const read=(wanted:string,up:boolean):CrossBridgePrice=>{
  const rows=result.data.filter((row:any)=>String(row?.chainIndex)===chainIndex&&same(row?.tokenContractAddress,wanted))
  if(rows.length!==1)return fail()
  const row=rows[0]
  if(typeof row.time!=='string'&&typeof row.time!=='number'||!/^\d{13}$/.test(String(row.time)))return fail()
  const observedAt=Number(row.time)
  if(!Number.isSafeInteger(observedAt)||observedAt>now()+5000||observedAt+30000<=now()){if(process.env.NODE_ENV==='production')console.warn('bridge_fee_price_time',{network,asset,ageMs:now()-observedAt});return fail()}
  return {scaled8:scaled(row.price,up),observedAt}
 }
 return {gasPrice:read(native,true),assetPrice:read(address,false)}
}
