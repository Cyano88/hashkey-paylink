import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import PocketGetApp from './PocketGetApp'
import PocketXPayLinks from './PocketXPayLinks'
import { CheckCircle2, Clock3, Search } from './PocketIcons'
import PocketBottomSheet from './PocketBottomSheet'
import PocketArcTokenPicker from './PocketArcTokenPicker'
import PocketPaymentSuccess from './PocketPaymentSuccess'
import { FullScreenReceiptSurface } from '../../components/UnifiedReceipt'
import { stockPickerTokens } from '../lib/pocketStockPickerTokens'
import { stockAssets, prepareStockTransfer, stockQuantity, type StockTransfer } from '../lib/pocketXStocksWallet'
import { formatStockQuantity } from '../lib/pocketStockDisplay'
import { xpayRequest } from '../api/pocketXPayClient'
import type { XPayMerchant, XPayPayment } from '../lib/pocketXPay'
import type { PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import type usePocketStockWallet from '../hooks/usePocketStockWallet'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { xStockPath } from '../lib/pocketRail'
const card='rounded-[24px] border border-gray-100 bg-white p-5 dark:border-[#262626] dark:bg-[#121212]'
const cta='min-h-12 w-full rounded-full bg-gray-950 px-5 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950'
const input='min-h-12 w-full rounded-xl bg-gray-100 px-3 text-sm outline-none dark:bg-white/10'
export function xpayReceipt(p:XPayPayment):PaylinkReceipt{return {type:'money_out',receiptId:p.id,receiptHash:p.hash||'',title:'Payment',status:p.status==='paid'?'successful':p.status==='failed'?'failed':'pending',eventId:p.id,txHash:p.hash||'',chain:'xlayer',payer:p.payer,memo:'XPay payment',amount:p.amount,asset:p.symbol,createdAt:p.createdAt,source:'xpay',recipient:p.merchantName,destination:p.recipient,referenceId:p.id,brandName:'Pocket',brandKind:'pocket'}}
function CheckoutSurface({children}:ComponentProps<typeof PocketBottomSheet>){return <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-white/10 dark:bg-[#121212]">{children}</section>}
export default function PocketXPay({wallet,checkout=false}:{wallet:ReturnType<typeof usePocketStockWallet>;checkout?:boolean}){
 const {user,getAccessToken}=usePocketIdentity(),navigate=useNavigate(),location=useLocation(),[params]=useSearchParams(),merchantId=params.get('merchant')||/^\/xpay\/([0-9a-f-]{36})$/.exec(location.pathname)?.[1]||''
 const scope=(user?.id||'')+':'+(wallet.address||''),storageKey='pocket.xpay.active:'+scope
 const scopeRef=useRef(scope);scopeRef.current=scope
 const [merchants,setMerchants]=useState<XPayMerchant[]>([])
 const [merchant,setMerchant]=useState<XPayMerchant|null>(null),[payments,setPayments]=useState<XPayPayment[]>([])
 const [token,setToken]=useState(''),[usd,setUsd]=useState(''),[payment,setPayment]=useState<XPayPayment|null>(null),[review,setReview]=useState<StockTransfer|null>(null)
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[open,setOpen]=useState(!!merchantId),[receipt,setReceipt]=useState<PaylinkReceipt|null>(null)
 const guard=useRef(false),mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const saveActive=(id:string,hash?:string)=>localStorage.setItem(storageKey,JSON.stringify({id,hash}))
 const adopt=(p:XPayPayment)=>{setPayment(previous=>previous?.id===p.id&&['paid','failed'].includes(previous.status)&&p.status==='submitted'?previous:p);if(['paid','failed'].includes(p.status)){localStorage.removeItem(storageKey);void wallet.refresh().catch(()=>undefined)}}
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError('');setMerchant(null);setPayment(null);setReview(null);setOpen(!!merchantId)
  void xpayRequest(getAccessToken,merchantId?{action:'merchant',id:merchantId}:{action:'mine'}).then(async data=>{
   if(cancelled)return
   setMerchants(data.merchants||(data.merchant?[data.merchant]:[]));setMerchant(data.merchant);setToken(data.merchant?.tokens[0]||'');setPayments(data.payments||[])
   let saved:{id?:string;hash?:string}={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{}
   const recovered=data.payments?.find(p=>p.payer.toLowerCase()===wallet.address?.toLowerCase()&&p.status==='submitted')
   const id=saved.id||recovered?.id
   if(id){const result=await xpayRequest(getAccessToken,{action:saved.hash?'confirm':'status',id,...(saved.hash?{hash:saved.hash}:{})});if(!cancelled){if(result.payment.status==='ready')localStorage.removeItem(storageKey);else{adopt(result.payment);setOpen(true)}}}
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
  const data=await xpayRequest(getAccessToken,{action:'prepare',id:merchant.id,wallet:wallet.address,token,usd,key:crypto.randomUUID()})
  if(scopeRef.current!==currentScope)return
  const asset=stockAssets.find(a=>a.address.toLowerCase()===data.payment.token)!
  const transfer=await prepareStockTransfer(wallet.address,asset,data.payment.recipient,data.payment.amount)
  setPayment(data.payment);setReview(transfer)
 })
 const pay=()=>run(async()=>{
  if(!payment||!review||payment.status!=='ready')return
  const p=payment,currentScope=scope
  const hash=await wallet.send(review,{
   beforeSubmit:async()=>{if(scopeRef.current!==currentScope||p.expiresAt<=Date.now())throw Error('Review a fresh payment quote.');saveActive(p.id);const data=await xpayRequest(getAccessToken,{action:'authorize',id:p.id});setPayment(data.payment)},
   onSubmitted:hash=>{saveActive(p.id,hash);setPayment(previous=>previous?.id===p.id?{...previous,hash,status:'submitted'}:previous)}
  })
  if(scopeRef.current!==currentScope)return
  const data=await xpayRequest(getAccessToken,{action:'confirm',id:p.id,hash});adopt(data.payment);setUsd('');setReview(null)
 })
 const Surface=checkout?CheckoutSurface:PocketBottomSheet
 const close=()=>{if(checkout)return;setOpen(false);setError('');if(merchantId)navigate(xStockPath('home'),{replace:true})}
 const assetTokens=stockPickerTokens(wallet.displaySnapshot||wallet.snapshot).filter(t=>merchant?.tokens.includes(t.address.toLowerCase()))
 const selected=stockAssets.find(a=>a.address.toLowerCase()===token)
 const qr=merchant?'https://pocket.hashpaylink.com/xpay/'+merchant.id:''
 if(receipt)return <FullScreenReceiptSurface receipt={receipt} surface="receipt" onClose={()=>setReceipt(null)}/>
 return <>
  {!merchantId&&<PocketXPayLinks key={scope} wallet={wallet} merchants={merchants} payments={payments} loading={loading} onChange={setMerchants}/>}
  {open&&(payment&&['paid','submitted','failed'].includes(payment.status)?<PocketPaymentSuccess receipt={xpayReceipt(payment)} onDone={close} inline={checkout}/>:<Surface title="XPay" onClose={close} showCloseButton dismissible={!busy} dismissOnBackdrop={false}>
   <h2 className="mb-5 text-lg font-bold">{payment?.merchantName||merchant?.name||'XPay'}</h2>
   {payment?.status==='submitted'||payment?.status==='failed'?<div className="py-4 text-center"><Clock3 className="mx-auto h-12 w-12 text-blue-500"/><p className="mt-4 text-sm font-bold">{payment.status==='failed'?'Payment failed':'Confirming payment'}</p><p className="mt-2 text-xs text-gray-400">{formatStockQuantity(payment.amount)} {payment.symbol}</p><p className="mt-4 text-xs text-gray-400">{payment.status==='submitted'?'Your payment is being checked. Do not pay again.':'No merchant payment completed.'}</p></div>:payment&&review?<>
    <p className="text-2xl font-bold">{formatStockQuantity(payment.amount)} {payment.symbol}</p><p className="mt-2 text-sm text-gray-500">${payment.usd} USD</p><p className="mb-6 mt-3 text-xs text-gray-400">Network fee · ≈ {formatStockQuantity(stockQuantity(review.fee,18))} OKB</p><button className={cta} disabled={busy||wallet.busy||wallet.uncertain||wallet.pending?.status==='pending'} onClick={pay}>{busy?'Processing…':'Pay '+payment.merchantName}</button><button className="min-h-11 w-full text-xs text-gray-400" disabled={busy} onClick={()=>{setPayment(null);setReview(null)}}>Edit amount</button>
   </>:loading?<div aria-label="Loading merchant" className="h-40 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/10"/>:merchant?<>
    <p className="mb-4 text-xs text-gray-400">ID:{merchant.pocketId}</p><PocketArcTokenPicker label="Pay with" value={selected?.address||''} excluded="" tokens={assetTokens} disabled={busy} networkLabel="X Layer" clean initialLimit={100} onChange={t=>setToken(t.address.toLowerCase())} discover={async()=>{throw Error('Choose a stock accepted by this merchant.')}}/><label className="mt-4 block text-xs text-gray-400">Amount in USD<input aria-label="Amount in USD" className={input+' mt-2'} inputMode="decimal" value={usd} onChange={e=>setUsd(e.target.value)}/></label><button className={cta+' mt-5'} disabled={busy||!usd||!token||!wallet.address} onClick={prepare}>{busy?'Preparing…':'Continue'}</button>{!wallet.address&&<button className={cta+' mt-3'} onClick={wallet.connect} disabled={!wallet.ready||wallet.busy}>Open wallet</button>}
   </>:null}
   {error&&<p role="alert" className="mt-4 text-xs leading-5 text-red-500">{error}</p>}
  </Surface>)}
  {!open&&error&&<p role="alert" className="mt-4 text-xs text-red-500">{error}</p>}
 </>
}
