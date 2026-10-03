import {xpayBankRequest,type XPayBankPayment} from '../lib/pocketXPayBankClient'
import {xpayBankActivityRows,xpayConversionHashes} from '../lib/pocketXPayBankActivity'
import { useEffect, useState } from 'react'
import type usePocketStockWallet from '../hooks/usePocketStockWallet'
import usePocketIdentity from '../hooks/usePocketIdentity'
import PocketActivityPanel from '../features/activity/PocketActivityPanel'
import { stockNotificationsRequest, type StockInbox } from '../api/pocketStockNotificationsClient'
import { xpayRequest } from '../api/pocketXPayClient'
import type { XPayPayment } from '../lib/pocketXPay'
import type { PocketActivityRow } from '../models/pocketActivity'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'
export function stockActivityRows(inbox:StockInbox|null,payments:XPayPayment[],address:string,bankPayments:XPayBankPayment[]=[]):PocketActivityRow[]{
 const xpayHashes=new Set([...payments.filter(p=>p.hash).map(p=>p.hash!.toLowerCase()),...xpayConversionHashes(bankPayments)])
 const requestHashes=new Set((inbox?.requests||[]).filter(r=>r.status==='paid'&&r.txHash).map(r=>r.txHash!.toLowerCase()))
 const transfers=(inbox?.notices||[]).flatMap(n=>{const t=n.transfer;if(!t||!n.hash||xpayHashes.has(n.hash.toLowerCase())||requestHashes.has(n.hash.toLowerCase()))return [];return [{eventId:n.id,txHash:n.hash,chain:'xlayer',payer:t.from,recipient:t.to,destination:t.to,memo:t.symbol+(t.direction==='in'?' received':' sent'),amount:t.amount,assetSymbol:t.symbol,ts:n.at,source:'wallet-transfer',settlementType:'wallet_transfer',direction:t.direction,paycrestStatus:'successful'}] as PocketActivityRow[]})
 const xpay=payments.filter(p=>p.status!=='ready').map<PocketActivityRow>(p=>({eventId:p.id,txHash:p.hash||'',chain:'xlayer',payer:p.payer,recipient:p.recipient,destination:p.recipient,memo:'XPay · '+p.merchantName,activityLabel:'XPay · '+p.merchantName,amount:p.amount,assetSymbol:p.symbol,ts:p.createdAt,source:'xpay',settlementType:'wallet_transfer',direction:p.payer.toLowerCase()===address.toLowerCase()?'out':'in',paycrestStatus:p.status==='paid'?'successful':p.status==='failed'?'failed':'pending'}))
 const requests=(inbox?.requests||[]).map<PocketActivityRow>(r=>({eventId:r.id,txHash:r.txHash||'',chain:'xlayer',payer:'ID:'+r.payerPocketId,recipient:'ID:'+r.senderPocketId,memo:'Request · '+r.symbol,amount:r.amount,assetSymbol:r.symbol,ts:r.at,source:'request',direction:r.direction==='incoming'?'out':'in',paycrestStatus:r.status==='paid'?'paid':r.status==='declined'?'cancelled':r.status==='accepted'?'pending':'awaiting response'}))
 return [...transfers,...xpay,...requests,...xpayBankActivityRows(bankPayments)]
}
let activityCache:{scope:string;inbox:StockInbox|null;payments:XPayPayment[];bankPayments:XPayBankPayment[]}|null=null
export default function PocketStockActivity({wallet,payments:provided,historyOnly=false}:{wallet:ReturnType<typeof usePocketStockWallet>;payments?:XPayPayment[];historyOnly?:boolean}){
 const {authenticated,user,email,getAccessToken}=usePocketIdentity(),scope=(user?.id||'')+':'+(wallet.address||'')
 const [bankPayments,setBankPayments]=useState<XPayBankPayment[]>([])
 const [inbox,setInbox]=useState<StockInbox|null>(null),[payments,setPayments]=useState<XPayPayment[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState('')
 useEffect(()=>{if(historyOnly){setBusy(false);return}let cancelled=false,reading=false;if(!authenticated||activityCache?.scope!==scope)activityCache=null;setInbox(activityCache?.inbox||null);setPayments(activityCache?.payments||[]);setBankPayments(activityCache?.bankPayments||[]);setBusy(!activityCache||!stockActivityRows(activityCache.inbox,activityCache.payments,wallet.address||'',activityCache.bankPayments).length);setError('')
  const refresh=async()=>{
   if(reading||!authenticated||document.visibilityState==='hidden')return
   reading=true
   if(!activityCache||activityCache.scope!==scope||!stockActivityRows(activityCache.inbox,activityCache.payments,wallet.address||'',activityCache.bankPayments).length)setBusy(true)
   let failed=false
   const publish=(patch:{inbox?:StockInbox;payments?:XPayPayment[];bankPayments?:XPayBankPayment[]})=>{
    if(cancelled)return
    const previous=activityCache?.scope===scope?activityCache:null
    const next={scope,inbox:previous?.inbox||null,payments:previous?.payments||[],bankPayments:previous?.bankPayments||[],...patch}
    activityCache=next;setInbox(next.inbox);setPayments(next.payments);setBankPayments(next.bankPayments);if(stockActivityRows(next.inbox,next.payments,wallet.address||'',next.bankPayments).length)setBusy(false)
   }
   try{
    await Promise.all([
     stockNotificationsRequest(getAccessToken,undefined,true).then(inbox=>publish({inbox})).catch(()=>{failed=true}),
     xpayBankRequest(getAccessToken,{action:'list'}).then(async data=>{
      const rows=data.payments||[];publish({bankPayments:rows})
      const pending=rows.filter(p=>!['quoted','successful','refunded','failed'].includes(p.state)).slice(0,4)
      if(!pending.length||cancelled)return
      const stored=await import('../controllers/usePocketWalletController').then(m=>m.restorePocketWalletSession(email)).catch(()=>null)
      if(cancelled)return
      const updated=await Promise.all(pending.map(p=>xpayBankRequest(getAccessToken,{action:'status',id:p.id,...(stored?{circleUserToken:stored.userToken}:{})}).then(r=>r.payment).catch(()=>p)))
      publish({bankPayments:rows.map(p=>updated.find(next=>next.id===p.id)||p)})
     }).catch(()=>{failed=true}),
     xpayRequest(getAccessToken,{action:'mine'}).then(xpay=>publish({payments:xpay.payments||[]})).catch(()=>{failed=true}),
    ])
    if(!cancelled)setError(failed?'Activity is temporarily unavailable. Please try again shortly.':'')
   }finally{reading=false;if(!cancelled)setBusy(false)}
  }
  void refresh();const timer=window.setInterval(refresh,15000),unregister=registerPocketRefreshHandler(refresh);window.addEventListener('focus',refresh);return()=>{cancelled=true;clearInterval(timer);unregister();window.removeEventListener('focus',refresh)}
 },[scope,historyOnly,authenticated])
 const observed=stockActivityRows(historyOnly?null:inbox,provided||payments,wallet.address||'',historyOnly?[]:bankPayments)
 const hashes=new Set(observed.filter(r=>r.txHash).map(r=>r.txHash.toLowerCase()))
 const pendingRows:PocketActivityRow[]=historyOnly?[]:(wallet.attempts||[]).filter(r=>!r.xpayPaymentId&&r.details&&(!r.hash||!hashes.has(r.hash.toLowerCase()))).map(r=>({eventId:'stock-send:'+r.id,txHash:r.hash,chain:'xlayer',payer:wallet.address||'',recipient:r.details!.recipient,amount:r.details!.amount,memo:r.details!.symbol+' sent',assetSymbol:r.details!.symbol,ts:r.details!.at,source:'wallet-withdrawal',settlementType:'wallet_transfer',direction:'out',paycrestStatus:r.status==='confirmed'?'confirmed':r.status==='failed'?'failed':'pending'}))
 const rows=[...observed,...pendingRows]
 return <PocketActivityPanel rail="xstocks" incomingPos={historyOnly} hideHeading={historyOnly} view="all" rows={rows} authenticated={authenticated} busy={busy} error={error} onRefund={async()=>{throw Error('Not a bank payment.')}}/>
}
