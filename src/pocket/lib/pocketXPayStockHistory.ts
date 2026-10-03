import {formatUnits,parseUnits} from 'viem'
import {stockAssets} from './pocketXStocksWallet'
import type {XPayHistoryEntry} from './pocketUnifiedXPay'

const assets=new Map(stockAssets.map(asset=>[asset.symbol,asset]))
export function xpayStockHistory(payments:XPayHistoryEntry[]){
 return payments.filter(p=>p.rail==='xstocks'&&p.network==='xlayer'&&assets.has(p.asset))
}
export function xpayStockTotals(payments:XPayHistoryEntry[]){
 const totals=new Map<string,bigint>(),seen=new Set<string>()
 for(const p of xpayStockHistory(payments)){
  if(p.state!=='successful'||seen.has(p.id))continue
  seen.add(p.id)
  // Saved receipt amounts are decimal quantities; sum exactly without assuming
  // token decimals or rounding through floating-point numbers.
  if(!/^\d+(?:\.\d+)?$/.test(p.amount)||(p.amount.split('.')[1]?.length||0)>36)continue
  const units=parseUnits(p.amount,36)
  totals.set(p.asset,(totals.get(p.asset)||0n)+units)
 }
 return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([symbol,units])=>({symbol,amount:formatUnits(units,36)}))
}
