import { useEffect, useState } from 'react'
import type usePocketStockWallet from '../hooks/usePocketStockWallet'
import usePocketIdentity from '../hooks/usePocketIdentity'
import PocketActivityPanel from '../features/activity/PocketActivityPanel'
import { stockNotificationsRequest, type StockInbox } from '../api/pocketStockNotificationsClient'
import { xpayRequest } from '../api/pocketXPayClient'
import type { XPayPayment } from '../lib/pocketXPay'
import type { PocketActivityRow } from '../models/pocketActivity'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'
export function stockActivityRows(inbox:StockInbox|null,payments:XPayPayment[],address:string):PocketActivityRow[]{
 const xpayHashes=new Set(payments.filter(p=>p.hash).map(p=>p.hash!.toLowerCase()))
 const requestHashes=new Set((inbox?.requests||[]).filter(r=>r.status==='paid'&&r.txHash).map(r=>r.txHash!.toLowerCase()))
 const transfers=(inbox?.notices||[]).flatMap(n=>{const t=n.transfer;if(!t||!n.hash||xpayHashes.has(n.hash.toLowerCase())||requestHashes.has(n.hash.toLowerCase()))return [];return [{eventId:n.id,txHash:n.hash,chain:'xlayer',payer:t.from,recipient:t.to,destination:t.to,memo:t.symbol+(t.direction==='in'?' received':' sent'),amount:t.amount,assetSymbol:t.symbol,ts:n.at,source:'wallet-transfer',settlementType:'wallet_transfer',direction:t.direction,paycrestStatus:'successful'}] as PocketActivityRow[]})
 const xpay=payments.filter(p=>p.status!=='ready').map<PocketActivityRow>(p=>({eventId:p.id,txHash:p.hash||'',chain:'xlayer',payer:p.payer,recipient:p.recipient,destination:p.recipient,memo:'XPay · '+p.merchantName,activityLabel:'XPay · '+p.merchantName,amount:p.amount,assetSymbol:p.symbol,ts:p.createdAt,source:'xpay',settlementType:'wallet_transfer',direction:p.payer.toLowerCase()===address.toLowerCase()?'out':'in',paycrestStatus:p.status==='paid'?'successful':p.status==='failed'?'failed':'pending'}))
 const requests=(inbox?.requests||[]).map<PocketActivityRow>(r=>({eventId:r.id,txHash:r.txHash||'',chain:'xlayer',payer:'ID:'+r.payerPocketId,recipient:'ID:'+r.senderPocketId,memo:'Request · '+r.symbol,amount:r.amount,assetSymbol:r.symbol,ts:r.at,source:'request',direction:r.direction==='incoming'?'out':'in',paycrestStatus:r.status==='paid'?'paid':r.status==='declined'?'cancelled':r.status==='accepted'?'pending':'awaiting response'}))
 return [...transfers,...xpay,...requests]
}
let activityCache:{scope:string;inbox:StockInbox|null;payments:XPayPayment[]}|null=null
export default function PocketStockActivity({wallet,payments:provided,historyOnly=false}:{wallet:ReturnType<typeof usePocketStockWallet>;payments?:XPayPayment[];historyOnly?:boolean}){
 const {authenticated,user,getAccessToken}=usePocketIdentity(),scope=(user?.id||'')+':'+(wallet.address||'')
 const [inbox,setInbox]=useState<StockInbox|null>(null),[payments,setPayments]=useState<XPayPayment[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState('')
 useEffect(()=>{if(historyOnly){setBusy(false);return}let cancelled=false,reading=false;if(!authenticated||activityCache?.scope!==scope)activityCache=null;setInbox(activityCache?.inbox||null);setPayments(activityCache?.payments||[]);setBusy(!activityCache||!stockActivityRows(activityCache.inbox,activityCache.payments,wallet.address||'').length);setError('')
  const refresh=async()=>{
   if(reading||!authenticated||document.visibilityState==='hidden')return
   reading=true
   if(!activityCache||activityCache.scope!==scope||!stockActivityRows(activityCache.inbox,activityCache.payments,wallet.address||'').length)setBusy(true)
   let failed=false
   const publish=(patch:{inbox?:StockInbox;payments?:XPayPayment[]})=>{
    if(cancelled)return
    const previous=activityCache?.scope===scope?activityCache:null
    const next={scope,inbox:previous?.inbox||null,payments:previous?.payments||[],...patch}
    activityCache=next;setInbox(next.inbox);setPayments(next.payments);if(stockActivityRows(next.inbox,next.payments,wallet.address||'').length)setBusy(false)
   }
   try{
    await Promise.all([
     stockNotificationsRequest(getAccessToken,undefined,true).then(inbox=>publish({inbox})).catch(()=>{failed=true}),
     xpayRequest(getAccessToken,{action:'mine'}).then(xpay=>publish({payments:xpay.payments||[]})).catch(()=>{failed=true}),
    ])
    if(!cancelled)setError(failed?'Activity is temporarily unavailable. Please try again shortly.':'')
   }finally{reading=false;if(!cancelled)setBusy(false)}
  }
  void refresh();const timer=window.setInterval(refresh,15000),unregister=registerPocketRefreshHandler(refresh);window.addEventListener('focus',refresh);return()=>{cancelled=true;clearInterval(timer);unregister();window.removeEventListener('focus',refresh)}
 },[scope,historyOnly,authenticated])
 const rows=stockActivityRows(historyOnly?null:inbox,provided||payments,wallet.address||'')
 return <PocketActivityPanel rail="xstocks" hideHeading={historyOnly} view="all" rows={rows} authenticated={authenticated} busy={busy} error={error} onRefund={async()=>{throw Error('Not a bank payment.')}}/>
}
