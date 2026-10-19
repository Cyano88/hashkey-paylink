import {createHmac} from 'node:crypto'
import {formatUnits,parseUnits,type Address} from 'viem'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {okxCredentials} from './xstocks-swap-provider.js'
import {stockNoticeClient,type StockNoticeStore} from './xstocks-notifications-store.js'
import {stockAssets,stockGasPriceAddress} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {buildStockBasis,type StockBasis} from '../../src/pocket/lib/pocketStockPnl.js'
type CostCache={costs:Record<string,string>;retry:Record<string,number>}
const key='pocket:stock-cost-basis:v2',jobs=new Map<string,Promise<void>>()
// Historical USD conversion is indicative, never today's OKB price applied to
// an old purchase. Persist completed results; no price/RPC work on idle refresh.
export function historicalClose(rows:unknown,at:number,columns=8){
 if(!Array.isArray(rows))throw Error('Missing historical price')
 const row=rows.find(r=>Array.isArray(r)&&r.length===columns&&r[columns-1]==='1'&&Number(r[0])<=at&&at<Number(r[0])+60000)
 const price=Number(row?.[4]);if(!Number.isFinite(price)||price<=0)throw Error('Missing historical price');return price
}
async function okbAt(at:number){
 try{
 const c=okxCredentials();if(!c.key||!c.secret||!c.passphrase)throw Error('Price unavailable')
 const end=Math.floor(at/60000)*60000+60000
 const path='/api/v6/dex/market/historical-candles?'+new URLSearchParams({chainIndex:'196',tokenContractAddress:stockGasPriceAddress,bar:'1m',after:String(end),limit:'2'})
 const timestamp=new Date().toISOString(),sign=createHmac('sha256',c.secret).update(timestamp+'GET'+path).digest('base64')
 const r=await fetch('https://web3.okx.com'+path,{headers:{'OK-ACCESS-KEY':c.key,'OK-ACCESS-SIGN':sign,'OK-ACCESS-PASSPHRASE':c.passphrase,'OK-ACCESS-TIMESTAMP':timestamp},signal:AbortSignal.timeout(10000),redirect:'error'}),data=await r.json() as any
 if(!r.ok||String(data.code)!=='0')throw Error('Historical price unavailable')
 return historicalClose(data.data,at)
 }catch{
  // Native-token DEX candles can be sparse. The liquid OKB/USDT spot market
  // provides a contemporaneous historical conversion; USDT is valued at $1.
  const end=Math.floor(at/60000)*60000+60000
  const r=await fetch('https://www.okx.com/api/v5/market/history-candles?'+new URLSearchParams({instId:'OKB-USDT',bar:'1m',after:String(end),limit:'2'}),{signal:AbortSignal.timeout(10000),redirect:'error'})
  const data=await r.json() as any
  if(!r.ok||String(data.code)!=='0')throw Error('Historical price unavailable')
  return historicalClose(data.data,at,9)
 }
}
export async function purchaseCost(n:StockNoticeStore['notices'][string],wallet:string,client=stockNoticeClient,price=okbAt){
 const t=n.trade;if(!t||!n.hash||!['USDC','USDT','OKB'].includes(t.input.symbol))throw Error('Unknown purchase cost')
 const receipt=await client.getTransactionReceipt({hash:n.hash as Address})
 if(receipt.status!=='success')throw Error('Unconfirmed purchase')
 const block=await client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)throw Error('Purchase block changed')
 const ownGas=receipt.from.toLowerCase()===wallet.toLowerCase()
 if(!ownGas&&t.feeAmount===undefined)throw Error('Unknown reimbursement')
 const paid=parseUnits(t.input.amount,18)+parseUnits(t.feeAmount||'0',18)
 const gas=ownGas?receipt.gasUsed*receipt.effectiveGasPrice:0n
 const rate=t.input.symbol==='OKB'||gas>0n?await price(Number(block.timestamp)*1000):1
 // Service fee is already included in input.amount, reimbursement is additional.
 if(!Number.isFinite(rate)||rate<=0)throw Error('Invalid historical price')
 const scale=10n**18n,rateUnits=parseUnits(rate.toFixed(18),18)
 const cost=(t.input.symbol==='OKB'?paid*rateUnits/scale:paid)+gas*rateUnits/scale
 if(cost<=0n)throw Error('Invalid purchase cost')
 return formatUnits(cost,18)
}
export async function readStockBasis(owner:string,s:StockNoticeStore):Promise<StockBasis|null>{
 const wallet=s.wallets[owner];if(!wallet)return null
 const notices=Object.values(s.notices).filter(n=>n.owner===owner&&n.at>=wallet.since)
 const cached=await readDurableJson<CostCache>(key)||{costs:{},retry:{}}
 const purchases=notices.filter(n=>n.trade&&stockAssets.some(a=>a.symbol===n.trade!.output.symbol)&&n.hash)
 const eligible=purchases.filter(n=>!cached.costs[n.hash!.toLowerCase()]&&(cached.retry[n.hash!.toLowerCase()]||0)<Date.now()).slice(0,4)
 if(eligible.length&&!jobs.has(owner)&&jobs.size<4){
  const job=(async()=>{for(const n of eligible){const hash=n.hash!.toLowerCase();let cost:string|undefined;try{cost=await purchaseCost(n,wallet.address)}catch{/* Unknown cost stays unknown. */}
   await mutateDurableJson<CostCache>(key,old=>{const next=old||{costs:{},retry:{}};if(cost){next.costs[hash]=cost;delete next.retry[hash]}else next.retry[hash]=Date.now()+300000;return next})
  }})().catch(()=>undefined).finally(()=>jobs.delete(owner));jobs.set(owner,job)
 }
 return {wallet:wallet.address,positions:buildStockBasis(notices,stockAssets,cached.costs)}
}
