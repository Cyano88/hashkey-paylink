import {useEffect,useRef,useState} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {QRCodeCanvas} from 'qrcode.react'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketBottomSheet from '../components/PocketBottomSheet'
import PocketRecentActivitySkeleton from '../components/PocketRecentActivitySkeleton'
import PocketGetApp from '../components/PocketGetApp'
import {QrCode,ChevronRight} from '../components/PocketIcons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import {isPocketNativeRuntime,pocketApiUrl,POCKET_BASE_PATH,POCKET_ROUTES} from '../lib/pocketRoutes'
import {requestPocketPaymentApproval,takePocketPaymentApproval} from '../lib/pocketPaymentApproval'
import {downloadPocketQr} from '../lib/pocketQrDownload'
import {validateXPayDestinations,xpayDestinationDetail,type XPayCheckout,type XPayDestination} from '../lib/pocketUnifiedXPay'
const cta='pocket-cta-primary w-full'
const title=(d:XPayDestination)=>d.kind==='bank'?'Bank / mobile money':d.kind==='xstocks'?'XStocks wallet':'Stablecoins wallet'
export default function PocketUnifiedXPayPage({publicCheckout=false}:{publicCheckout?:boolean}){
 const identity=usePocketIdentity(),navigate=useNavigate(),location=useLocation()
 const checkoutId=/\/xpay\/checkout\/(xp_[0-9a-f-]{36})$/.exec(location.pathname)?.[1]||''
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [checkouts,setCheckouts]=useState<XPayCheckout[]>([]),[destinations,setDestinations]=useState<XPayDestination[]>([]),[selected,setSelected]=useState<XPayCheckout|null>(null)
 const [creating,setCreating]=useState(false),[name,setName]=useState(''),[ids,setIds]=useState<string[]>([]),[payDestination,setPayDestination]=useState(''),[deleting,setDeleting]=useState(false)
 const action=useRef(false),createKey=useRef(''),qr=useRef<HTMLDivElement>(null)
 async function request(body:Record<string,unknown>,approval?:{token:string;authorization:string}){
  const token=approval?.authorization||'Bearer '+await identity.getAccessToken()
  const r=await fetch(pocketApiUrl('/api/pocket/xpay'),{method:'POST',headers:{'content-type':'application/json',authorization:token,...(approval?{'X-Pocket-Payment-Approval':approval.token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)})
  const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||'XPay is unavailable.');return b
 }
 useEffect(()=>{let active=true;const abort=new AbortController();setLoading(true);setError('');
  const work=checkoutId?fetch(pocketApiUrl('/api/pocket/xpay?id='+encodeURIComponent(checkoutId)),{signal:abort.signal}).then(async r=>{const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||'Checkout unavailable.');return b}):request({action:'mine'})
  void work.then(b=>{if(!active)return;if(checkoutId){setSelected(b.checkout);setPayDestination(b.checkout.destinations[0]?.id||'')}else{setDestinations(b.destinations);setCheckouts(b.checkouts)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false;abort.abort()}
 },[checkoutId,identity.user?.id])
 const execute=async(fn:()=>Promise<void>)=>{if(action.current)return;action.current=true;setBusy(true);setError('');try{await fn()}catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{action.current=false;setBusy(false)}}
 const create=()=>execute(async()=>{validateXPayDestinations(ids,destinations);const b=await request({action:'create',name,destinationIds:ids,key:createKey.current});setCheckouts(old=>[b.checkout,...old.filter(c=>c.id!==b.checkout.id)]);setSelected(b.checkout);setCreating(false)})
 const remove=()=>execute(async()=>{if(!selected)return;await requestPocketPaymentApproval();const approval=takePocketPaymentApproval();if(!approval)throw Error('Confirm deletion again.');await request({action:'delete',id:selected.id},approval);setCheckouts(old=>old.filter(c=>c.id!==selected.id));setSelected(null);setDeleting(false)})
 const pay=()=>{const d=selected?.destinations.find(d=>d.id===payDestination);if(!d)return;
  const url=d.kind==='xstocks'?'https://pocket.hashpaylink.com/xpay/'+d.id:'https://app.hashpaylink.com/pos/ng?merchant_id='+encodeURIComponent(d.id)
  if(isPocketNativeRuntime())navigate(d.kind==='xstocks'?'/xstocks/xpay?merchant='+encodeURIComponent(d.id):'/home/scan?code='+encodeURIComponent(url));else window.location.assign(url)
 }
 const content=<>
  <PocketFlowHeader centered title={creating?'Create QR':'XPay'} onBack={()=>{setError('');if(creating){setCreating(false)}else if(selected&&!checkoutId)setSelected(null);else navigate(POCKET_BASE_PATH+POCKET_ROUTES.home)}}/>
  {loading?<PocketRecentActivitySkeleton/>:checkoutId&&selected?<>
   <h2 className="text-center text-lg font-semibold">{selected.name}</h2>
   <p className="text-center text-xs text-gray-500">Choose how to pay</p>
   {selected.destinations.map(d=><label key={d.id} className="flex min-h-20 items-center gap-3 py-3"><input type="radio" name="destination" checked={payDestination===d.id} onChange={()=>setPayDestination(d.id)}/><span><span className="block text-sm font-semibold">{d.kind==='bank'?'Pay to bank':'Pay to wallet · '+(d.kind==='xstocks'?'XStocks':'Stablecoins')}</span><span className="mt-1 block text-xs text-gray-500">{xpayDestinationDetail(d)}</span></span></label>)}
   <button className={cta} onClick={pay} disabled={!payDestination}>Continue</button><PocketGetApp/>
  </>:creating?<>
   <label className="block text-xs font-semibold">Checkout name<input aria-label="Checkout name" className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-[#262626] dark:bg-[#121212]" maxLength={60} value={name} onChange={e=>{setName(e.target.value);createKey.current=crypto.randomUUID()}}/></label>
   <p className="text-xs text-gray-500">Receive into</p>
   {destinations.map(d=><label key={d.id} className="flex min-h-20 items-center gap-3 py-3"><input type="checkbox" checked={ids.includes(d.id)} disabled={busy} onChange={e=>{setIds(old=>e.target.checked?[...old,d.id]:old.filter(id=>id!==d.id));createKey.current=crypto.randomUUID()}}/><span className="min-w-0"><span className="block text-sm font-semibold">{d.name}</span><span className="mt-1 block text-xs text-gray-500">{title(d)} · {d.assets.join(', ')}</span></span></label>)}
   <p className="text-xs text-gray-500">Accept up to 3 assets across your receiving options. Customers enter the amount and pay with one asset.</p>
   <button className={cta} disabled={busy||!name.trim()||!ids.length} onClick={()=>void create()}>{busy?'Creating…':'Create QR'}</button>
   <button className="min-h-11 w-full text-xs font-semibold" onClick={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.pos)}>Set up bank receiving</button>
   <button className="min-h-11 w-full text-xs font-semibold" onClick={()=>navigate('/xstocks/xpay')}>Set up accepted wallet assets</button>
  </>:selected?<>
   <h2 className="text-center text-sm font-semibold">{selected.name}</h2>
   <div ref={qr} className="mx-auto w-fit rounded-2xl bg-white p-5"><QRCodeCanvas value={'https://pocket.hashpaylink.com/xpay/checkout/'+selected.id} size={224} marginSize={2}/></div>
   <p className="text-center text-xs text-gray-500">XPay · Scan. Pay. Done.</p>
   <button className={cta} onClick={()=>void execute(async()=>{await navigator.clipboard.writeText('https://pocket.hashpaylink.com/xpay/checkout/'+selected.id)})}>Copy link</button>
   <button className="min-h-11 w-full text-xs font-semibold" disabled={busy} onClick={()=>void execute(async()=>{const canvas=qr.current?.querySelector('canvas');if(canvas)await downloadPocketQr(canvas)})}>Download QR</button>
   <button className="min-h-11 w-full text-xs font-semibold text-red-500" onClick={()=>setDeleting(true)}>Delete QR</button>
  </>:<>
   {checkouts.map(c=><button key={c.id} className="flex min-h-20 w-full items-center gap-3 py-3 text-left" onClick={()=>setSelected(c)}><QrCode className="h-6 w-6"/><span className="min-w-0 flex-1 text-sm font-semibold">{c.name}</span><ChevronRight className="h-4 w-4"/></button>)}
   {!checkouts.length&&<p className="py-8 text-center text-xs text-gray-500">Create one QR for your accepted payments.</p>}
   <button className={cta} onClick={()=>{createKey.current=crypto.randomUUID();setName('');setIds([]);setCreating(true)}}>Create QR</button>
   <button className="min-h-11 w-full text-xs font-semibold" onClick={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.posManage)}>Bank QRs and payments</button>
   <button className="min-h-11 w-full text-xs font-semibold" onClick={()=>navigate('/xstocks/xpay')}>Wallet QRs and payments</button>
  </>}
  {error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
  {deleting&&<PocketBottomSheet title="Delete QR" showCloseButton dismissOnBackdrop={false} dismissible={!busy} onClose={()=>setDeleting(false)}><h2 className="text-lg font-semibold">Delete this QR?</h2><p className="my-4 text-sm text-gray-500">New scans will stop working. Existing payments and receipts remain available.</p><button className={cta} disabled={busy} onClick={()=>void remove()}>{busy?'Confirming…':'Delete QR'}</button></PocketBottomSheet>}
 </>
 return publicCheckout?<main className="mx-auto max-w-md space-y-5 px-4 py-8 text-gray-950 dark:text-white">{content}</main>:<PocketRouteShell active="home" onSelect={tab=>navigate(POCKET_BASE_PATH+(tab==='home'?POCKET_ROUTES.home:tab==='bills'?POCKET_ROUTES.bills:tab==='profile'?POCKET_ROUTES.profile:POCKET_ROUTES.activity))}>{content}</PocketRouteShell>
}
