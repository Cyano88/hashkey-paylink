import { stockAssets, type StockBalanceSnapshot } from './pocketXStocksWallet'
const prefix = 'pocket:xstocks:display:v1:'
// Display only. Never hydrate the executable balance cache from device storage.
export function readStockDisplayCache(owner: string): StockBalanceSnapshot | undefined {
 if (!owner) return
 try {
  const s=JSON.parse(localStorage.getItem(prefix+encodeURIComponent(owner)) || 'null')
  if (!s || s.complete !== true || !Array.isArray(s.holdings) || s.holdings.length > stockAssets.length || !Number.isSafeInteger(s.observedAt) || s.observedAt <= 0 || s.observedAt > Date.now()+5000 || !/^0x[0-9a-f]{64}$/i.test(s.blockHash)) return
  const integer=(v:unknown)=>{if(typeof v!=='string'||!/^\d{1,78}$/.test(v))throw Error('Invalid cached balance');return BigInt(v)}
  const seen=new Set<string>()
  return {...s,cash:s.cash==null?null:integer(s.cash),gas:integer(s.gas),blockNumber:integer(s.blockNumber),holdings:s.holdings.map((h:any)=>{
   const asset=stockAssets.find(a=>a.address.toLowerCase()===h.asset?.address?.toLowerCase())
   if(!asset||seen.has(asset.address)||!Number.isInteger(h.decimals)||h.decimals<0||h.decimals>36)throw Error('Invalid cached holding')
   seen.add(asset.address);return {asset,units:integer(h.units),decimals:h.decimals}
  })}
 } catch {return}
}
export function saveStockDisplayCache(owner:string,snapshot:StockBalanceSnapshot) {
 try {localStorage.setItem(prefix+encodeURIComponent(owner),JSON.stringify(snapshot,(_k,v)=>typeof v==='bigint'?v.toString():v))}catch {/* In-memory display remains available. */}
}
