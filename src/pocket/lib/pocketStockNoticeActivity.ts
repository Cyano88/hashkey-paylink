import type {PocketActivityRow} from '../models/pocketActivity'
import {stockUsdc,stockUsdt,stockAssets} from './pocketXStocksWallet'
import {pocketEarnNoticeRow} from './pocketEarnNotice'
import type {StockInbox} from '../api/pocketStockNotificationsClient'
export function pocketStockNoticeActivity(notices:StockInbox['notices'],address:string,requests:StockInbox['requests']=[]):PocketActivityRow[]{
 const paidRequests=requests.filter(r=>r.status==='paid'&&/^0x[0-9a-f]{64}$/i.test(r.txHash||''))
 const requestHashes=new Set(paidRequests.map(r=>r.txHash!.toLowerCase()))
 const requestRows=paidRequests.map<PocketActivityRow>(r=>({eventId:r.id,txHash:r.txHash!,chain:'xlayer',payer:r.direction==='incoming'?address:'ID:'+r.payerPocketId,recipient:r.address,amount:r.amount,assetSymbol:r.symbol,memo:'Request payment',ts:r.updatedAt||r.at,source:'request',direction:r.direction==='incoming'?'out':'in',paycrestStatus:'paid'}))
 const tradeHashes=new Set(notices.filter(n=>n.trade&&n.hash).map(n=>n.hash!.toLowerCase()))
 return [...requestRows,...notices.flatMap<PocketActivityRow>(n=>{
  if(n.hash&&requestHashes.has(n.hash.toLowerCase()))return []
  const earn=pocketEarnNoticeRow(n);if(earn)return [earn]
  if(!n.hash)return []
  if(n.trade?.action==='swap'&&[n.trade.input.symbol,n.trade.output.symbol].every(symbol=>['USDC','USDT','USDT0','OKB'].includes(symbol))){const t=n.trade;return [{eventId:n.id,txHash:n.hash,chain:'xlayer',payer:address,recipient:address,amount:t.input.amount,feeAmount:t.feeAmount,assetSymbol:t.input.symbol,memo:n.body,ts:n.at,source:'wallet-swap',settlementType:'wallet_swap',direction:'out',contextLabel:t.input.amount+' '+t.input.symbol+' to '+t.output.amount+' '+t.output.symbol,activityLabel:'Swap',paycrestStatus:'confirmed'}]}
  if(n.trade){const t=n.trade,asset=t.action==='sell'?t.input:t.output;return [{eventId:n.id,txHash:n.hash,chain:'xlayer',payer:address,recipient:address,amount:asset.amount,feeAmount:t.feeAmount,feeAsset:t.input.symbol,assetSymbol:asset.symbol,memo:n.body,ts:n.at,source:'stock-'+t.action,direction:t.action==='sell'?'out':'in',contextLabel:t.action==='swap'?t.input.amount+' '+t.input.symbol+' to '+t.output.amount+' '+t.output.symbol:asset.symbol,activityLabel:n.title,paycrestStatus:'confirmed'}]}
  const t=n.transfer
  if(!t||tradeHashes.has(n.hash.toLowerCase()))return []
  const stock=stockAssets.some(a=>a.address.toLowerCase()===t.token.toLowerCase())
  const cash=[stockUsdc.address.toLowerCase(),stockUsdt.address.toLowerCase()].includes(t.token.toLowerCase())
  const native=t.token==='native'&&t.symbol==='OKB'
  if(!stock&&!cash&&!native)return []
  return [{eventId:n.id,txHash:n.hash,chain:'xlayer',payer:t.from,recipient:t.to,amount:t.amount,assetSymbol:t.symbol,memo:n.body,ts:n.at,source:stock?'wallet-transfer':t.direction==='in'?'wallet-deposit':'wallet-withdrawal',settlementType:'wallet_transfer',direction:t.direction,contextLabel:t.symbol,paycrestStatus:'confirmed'}]
 })]
}
