import type { ArcPickerToken } from '../components/PocketArcTokenPicker'
import { stockAssets, stockUsdc, stockGasAsset, stockQuantity, type StockBalanceSnapshot } from './pocketXStocksWallet'
import ranking from './pocketXStocksRanking.json'
export function stockPickerTokens(snapshot?: StockBalanceSnapshot | null): ArcPickerToken[] {
 const rank=(symbol:string)=>symbol==='USDC'?-2:symbol==='OKB'?-1:ranking.symbols.includes(symbol)?ranking.symbols.indexOf(symbol):1000
 return [stockUsdc,stockGasAsset,...stockAssets].sort((a,b)=>rank(a.symbol)-rank(b.symbol)).map(asset=>{
 const held=snapshot?.holdings.find(h=>h.asset.address.toLowerCase()===asset.address.toLowerCase())
 const balance=asset.address==='native'?snapshot?stockQuantity(snapshot.gas,18):null:asset.symbol==='USDC'?snapshot?.cash!=null?stockQuantity(snapshot.cash,6):null:held?stockQuantity(held.units,held.decimals):snapshot?.complete?'0':null
 return {...asset,decimals:asset.symbol==='USDC'?6:held?.decimals??18,balance,balanceStatus:balance===null?'unavailable':'available',logoURI:asset.icon||(asset.symbol==='USDC'?'/brand/usdc-circle-logo.png':undefined)}
 })
}
