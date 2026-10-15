import type {PocketActivityRow} from '../models/pocketActivity'
import {stockAssets} from './pocketXStocksWallet'
import {pocketEarnNoticeRow} from './pocketEarnNotice'
import type {StockInbox} from '../api/pocketStockNotificationsClient'
export function pocketStockNoticeActivity(notices:StockInbox['notices'],address:string):PocketActivityRow[]{
 const tradeHashes=new Set(notices.filter(n=>n.trade&&n.hash).map(n=>n.hash!.toLowerCase()))
 return notices.flatMap<PocketActivityRow>(n=>{
  const earn=pocketEarnNoticeRow(n);if(earn)return [earn]
  if(!n.hash)return []
  if(n.trade){const t=n.trade,asset=t.action==='sell'?t.input:t.output;return [{eventId:n.id,txHash:n.hash,chain:'xlayer',payer:address,recipient:address,amount:asset.amount,assetSymbol:asset.symbol,memo:n.body,ts:n.at,source:'stock-'+t.action,direction:t.action==='sell'?'out':'in',contextLabel:asset.symbol,activityLabel:n.title,paycrestStatus:'confirmed'}]}
  const t=n.transfer
  if(!t||tradeHashes.has(n.hash.toLowerCase())||!stockAssets.some(a=>a.address.toLowerCase()===t.token.toLowerCase()))return []
  return [{eventId:n.id,txHash:n.hash,chain:'xlayer',payer:t.from,recipient:t.to,amount:t.amount,assetSymbol:t.symbol,memo:n.body,ts:n.at,source:'wallet-transfer',direction:t.direction,contextLabel:t.symbol,paycrestStatus:'confirmed'}]
 })
}
