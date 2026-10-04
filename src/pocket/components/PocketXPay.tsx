import PocketFundingAction from './PocketFundingAction'
import {fundingShortfall} from '../lib/pocketFundingShortfall'
import PocketXPayCheckoutBackdrop from './PocketXPayCheckoutBackdrop'
import PocketConfirmationDetails from './PocketConfirmationDetails'
import PocketSlideAction from './PocketSlideAction'
import {xpayOrigin,xpayReturnPath} from '../lib/pocketXPayNavigation'
import PocketXPayProgress from './PocketXPayProgress'
import usePocketSlowConfirmation from '../hooks/usePocketSlowConfirmation'
﻿import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import PocketGetApp from './PocketGetApp'
import PocketXPayLinks from './PocketXPayLinks'
import { CheckCircle2, Clock3, Search } from './PocketIcons'
import PocketBottomSheet from './PocketBottomSheet'
import PocketArcTokenPicker from './PocketArcTokenPicker'
import PocketPaymentSuccess from './PocketPaymentSuccess'
import { FullScreenReceiptSurface } from '../../components/UnifiedReceipt'
import { stockPickerTokens } from '../lib/pocketStockPickerTokens'
import { stockAssets, stockUsdc, prepareStockTransfer, stockQuantity, type StockTransfer } from '../lib/pocketXStocksWallet'
import { formatStockQuantity } from '../lib/pocketStockDisplay'
import { xpayRequest } from '../api/pocketXPayClient'
import type { XPayMerchant, XPayPayment } from '../lib/pocketXPay'
import type { PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import type usePocketStockWallet from '../hooks/usePocketStockWallet'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { xStockPath } from '../lib/pocketRail'
const card='rounded-[24px] border border-gray-100 bg-white p-5 dark:border-[#262626] dark:bg-[#121212]'
const cta='pocket-cta-primary w-full'
const input='min-h-12 w-full rounded-xl bg-gray-100 px-3 text-sm outline-none dark:bg-white/10'
export function xpayReceipt(p:XPayPayment):PaylinkReceipt{return {type:'money_out',receiptId:p.id,receiptHash:p.hash||'',title:'Merchant payment',status:p.status==='paid'?'successful':p.status==='failed'?'failed':'pending',eventId:p.id,txHash:p.hash||'',chain:'xlayer',payer:p.payer,memo:'XPay payment',amount:p.amount,asset:p.symbol,createdAt:p.createdAt,source:'xpay',recipient:p.merchantName,destination:p.recipient,referenceId:p.id,brandName:'Pocket',brandKind:'pocket'}}
function CheckoutSurface({children}:ComponentProps<typeof PocketBottomSheet>){return <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-white/10 dark:bg-[#121212]">{children}</section>}
export default function PocketXPay({wallet,checkout=false,onLayoutChange,paymentContext}:{paymentContext?:{merchantId:string;checkoutId:string;onClose:()=>void};onLayoutChange?:(fixed:boolean)=>void;wallet:ReturnType<typeof usePocketStockWallet>;checkout?:boolean}){
 const {user,getAccessToken}=usePocketIdentity(),navigate=useNavigate(),location=useLocation(),[params]=useSearchParams(),merchantId=paymentContext?.merchantId||params.get('merchant')||/^\/xpay\/([0-9a-f-]{36})$/.exec(location.pathname)?.[1]||''
 const scope=(user?.id||'')+':'+(wallet.address||''),storageKey='pocket.xpay.active:'+scope
 const scopeRef=useRef(scope);scopeRef.current=scope
 const [merchants,setMerchants]=useState<XPayMerchant[]>([])
 const [merchant,setMerchant]=useState<XPayMerchant|null>(null),[payments,setPayments]=useState<XPayPayment[]>([])
 const [token,setToken]=useState(''),[usd,setUsd]=useState(''),[payment,setPayment]=useState<XPayPayment|null>(null),[review,setReview]=useState<StockTransfer|null>(null)
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[open,setOpen]=useState(!!merchantId),[receipt,setReceipt]=useState<PaylinkReceipt|null>(null)
 const slowConfirmation=usePocketSlowConfirmation(payment?.status==='submitted'&&Boolean(payment.hash),payment?.id||'',60_000,busy)
 const guard=useRef(false),mounted=useRef(true)
 const [now,setNow]=useState(Date.now)
 const quoteExpired=payment?.status==='ready'&&payment.expiresAt<=now
 useEffect(()=>{if(payment?.status!=='ready')return;setNow(Date.now());const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[payment?.id,payment?.status])
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const saveActive=(id:string,hash?:string)=>localStorage.setItem(storageKey,JSON.stringify({id,hash}))
 const adopt=(p:XPayPayment)=>{setPayment(previous=>previous?.id===p.id&&['paid','failed'].includes(previous.status)&&p.status==='submitted'?previous:p);if(['paid','failed'].includes(p.status)){localStorage.removeItem(storageKey);void wallet.refresh().catch(()=>undefined)}}
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError('');setMerchant(null);setPayment(null);setReview(null);setOpen(!!merchantId)
  void xpayRequest(getAccessToken,merchantId?{action:'merchant',id:merchantId}:{action:'mine'}).then(async data=>{
   if(cancelled)return
   if(data.terminalId&&!paymentContext?.checkoutId&&!params.get('xpay_checkout_id')&&/^xp_[0-9a-f-]{36}$/.test(data.terminalId)){navigate('/xpay/checkout/'+data.terminalId,{replace:true,state:location.state});return}
   setMerchants(data.merchants||(data.merchant?[data.merchant]:[]));setMerchant(data.merchant);setToken(data.merchant?.tokens[0]||'');setPayments(data.payments||[])
   let saved:{id?:string;hash?:string}={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{}
   const recovered=data.payments?.find(p=>p.payer.toLowerCase()===wallet.address?.toLowerCase()&&p.status==='submitted')
   const id=saved.id||recovered?.id
   if(id){const result=await xpayRequest(getAccessToken,{action:saved.hash?'confirm':'status',id,...(saved.hash?{hash:saved.hash}:{})});if(!cancelled){if(result.payment.status==='ready')localStorage.removeItem(storageKey);else if(!merchantId||result.payment.merchantId===merchantId){adopt(result.payment)}}}
  }).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setLoading(false)})
  return()=>{cancelled=true}
 },[merchantId,scope])
 useEffect(()=>{
  if(merchantId)return
  let cancelled=false,reading=false
  const refresh=async()=>{
   if(reading||document.visibilityState==='hidden')return
   reading=true
   try{const data=await xpayRequest(getAccessToken,{action:'mine'});if(!cancelled){const next=data.payments||[];setMerchants(data.merchants||(data.merchant?[data.merchant]:[]));setPayments(next);setReceipt(previous=>{const updated=next.find(p=>p.id===previous?.receiptId);return previous&&updated?xpayReceipt(updated):previous})}}
   catch{/* Keep the last payment list while offline. */}finally{reading=false}
  }
  const timer=window.setInterval(refresh,15000);window.addEventListener('focus',refresh)
  return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',refresh)}
 },[merchantId,scope])
 useEffect(()=>{
  if(payment?.status!=='submitted')return
  let cancelled=false,reading=false
  const poll=async()=>{if(reading||document.visibilityState==='hidden')return;reading=true;try{let saved:{hash?:string}={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{};const data=await xpayRequest(getAccessToken,{action:saved.hash?'confirm':'status',id:payment.id,...(saved.hash?{hash:saved.hash}:{})});if(!cancelled)adopt(data.payment)}catch{/* Keep pending until verified. */}finally{reading=false}}
  void poll();const timer=window.setInterval(poll,5000);return()=>{cancelled=true;clearInterval(timer)}
 },[payment?.id,payment?.status,storageKey])
 const run=async(fn:()=>Promise<void>)=>{if(guard.current)return;guard.current=true;setBusy(true);setError('');try{await fn()}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'XPay could not complete.')}finally{guard.current=false;if(mounted.current)setBusy(false)}}
 const prepare=()=>run(async()=>{
  if(!wallet.address||!merchant)throw Error('Open your XStocks wallet first.')
  const currentScope=scope
  const data=await xpayRequest(getAccessToken,{action:'prepare',id:merchant.id,wallet:wallet.address,token,usd,key:crypto.randomUUID(),checkoutId:paymentContext?.checkoutId||new URLSearchParams(location.search).get('xpay_checkout_id')||undefined})
  if(scopeRef.current!==currentScope)return
  const asset=[stockUsdc,...stockAssets].find(a=>a.address.toLowerCase()===data.payment.token)!
  const transfer=await prepareStockTransfer(wallet.address,asset,data.payment.recipient,data.payment.amount)
  setPayment(data.payment);setReview(transfer)
 })
 const pay=()=>run(async()=>{
  if(!payment||!review||payment.status!=='ready')return
  const p=payment,currentScope=scope
  if(p.expiresAt<=Date.now()){setNow(Date.now());throw Error('This amount has expired. Update it and review before paying.')}
  // Refresh only the same transfer when its gas estimate has expired.
  // A materially higher fee needs a separate confirmation before PIN approval.
  let transfer=review
  if(review.expiresAt<=Date.now()){
   transfer=await prepareStockTransfer(review.owner,review.asset,review.recipient,review.amount)
   if(scopeRef.current!==currentScope)throw Error('Your Pocket account changed.')
   setReview(transfer)
   if(transfer.fee>review.fee*120n/100n)throw Error('Network fee changed. Review the updated fee before paying.')
  }
  if(p.expiresAt<=Date.now()){setNow(Date.now());throw Error('This amount has expired. Update it and review before paying.')}
  const hash=await wallet.send(transfer,{
   beforeSubmit:async()=>{if(scopeRef.current!==currentScope)throw Error('Your Pocket account changed.');if(p.expiresAt<=Date.now()){setNow(Date.now());throw Error('This amount expired while you approved. Update it and review before paying.')}saveActive(p.id);const data=await xpayRequest(getAccessToken,{action:'authorize',id:p.id});if(scopeRef.current!==currentScope)throw Error('Your Pocket account changed.');setPayment(data.payment)},
   onSubmitted:hash=>{saveActive(p.id,hash);if(scopeRef.current===currentScope)setPayment(previous=>previous?.id===p.id&&!['paid','failed'].includes(previous.status)?{...previous,hash,status:'submitted'}:previous)}
  })
  if(scopeRef.current!==currentScope)return
  const data=await xpayRequest(getAccessToken,{action:'confirm',id:p.id,hash});adopt(data.payment);setUsd('');setReview(null)
 })
 const Surface=checkout&&!review?CheckoutSurface:PocketBottomSheet
 const close=()=>{if(paymentContext){paymentContext.onClose();return}if(checkout)return;setOpen(false);setError('');if(merchantId)navigate(xpayReturnPath(location.state,xStockPath('home')),{replace:true,state:{...location.state,xpayOrigin:xpayOrigin(location.state)}})}
 const assetTokens=stockPickerTokens(wallet.displaySnapshot||wallet.snapshot).filter(t=>merchant?.tokens.includes(t.address.toLowerCase()))
 const selected=[stockUsdc,...stockAssets].find(a=>a.address.toLowerCase()===token)
 const fundingAsset=fundingShortfall(error,selected?.symbol||'USDC')
 const fundingProps={asset:fundingAsset,network:'xlayer' as const,address:wallet.address,locked:busy||wallet.busy||payment?.status==='submitted'||wallet.uncertain,onReturn:async()=>{await wallet.refresh();setError('');setReview(null);setPayment(null)},onCancel:()=>{setError('');setReview(null);setPayment(null);setUsd('')}}
 const qr=merchant?'https://pocket.hashpaylink.com/xpay/'+merchant.id:''
 if(receipt)return <FullScreenReceiptSurface receipt={receipt} surface="receipt" onClose={()=>setReceipt(null)}/>
 return <>
  {merchantId&&!paymentContext&&<PocketXPayCheckoutBackdrop/>}
  {!merchantId&&<PocketXPayLinks key={user?.id||'guest'} onLayoutChange={onLayoutChange} wallet={wallet} merchants={merchants} payments={payments} loading={loading} onChange={setMerchants}/>}
  {open&&(payment&&(['paid','failed'].includes(payment.status)||(payment.status==='submitted'&&(!busy||slowConfirmation)))?<PocketPaymentSuccess receipt={xpayReceipt(payment)} onDone={close} inline={checkout}/>:<Surface title={review?"Confirm payment":"XPay"} onClose={close} showCloseButton dismissible={!busy} dismissOnBackdrop={false}><div className={review?undefined:"min-h-72"}>
   {!review&&<h2 className="mb-5 text-lg font-bold">{payment?.merchantName||merchant?.name||'XPay'}</h2>}
   {(payment?.status==='submitted'&&!review)||payment?.status==='failed'?<div className="py-4 text-center">{payment.hash?<PocketXPayProgress progress={{payment:payment.status==='failed'?'failed':'submitted'}}/>:<p className="text-sm font-medium">Checking submission</p>}<p className="mt-2 text-xs text-gray-400">{formatStockQuantity(payment.amount)} {payment.symbol}</p><p className="mt-4 text-xs text-gray-400">{payment.status==='submitted'?'Your payment is being checked. Do not pay again.':'No merchant payment completed.'}</p></div>:payment&&review?<>
    <PocketConfirmationDetails amount={formatStockQuantity(payment.amount)+' '+payment.symbol} equivalent={'$'+payment.usd+' USD'} rows={[
      ['Merchant',payment.merchantName],['Network','X Layer'],['Gas',formatStockQuantity(stockQuantity(review.fee,18))+' OKB'],
    ]}/>
    <div className="mt-5"><PocketFundingAction {...fundingProps}><PocketSlideAction plain approvalRequired={false} onPrepare={async()=>{}} status={busy||wallet.busy?'pending':'idle'} disabled={payment.status==='submitted'||busy||wallet.busy||wallet.uncertain||wallet.pending?.status==='pending'} onConfirm={()=>void (quoteExpired?prepare():pay())} labels={{idle:quoteExpired?'Update payment amount':'Confirm payment',pending:'Processing',disabled:'Payment pending'}}/></PocketFundingAction></div>
    {quoteExpired&&!busy&&<p role="status" className="mt-3 text-xs text-gray-500">Price expired. Update the amount to continue.</p>}
    <button className="min-h-11 w-full text-xs text-gray-400" disabled={busy||payment.status==='submitted'} onClick={()=>{setPayment(null);setReview(null)}}>Edit amount</button>
   </>:loading?<div aria-label="Loading merchant" className="h-40 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/10"/>:merchant?<>
    <p className="mb-4 text-xs text-gray-400">ID:{merchant.pocketId}</p><PocketArcTokenPicker label="Pay with" value={selected?.address||''} excluded="" tokens={assetTokens} disabled={busy} networkLabel="X Layer" clean initialLimit={100} onChange={t=>setToken(t.address.toLowerCase())} discover={async()=>{throw Error('Choose a stock accepted by this merchant.')}}/><label className="mt-4 block text-xs text-gray-400">Amount in USD<input aria-label="Amount in USD" className={input+' mt-2'} inputMode="decimal" value={usd} onChange={e=>setUsd(e.target.value)}/></label><PocketFundingAction {...fundingProps}><button className={cta+' mt-5'} disabled={busy||!usd||!token||!wallet.address} onClick={prepare}>{busy?'Preparing…':'Continue'}</button></PocketFundingAction>{!wallet.address&&<button className={cta+' mt-3'} onClick={wallet.connect} disabled={!wallet.ready||wallet.busy}>Open wallet</button>}
   </>:null}
   {!fundingAsset&&error&&<p role="alert" className="mt-4 text-xs leading-5 text-red-500">{error}</p>}
  </div></Surface>)}
  {!open&&error&&<p role="alert" className="mt-4 text-xs text-red-500">{error}</p>}
 </>
}
