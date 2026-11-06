import type {Request, Response} from 'express'
import {createHmac} from 'node:crypto'
import {okxCredentials} from './xstocks-swap-provider.js'
import catalogue from '../../src/pocket/lib/pocketXStocksCatalog.json' with {type:'json'}

const DAY=86_400_000
export const stockChartRanges={
 '1D':{bar:'5m',step:300_000,days:1},
 '5D':{bar:'30m',step:1_800_000,days:5},
 '1M':{bar:'4H',step:14_400_000,days:30},
 '6M':{bar:'1Dutc',step:DAY,days:180},
 '1Y':{bar:'1Dutc',step:DAY,days:365},
 'ALL':{bar:'1Wutc',step:7*DAY,days:0},
} as const
type Range=keyof typeof stockChartRanges
export type StockHistory={address:string;range:Range;points:{time:number;usd:number}[];fetchedAt:number;complete:boolean;source:'OKX'}
const allowed=new Set(catalogue.assets.map(a=>a.address.toLowerCase()))
const cache=new Map<string,StockHistory>(), pending=new Map<string,Promise<StockHistory>>()
const attempts=new Map<string,number>()
let nextSlot=0,providerBlockedUntil=0

// The provider includes a current, unfinished candle despite the historical endpoint name.
// Plot its observed close at fetch time; never claim future data or interpolate missing bars.
export function parseStockCandles(rows:unknown,step:number,now:number){
 if(!Array.isArray(rows))throw Error('Invalid chart data')
 const result=new Map<number,{time:number;usd:number;openTime:number}>()
 for(const row of rows){
  if(!Array.isArray(row)||row.length<8)continue
  const [ts,o,h,l,c]=row.map(Number)
  if(!Number.isSafeInteger(ts)||ts<=0||ts>now||![o,h,l,c].every(n=>Number.isFinite(n)&&n>0)||l>Math.min(o,c)||h<Math.max(o,c)||!['0','1'].includes(String(row[7])))continue
  result.set(ts,{time:Math.min(ts+step,now),usd:c,openTime:ts})
 }
 return [...result.values()].sort((a,b)=>a.time-b.time)
}

export async function readStockHistory(address:string,range:Range,fetcher:typeof fetch=fetch,now=Date.now()):Promise<StockHistory>{
 address=address.toLowerCase()
 if(!allowed.has(address)||!Object.hasOwn(stockChartRanges,range))throw Error('Choose a supported stock and range')
 const key=address+':'+range,old=cache.get(key),ttl=range==='1D'?60_000:300_000
 if(old&&now-old.fetchedAt<ttl)return old
 const running=pending.get(key);if(running)return running
 if(now<providerBlockedUntil||now-(attempts.get(key)||0)<30_000||pending.size>=12){if(old)return old;throw Error('Chart is temporarily unavailable')}
 attempts.set(key,now)
 const task=(async()=>{
  const config=stockChartRanges[range],cutoff=config.days?now-config.days*DAY:0
  const collected:ReturnType<typeof parseStockCandles>=[]
  let after='',complete=false
  for(let page=0;page<4;page++){
   const slot=Math.max(Date.now(),nextSlot);nextSlot=slot+600
   if(slot>Date.now())await new Promise(resolve=>setTimeout(resolve,slot-Date.now()))
   if(Date.now()<providerBlockedUntil)throw Error('Chart is temporarily unavailable')
   const credentials=okxCredentials();if(!credentials.key||!credentials.secret||!credentials.passphrase)throw Error('Chart is temporarily unavailable')
   const query=new URLSearchParams({chainIndex:'196',tokenContractAddress:address,bar:config.bar,limit:'299',...(after?{after}:{})})
   const path='/api/v6/dex/market/historical-candles?'+query,timestamp=new Date().toISOString()
   const signature=createHmac('sha256',credentials.secret).update(timestamp+'GET'+path).digest('base64')
   const response=await fetcher('https://web3.okx.com'+path,{headers:{'OK-ACCESS-KEY':credentials.key,'OK-ACCESS-SIGN':signature,'OK-ACCESS-PASSPHRASE':credentials.passphrase,'OK-ACCESS-TIMESTAMP':timestamp},signal:AbortSignal.timeout(10_000),redirect:'error'})
   const body=await response.json() as {code?:string;data?:unknown}
   if(response.status===429||String(body.code)==='50011')providerBlockedUntil=Date.now()+30_000
   if(!response.ok||String(body.code)!=='0'||!Array.isArray(body.data))throw Error('Chart is temporarily unavailable')
   const batch=parseStockCandles(body.data,config.step,now)
   collected.push(...batch)
   if(body.data.length<299){complete=true;break}
   const oldest=batch[0]?.openTime
   if(!oldest||after&&oldest>=Number(after))break
   if(cutoff&&oldest<=cutoff){complete=true;break}
   after=String(oldest)
  }
  const unique=new Map(collected.map(p=>[p.time,p]))
  const points=[...unique.values()].filter(p=>p.time>=cutoff).sort((a,b)=>a.time-b.time).map(({time,usd})=>({time,usd}))
  const result:StockHistory={address,range,points,fetchedAt:now,complete,source:'OKX'}
  cache.delete(key);cache.set(key,result)
  if(cache.size>600)cache.delete(cache.keys().next().value!)
  if(attempts.size>600)attempts.delete(attempts.keys().next().value!)
  return result
 })().catch(error=>{if(old)return old;throw error}).finally(()=>pending.delete(key))
 pending.set(key,task);return task
}

export default async function handler(req:Request,res:Response){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed.'})
 const {address,range}=req.query
 if(typeof address!=='string'||!allowed.has(address.toLowerCase())||typeof range!=='string'||!Object.hasOwn(stockChartRanges,range))return res.status(400).json({ok:false,error:'Choose a supported stock and range.'})
 try{return res.json({ok:true,history:await readStockHistory(address,range as Range)})}
 catch{return res.status(503).json({ok:false,error:'Chart is temporarily unavailable.'})}
}
