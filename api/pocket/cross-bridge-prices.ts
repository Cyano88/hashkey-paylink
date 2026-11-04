import {createHmac} from 'node:crypto'
import {okxCredentials} from './xstocks-swap-provider.js'
import {crossBridgeAsset,type CrossBridgeNetwork} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {RELAY_BSC_CHAINS} from './bsc-bridge-provider.js'
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
export async function readCrossBridgePrices(network:CrossBridgeNetwork,asset:string,options:{fetcher?:typeof fetch;now?:()=>number;credentials?:ReturnType<typeof okxCredentials>}={}):Promise<{gasPrice:CrossBridgePrice;assetPrice:CrossBridgePrice}>{
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
 if(!response.ok)return fail()
 const result=await response.json()
 if(result?.code!=='0'||!Array.isArray(result.data)||result.data.length!==addresses.length)return fail()
 const same=(a:unknown,b:string)=>typeof a==='string'&&(network==='solana'?a===b:a.toLowerCase()===b.toLowerCase())
 const read=(wanted:string,up:boolean):CrossBridgePrice=>{
  const rows=result.data.filter((row:any)=>String(row?.chainIndex)===chainIndex&&same(row?.tokenContractAddress,wanted))
  if(rows.length!==1)return fail()
  const row=rows[0]
  if(typeof row.time!=='string'&&typeof row.time!=='number'||!/^\d{13}$/.test(String(row.time)))return fail()
  const observedAt=Number(row.time)
  if(!Number.isSafeInteger(observedAt)||observedAt>now()+5000||observedAt+30000<=now())return fail()
  return {scaled8:scaled(row.price,up),observedAt}
 }
 return {gasPrice:read(native,true),assetPrice:read(address,false)}
}
