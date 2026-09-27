import {retireCachedPocketPos} from '../lib/pocketActivityCache'
import {useRef,useState} from 'react'
import {useLocation,useNavigate,useSearchParams} from 'react-router-dom'
import {QRCodeCanvas} from 'qrcode.react'
import usePocketXPayBack from '../hooks/usePocketXPayBack'
import {xpayOrigin,xpayReturnPath} from '../lib/pocketXPayNavigation'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketBottomSheet from '../components/PocketBottomSheet'
import PocketRecentActivitySkeleton from '../components/PocketRecentActivitySkeleton'
import PocketActivityPanel from '../features/activity/PocketActivityPanel'
import {QrCode,ChevronRight} from '../components/PocketIcons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketActivity from '../hooks/usePocketActivity'
import {POCKET_BASE_PATH,POCKET_ROUTES,pocketApiUrl,hashPayLinkAppOriginForOrigin} from '../lib/pocketRoutes'
import {downloadPocketQr} from '../lib/pocketQrDownload'
import {copyToClipboard} from '../../lib/utils'
import {requestPocketPaymentApproval,takePocketPaymentApproval} from '../lib/pocketPaymentApproval'
import {clearXPayMineCache} from '../lib/pocketXPayRead'

export default function PocketPosManagePage(){
 const navigate=useNavigate(),location=useLocation(),entry=useRef(location.state)
 const [params,setParams]=useSearchParams()
 const {authenticated,email,getAccessToken,user}=usePocketIdentity()
 const activity=usePocketActivity({authenticated,email,getAccessToken,enabled:true})
 const [deleted,setDeleted]=useState<string[]>([]),[deleting,setDeleting]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false)
 const qr=useRef<HTMLDivElement>(null),locked=useRef(false)
 const terminal=params.get('terminal'),history=params.get('view')==='payments'
 const all=activity.merchants.filter(m=>!m.source||m.source==='pos')
 const merchants=all.filter(m=>!m.deleted_at&&!deleted.includes(m.merchant_id))
 const selected=merchants.find(m=>m.merchant_id===terminal)
 const update=(next:Record<string,string>)=>{setError('');setCopied(false);setParams(next,{state:entry.current})}
 const back=()=>{if(busy)return;if(history)update(terminal&&selected?{terminal}:{});else if(terminal)update({});else navigate(xpayReturnPath(entry.current,POCKET_BASE_PATH+POCKET_ROUTES.pos),{state:{xpayOrigin:xpayOrigin(entry.current)},replace:true})}
 usePocketXPayBack(back)
 const run=async(work:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await work()}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Please try again.')}finally{locked.current=false;setBusy(false)}}
 const remove=()=>run(async()=>{
  if(!selected)return
  const id=selected.merchant_id
  await requestPocketPaymentApproval();const approval=takePocketPaymentApproval()
  if(!approval)throw Error('Confirm deletion again.')
  const r=await fetch(pocketApiUrl('/api/pocket/xpay'),{method:'POST',headers:{'content-type':'application/json',authorization:approval.authorization,'X-Pocket-Payment-Approval':approval.token},body:JSON.stringify({action:'bank-delete',id}),signal:AbortSignal.timeout(15000)})
  const b=await r.json().catch(()=>({}));if(!r.ok||!b.ok)throw Error(b.error||'The QR could not be deleted. Please try again.')
  if(email)retireCachedPocketPos(email,id,b.deletedAt);setDeleted(old=>[...old,id]);clearXPayMineCache(user?.id);setDeleting(false);update({});void activity.refresh(true)
 })
 const url=selected?hashPayLinkAppOriginForOrigin(window.location.origin)+'/pos/ng?merchant_id='+encodeURIComponent(selected.merchant_id):''
 return <PocketRouteShell active="home" rail={xpayOrigin(entry.current)} navigationDisabled={busy} scrollKey={history?'payments:'+terminal:terminal||'list'} onSelect={tab=>navigate(POCKET_BASE_PATH+(tab==='bills'?POCKET_ROUTES.bills:tab==='profile'?POCKET_ROUTES.profile:tab==='activity'?POCKET_ROUTES.activity:POCKET_ROUTES.home))}>
  <PocketFlowHeader centered title={history?'Payment history':selected?'Bank QR':'POS terminals'} onBack={back} rightAction={!history?<button disabled={busy} className="min-h-11 text-xs font-semibold" onClick={()=>update({...selected?{terminal:selected.merchant_id}:{},view:'payments'})}>Payment history</button>:undefined}/>
  {history?<PocketActivityPanel key={terminal||'all'} incomingPos hideHeading view="all" rows={terminal?activity.rows.filter(r=>r.merchantId===terminal):activity.rows} authenticated={authenticated} busy={activity.busy||!activity.resolved} error={activity.error} onRefund={async()=>''}/>:!activity.resolved&&!merchants.length?<PocketRecentActivitySkeleton/>:selected?<>
   <h2 className="text-center text-sm font-semibold">{selected.display_name}</h2>
   {selected.bank_name&&<p className="text-center text-xs text-gray-500">{selected.bank_name}{selected.bank_last4?' ? '+selected.bank_last4:''}</p>}
   <div ref={qr} className="mx-auto w-fit rounded-2xl bg-white p-5"><QRCodeCanvas value={url} size={1024} style={{width:224,height:224}} marginSize={2}/></div>
   <p className="text-center text-xs text-gray-500">Scan to pay</p>
   <button disabled={busy} className="pocket-cta-primary w-full" onClick={()=>void run(async()=>{await copyToClipboard(url);setCopied(true)})}>{copied?'Copied':'Copy link'}</button>
   <button disabled={busy} className="min-h-11 w-full text-xs font-semibold" onClick={()=>void run(async()=>{const canvas=qr.current?.querySelector('canvas');if(canvas)await downloadPocketQr(canvas)})}>Download QR</button>
   <button disabled={busy} className="min-h-11 w-full text-xs font-semibold text-red-500" onClick={()=>setDeleting(true)}>Delete QR</button>
  </>:<>
   <section aria-label="Bank QRs" className="divide-y divide-gray-100 dark:divide-[#262626]">{merchants.map(m=><button key={m.merchant_id} className="flex min-h-20 w-full items-center gap-4 py-4 text-left" onClick={()=>update({terminal:m.merchant_id})}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-[#121212]"><QrCode className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{m.display_name}</span>{m.bank_name&&<span className="mt-1 block truncate text-xs text-gray-500">{m.bank_name}</span>}</span><ChevronRight className="h-4 w-4 text-gray-500"/></button>)}</section>
   {!merchants.length&&<p className="py-8 text-center text-xs text-gray-500">{activity.error||'No terminals yet.'}</p>}
  </>}
  {error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
  {deleting&&<PocketBottomSheet title="Delete QR" showCloseButton dismissOnBackdrop={false} dismissible={!busy} onClose={()=>setDeleting(false)}><h2 className="text-base font-semibold">Delete this QR?</h2><p className="my-4 text-sm text-gray-500">New scans will stop working. Shared QRs using this receiving option will also stop accepting new payments. Existing payments and receipts remain available.</p><button disabled={busy} className="pocket-cta-primary w-full" onClick={()=>void remove()}>{busy?'Confirming?':'Delete QR'}</button></PocketBottomSheet>}
 </PocketRouteShell>
}
