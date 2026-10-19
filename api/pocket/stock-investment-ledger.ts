import type {StockNotice,StockNoticeStore} from './xstocks-notifications-store.js'
import {stockAssets} from '../../src/pocket/lib/pocketXStocksWallet.js'

const tokens=new Set(stockAssets.map(a=>a.address.toLowerCase()))
const symbols=new Set(stockAssets.map(a=>a.symbol))
export const investmentScope=(owner:string,address:string)=>owner+':'+address.toLowerCase()

// Investment records outlive activity and push retention. Keep wallet scopes
// separate: linking a replacement wallet must never inherit another's basis.
export function archiveStockInvestments(s:StockNoticeStore){
 s.investments ||= {}
 for(const n of Object.values(s.notices)){
  const wallet=s.wallets[n.owner]
  if(!wallet||n.at<wallet.since)continue
  if(!(n.transfer&&tokens.has(n.transfer.token.toLowerCase()))&&!(n.trade&&(symbols.has(n.trade.input.symbol)||symbols.has(n.trade.output.symbol))))continue
  const scope=investmentScope(n.owner,wallet.address)
  ;(s.investments[scope] ||= {})[n.id]=structuredClone(n)
 }
}
export function stockInvestmentNotices(s:StockNoticeStore,owner:string):StockNotice[]{
 const wallet=s.wallets[owner];if(!wallet)return []
 const merged={...s.investments?.[investmentScope(owner,wallet.address)]}
 for(const n of Object.values(s.notices))if(n.owner===owner&&n.at>=wallet.since)merged[n.id]=n
 return Object.values(merged)
}
