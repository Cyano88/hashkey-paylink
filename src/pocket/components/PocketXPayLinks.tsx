import {PlusIcon} from '@heroicons/react/24/outline'
import {downloadPocketQr} from '../lib/pocketQrDownload'
import PocketXPayAssetList from './PocketXPayAssetList'
import usePocketXPayBack from '../hooks/usePocketXPayBack'
import {xpayOrigin,xpayReturnPath} from '../lib/pocketXPayNavigation'
import { useLocation, useNavigate } from 'react-router-dom'
import { xStockPath } from '../lib/pocketRail'
import PocketFlowHeader from './PocketFlowHeader'
import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { History, ChevronRight, QrCode, Search } from './PocketIcons'
import PocketBottomSheet from './PocketBottomSheet'
import PocketRecentActivitySkeleton from './PocketRecentActivitySkeleton'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { requestPocketPaymentApproval, takePocketPaymentApproval } from '../lib/pocketPaymentApproval'
import { stockAssets, stockUsdc } from '../lib/pocketXStocksWallet'
import { xpayRequest } from '../api/pocketXPayClient'
import type { XPayMerchant, XPayPayment } from '../lib/pocketXPay'
import type usePocketStockWallet from '../hooks/usePocketStockWallet'
import PocketStockActivity from './PocketStockActivity'
const cta='pocket-cta-primary w-full'
const field='min-h-12 w-full rounded-xl bg-gray-100 px-3 text-sm outline-none dark:bg-white/10'
export default function PocketXPayLinks({wallet,merchants,payments,loading,onChange,onLayoutChange}:{onLayoutChange?:(fixed:boolean)=>void;wallet:ReturnType<typeof usePocketStockWallet>;merchants:XPayMerchant[];payments:XPayPayment[];loading:boolean;onChange:(links:XPayMerchant[])=>void}){
 const {getAccessToken}=usePocketIdentity(),navigate=useNavigate(),location=useLocation()
 const [view,setView]=useState<'list'|'detail'|'edit'|'assets'|'history'>(location.state?.xpayManageId?'detail':'list'),[selected,setSelected]=useState(location.state?.xpayManageId||''),[name,setName]=useState(''),[accepted,setAccepted]=useState<string[]>([])
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmDelete,setConfirmDelete]=useState(false),[copied,setCopied]=useState(false)
 const qr=useRef<HTMLDivElement>(null)
 const actionLock=useRef(false),mounted=useRef(true)
 useEffect(()=>{onLayoutChange?.(view==='edit'||view==='assets')},[view,onLayoutChange])
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const merchant=merchants.find(m=>m.id===selected)
 const edit=(m?:XPayMerchant)=>{setSelected(m?.id||'');setName(m?.name||'');setAccepted(m?.tokens||[]);setError('');setView('edit')}
 const save=async()=>{if(actionLock.current||!wallet.address)return;actionLock.current=true;setBusy(true);setError('');try{const data=await xpayRequest(getAccessToken,{action:'merchant-save',wallet:wallet.address,name,tokens:accepted,...(merchant?{id:merchant.id}:{create:true})});if(!mounted.current)return;if(!data.merchant)throw Error('Link could not be saved.');onChange([...merchants.filter(m=>m.id!==data.merchant!.id),data.merchant]);setSelected('');setView('list')}catch(e){setError(e instanceof Error?e.message:'Link could not be saved.')}finally{actionLock.current=false;if(mounted.current)setBusy(false)}}
 const remove=async()=>{if(actionLock.current||!merchant)return;actionLock.current=true;setBusy(true);setError('');try{await requestPocketPaymentApproval();if(!mounted.current)return;const approval=takePocketPaymentApproval();if(!approval)throw Error('Confirm deletion again.');await xpayRequest(getAccessToken,{action:'merchant-delete',id:merchant.id},approval);if(!mounted.current)return;onChange(merchants.filter(m=>m.id!==merchant.id));setConfirmDelete(false);setSelected('');setView('list')}catch(e){setError(e instanceof Error?e.message:'Link could not be deleted.')}finally{actionLock.current=false;if(mounted.current)setBusy(false)}}
 const back=()=>{if(busy||confirmDelete)return;setError('');if(view==='assets')setView('edit');else if(view==='list')navigate(xpayReturnPath(location.state,xStockPath('home')),{state:{xpayOrigin:xpayOrigin(location.state)},replace:true});else if((view==='edit'||view==='history')&&merchant)setView('detail');else{setView('list');setSelected('')}}
 usePocketXPayBack(back)
 return <div className={view==='edit'||view==='assets'?"flex min-h-0 flex-1 flex-col gap-4":"space-y-4"}>
  <PocketFlowHeader centered wideActions title={view==='assets'?'Accepted assets':view==='history'?'Payment history':view==='edit'?(merchant?'Edit link':'Create link'):'XPay'} onBack={back} rightAction={view!=='history'&&view!=='edit'&&view!=='assets'?<div className="flex items-center gap-1">{view==='list'&&<button aria-label="Create link" className="flex h-10 w-10 items-center justify-center" onClick={()=>edit()}><PlusIcon className="h-5 w-5"/></button>}<button aria-label="Payment history" className="flex h-10 w-10 items-center justify-center" onClick={()=>{setError('');setView('history')}}><History className="h-5 w-5"/></button></div>:undefined}/>
  {view==='history'?<PocketStockActivity wallet={wallet} payments={selected?payments.filter(p=>p.merchantId===selected):payments} historyOnly/>:loading&&((view==='list'&&!merchants.length)||(view==='detail'&&!merchant))?<PocketRecentActivitySkeleton/>:view==='list'?<>
   {merchants.map(m=><button key={m.id} className="flex min-h-20 w-full items-center gap-4 py-4 text-left" onClick={()=>{setSelected(m.id);setCopied(false);setError('');setView('detail')}}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-[#171717]"><QrCode className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{m.name}</span><span className="mt-1 block text-[11px] text-gray-500">{m.tokens.length} accepted assets</span></span><ChevronRight className="h-4 w-4 text-gray-400"/></button>)}
   {!merchants.length&&<p className="py-8 text-center text-xs text-gray-500">Your saved QRs will appear here. Tap + to create one.</p>}
  </>:view==='detail'&&merchant?<>
   <h2 className="text-center text-sm font-semibold">{merchant.name}</h2><div ref={qr} className="mx-auto w-fit rounded-2xl bg-white p-5"><QRCodeCanvas value={'https://pocket.hashpaylink.com/xpay/'+merchant.id} size={1024} style={{width:224,height:224}} marginSize={2}/></div><p className="text-center text-xs text-gray-500">Scan to pay</p>
   <button className={cta} onClick={()=>void navigator.clipboard.writeText('https://pocket.hashpaylink.com/xpay/'+merchant.id).then(()=>setCopied(true)).catch(()=>setError('Could not copy the link.'))}>{copied?'Copied':'Copy link'}</button><button className="min-h-11 w-full text-xs font-semibold" onClick={()=>{const canvas=qr.current?.querySelector('canvas');if(canvas)void downloadPocketQr(canvas).catch(e=>{if(e?.name!=='AbortError')setError('QR could not be saved. Try again.')})}}>Download QR</button><button className="min-h-11 w-full text-xs font-semibold" onClick={()=>edit(merchant)}>Accepted assets</button><button className="min-h-11 w-full text-xs font-semibold text-red-500" onClick={()=>{setError('');setConfirmDelete(true)}}>Delete link</button>
  </>:view==='assets'?<><p className="shrink-0 text-xs text-gray-500">Choose up to 3 assets.</p><PocketXPayAssetList selected={accepted} onChange={setAccepted} disabled={busy} snapshot={wallet.displaySnapshot||wallet.snapshot}/><button className={cta+' shrink-0'} onClick={()=>setView('edit')}>Done</button></>:view==='edit'?<>
   <div className="min-h-0 flex-1 space-y-5"><label className="block text-xs text-gray-500">Merchant name<input aria-label="Merchant name" autoComplete="organization" className={field+' mt-2'} maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></label><button type="button" aria-label="Select accepted assets" className="flex min-h-16 w-full items-center gap-3 text-left" onClick={()=>{(document.activeElement as HTMLElement)?.blur();setView('assets')}}><Search className="h-5 w-5"/><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{accepted.length?accepted.map(t=>[stockUsdc,...stockAssets].find(a=>a.address.toLowerCase()===t)?.symbol||'Asset').join(', '):'Search assets'}</span><span className="mt-1 block text-xs text-gray-500">Accepted assets ({accepted.length}/3)</span></span><ChevronRight className="h-4 w-4"/></button></div>
   <button className={cta+' shrink-0'} disabled={busy||!accepted.length||accepted.length>3||!name.trim()||!wallet.address} onPointerDown={event=>event.preventDefault()} onClick={()=>void save()}>{busy?'Saving...':merchant?'Save changes':'Create link'}</button>{!wallet.address&&<button className={cta+' shrink-0'} disabled={!wallet.ready||wallet.busy} onClick={wallet.connect}>Open wallet</button>}
  </>:null}
  {confirmDelete&&merchant&&<PocketBottomSheet title="Delete link" showCloseButton dismissible={!busy} dismissOnBackdrop={false} onClose={()=>setConfirmDelete(false)}><h2 className="text-lg font-bold">Delete this link?</h2><p className="my-4 text-sm text-gray-500">The QR will stop accepting new payments. Your payment history stays available.</p><button className={cta+' bg-red-600 dark:bg-red-600 dark:text-white'} disabled={busy} onClick={()=>void remove()}>{busy?'Confirming…':'Delete link'}</button>{error&&<p role="alert" className="mt-4 text-xs text-red-500">{error}</p>}</PocketBottomSheet>}
  {error&&!confirmDelete&&<p role="alert" className="text-xs text-red-500">{error}</p>}
 </div>
}
