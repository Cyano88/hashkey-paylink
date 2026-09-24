import { useNavigate } from 'react-router-dom'
import { xStockPath } from '../lib/pocketRail'
import PocketFlowHeader from './PocketFlowHeader'
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, ChevronRight, QrCode, Search } from './PocketIcons'
import PocketBottomSheet from './PocketBottomSheet'
import PocketRecentActivitySkeleton from './PocketRecentActivitySkeleton'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { requestPocketPaymentApproval, takePocketPaymentApproval } from '../lib/pocketPaymentApproval'
import { stockAssets } from '../lib/pocketXStocksWallet'
import { xpayRequest } from '../api/pocketXPayClient'
import type { XPayMerchant, XPayPayment } from '../lib/pocketXPay'
import type usePocketStockWallet from '../hooks/usePocketStockWallet'
import PocketStockActivity from './PocketStockActivity'
const cta='min-h-12 w-full rounded-full bg-gray-950 px-5 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950'
const field='min-h-12 w-full rounded-xl bg-gray-100 px-3 text-sm outline-none dark:bg-white/10'
export default function PocketXPayLinks({wallet,merchants,payments,loading,onChange}:{wallet:ReturnType<typeof usePocketStockWallet>;merchants:XPayMerchant[];payments:XPayPayment[];loading:boolean;onChange:(links:XPayMerchant[])=>void}){
 const {getAccessToken}=usePocketIdentity(),navigate=useNavigate()
 const [view,setView]=useState<'list'|'detail'|'edit'|'history'>('list'),[selected,setSelected]=useState(''),[name,setName]=useState(''),[accepted,setAccepted]=useState<string[]>([]),[query,setQuery]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmDelete,setConfirmDelete]=useState(false),[copied,setCopied]=useState(false)
 const actionLock=useRef(false),mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const merchant=merchants.find(m=>m.id===selected)
 const edit=(m?:XPayMerchant)=>{setSelected(m?.id||'');setName(m?.name||'');setAccepted(m?.tokens||[]);setQuery('');setError('');setView('edit')}
 const save=async()=>{if(actionLock.current||!wallet.address)return;actionLock.current=true;setBusy(true);setError('');try{const data=await xpayRequest(getAccessToken,{action:'merchant-save',wallet:wallet.address,name,tokens:accepted,...(merchant?{id:merchant.id}:{create:true})});if(!mounted.current)return;if(!data.merchant)throw Error('Link could not be saved.');onChange([...merchants.filter(m=>m.id!==data.merchant!.id),data.merchant]);setSelected('');setView('list')}catch(e){setError(e instanceof Error?e.message:'Link could not be saved.')}finally{actionLock.current=false;if(mounted.current)setBusy(false)}}
 const remove=async()=>{if(actionLock.current||!merchant)return;actionLock.current=true;setBusy(true);setError('');try{await requestPocketPaymentApproval();if(!mounted.current)return;const approval=takePocketPaymentApproval();if(!approval)throw Error('Confirm deletion again.');await xpayRequest(getAccessToken,{action:'merchant-delete',id:merchant.id},approval);if(!mounted.current)return;onChange(merchants.filter(m=>m.id!==merchant.id));setConfirmDelete(false);setSelected('');setView('list')}catch(e){setError(e instanceof Error?e.message:'Link could not be deleted.')}finally{actionLock.current=false;if(mounted.current)setBusy(false)}}
 return <div className="space-y-4">
  <PocketFlowHeader title={view==='history'?'Payment history':view==='edit'?(merchant?'Edit link':'Create link'):'XPay'} onBack={()=>{if(busy)return;if(view==='list')navigate(xStockPath('home'));else{setView('list');setSelected('');setError('')}}} rightAction={view!=='history'?<button className="min-h-11 text-xs font-semibold" onClick={()=>{setError('');setView('history')}}>Payment history</button>:undefined}/>
  {view==='history'?<PocketStockActivity wallet={wallet} payments={selected?payments.filter(p=>p.merchantId===selected):payments} historyOnly/>:loading?<PocketRecentActivitySkeleton/>:view==='list'?<>
   {merchants.map(m=><button key={m.id} className="flex min-h-20 w-full items-center gap-4 py-4 text-left" onClick={()=>{setSelected(m.id);setCopied(false);setError('');setView('detail')}}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-[#171717]"><QrCode className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{m.name}</span><span className="mt-1 block text-[11px] text-gray-500">{m.tokens.length} accepted stocks</span></span><ChevronRight className="h-4 w-4 text-gray-400"/></button>)}
   {!merchants.length&&<p className="py-8 text-center text-xs text-gray-500">No payment links yet.</p>}<button className={cta} onClick={()=>edit()}>Create link</button>
  </>:view==='detail'&&merchant?<>
   <h2 className="text-center text-sm font-semibold">{merchant.name}</h2><div className="mx-auto w-fit rounded-2xl bg-white p-5"><QRCodeSVG value={'https://pocket.hashpaylink.com/xpay/'+merchant.id} size={224}/></div><p className="text-center text-xs text-gray-500">Scan to pay</p>
   <button className={cta} onClick={()=>void navigator.clipboard.writeText('https://pocket.hashpaylink.com/xpay/'+merchant.id).then(()=>setCopied(true)).catch(()=>setError('Could not copy the link.'))}>{copied?'Copied':'Copy link'}</button><button className="min-h-11 w-full text-xs font-semibold" onClick={()=>edit(merchant)}>Accepted stocks</button><button className="min-h-11 w-full text-xs font-semibold text-red-500" onClick={()=>{setError('');setConfirmDelete(true)}}>Delete link</button>
  </>:view==='edit'?<>
   <label className="block text-xs text-gray-500">Merchant name<input aria-label="Merchant name" className={field+' mt-2'} maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></label><p className="text-xs text-gray-500">Accepted stocks · {accepted.length}</p><label className="flex items-center gap-2"><Search className="h-4 w-4"/><input aria-label="Search accepted stocks" className={field} placeholder="Search stocks" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="max-h-72 overflow-y-auto">{stockAssets.filter(a=>(a.name+' '+a.symbol+' '+a.address).toLowerCase().includes(query.toLowerCase())).slice(0,100).map(a=><label key={a.address} className="flex min-h-14 items-center gap-3"><img src={a.icon} alt="" loading="lazy" className="h-8 w-8 rounded-full"/><span className="flex-1 text-xs font-semibold">{a.symbol}</span><input type="checkbox" disabled={busy||accepted.length>=100&&!accepted.includes(a.address.toLowerCase())} checked={accepted.includes(a.address.toLowerCase())} onChange={e=>setAccepted(old=>e.target.checked?[...old,a.address.toLowerCase()]:old.filter(t=>t!==a.address.toLowerCase()))}/></label>)}</div><button className={cta} disabled={busy||!accepted.length||!name.trim()||!wallet.address} onClick={()=>void save()}>{busy?'Saving…':merchant?'Save changes':'Create link'}</button>{!wallet.address&&<button className={cta} disabled={!wallet.ready||wallet.busy} onClick={wallet.connect}>Open wallet</button>}
  </>:null}
  {confirmDelete&&merchant&&<PocketBottomSheet title="Delete link" showCloseButton dismissible={!busy} dismissOnBackdrop={false} onClose={()=>setConfirmDelete(false)}><h2 className="text-lg font-bold">Delete this link?</h2><p className="my-4 text-sm text-gray-500">The QR will stop accepting new payments. Your payment history stays available.</p><button className={cta+' bg-red-600 dark:bg-red-600 dark:text-white'} disabled={busy} onClick={()=>void remove()}>{busy?'Confirming…':'Delete link'}</button>{error&&<p role="alert" className="mt-4 text-xs text-red-500">{error}</p>}</PocketBottomSheet>}
  {error&&!confirmDelete&&<p role="alert" className="text-xs text-red-500">{error}</p>}
 </div>
}
