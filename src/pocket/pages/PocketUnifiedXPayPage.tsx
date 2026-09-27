import {stockAssets,stockUsdc} from '../lib/pocketXStocksWallet'
import {formatStockQuantity} from '../lib/pocketStockDisplay'
import PocketPaymentSuccess from '../components/PocketPaymentSuccess'
import {CPurseIcon} from '../components/CPurseIcon'
import type {PaylinkReceipt} from '../../lib/paymentReceiptPdf'
import type {XPayHistoryEntry} from '../lib/pocketUnifiedXPay'
import {lazy,Suspense,useEffect,useRef,useState} from 'react'
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
const BankSetup=lazy(()=>import('../components/PocketUnifiedXPaySetup').then(m=>({default:m.XPayBankSetup})))
const WalletSetup=lazy(()=>import('../components/PocketUnifiedXPaySetup').then(m=>({default:m.XPayWalletSetup})))
const cta='pocket-cta-primary w-full'
const title=(d:XPayDestination)=>d.kind==='bank'?'Bank / mobile money':d.kind==='xstocks'?'XStocks wallet':'Stablecoins wallet'
export default function PocketUnifiedXPayPage({publicCheckout=false}:{publicCheckout?:boolean}){
 const identity=usePocketIdentity(),navigate=useNavigate(),location=useLocation()
 const checkoutId=/\/xpay\/checkout\/(xp_[0-9a-f-]{36})$/.exec(location.pathname)?.[1]||''
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [checkouts,setCheckouts]=useState<XPayCheckout[]>([]),[destinations,setDestinations]=useState<XPayDestination[]>([]),[selected,setSelected]=useState<XPayCheckout|null>(null)
 const [creating,setCreating]=useState(false),[name,setName]=useState(''),[ids,setIds]=useState<string[]>([]),[payDestination,setPayDestination]=useState(''),[deleting,setDeleting]=useState(false)
 const [setup,setSetup]=useState<'bank'|'wallet'|null>(null),[history,setHistory]=useState<XPayHistoryEntry[]|null>(null),[receipt,setReceipt]=useState<PaylinkReceipt|null>(null),[copied,setCopied]=useState(false)
 const ownerScope=useRef(identity.user?.id);ownerScope.current=identity.user?.id
 const action=useRef(false),createKey=useRef(''),qr=useRef<HTMLDivElement>(null)
 async function request(body:Record<string,unknown>,approval?:{token:string;authorization:string}){
  const owner=ownerScope.current
  const token=approval?.authorization||'Bearer '+await identity.getAccessToken()
  const r=await fetch(pocketApiUrl('/api/pocket/xpay'),{method:'POST',headers:{'content-type':'application/json',authorization:token,...(approval?{'X-Pocket-Payment-Approval':approval.token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)})
  const b=await r.json().catch(()=>({}));if(owner!==ownerScope.current)throw Error('Your Pocket account changed.');if(!r.ok||!b.ok)throw Error(b.error||'XPay is unavailable.');return b
 }
 useEffect(()=>{let active=true;const abort=new AbortController();setLoading(true);setError('');setCheckouts([]);setSelected(null);setDestinations([]);setCreating(false);setSetup(null);setHistory(null);setReceipt(null);
  const work=checkoutId?fetch(pocketApiUrl('/api/pocket/xpay?id='+encodeURIComponent(checkoutId)),{signal:abort.signal}).then(async r=>{const b=await r.json();if(!r.ok||!b.ok)throw Error(b.error||'Checkout unavailable.');return b}):request({action:'mine'})
  void work.then(b=>{if(!active)return;if(checkoutId){setSelected(b.checkout);setPayDestination(b.checkout.destinations[0]?.id||'')}else{setDestinations(b.destinations);setCheckouts(b.checkouts)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false;abort.abort()}
 },[checkoutId,identity.user?.id])
 const execute=async(fn:()=>Promise<void>)=>{if(action.current)return;action.current=true;setBusy(true);setError('');try{await fn()}catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{action.current=false;setBusy(false)}}
 const create=()=>execute(async()=>{validateXPayDestinations(ids,destinations);const b=await request({action:'create',name,destinationIds:ids,key:createKey.current});setCheckouts(old=>[b.checkout,...old.filter(c=>c.id!==b.checkout.id)]);setSelected(b.checkout);setCreating(false)})
 const remove=()=>execute(async()=>{if(!selected)return;await requestPocketPaymentApproval();const approval=takePocketPaymentApproval();if(!approval)throw Error('Confirm deletion again.');await request({action:'delete',id:selected.id},approval);setCheckouts(old=>old.filter(c=>c.id!==selected.id));setSelected(null);setDeleting(false)})
 const setupDone=async(id:string)=>{const b=await request({action:'mine'});const added=b.destinations.find((d:XPayDestination)=>d.id===id);if(!added)throw Error('Receiving option is not ready. Try again.');setDestinations(b.destinations);setIds(old=>[...old.filter(previous=>destinations.find(d=>d.id===previous)?.kind!==added.kind),id]);createKey.current=crypto.randomUUID();setSetup(null)}
 const openHistory=()=>{setHistory([]);return execute(async()=>{if(!selected)return;const b=await request({action:'history',id:selected.id});setHistory(b.payments)})}
 const historyOpen=history!==null
 useEffect(()=>{if(!historyOpen||!selected)return;let active=true,reading=false;const refresh=async()=>{if(reading||document.visibilityState==='hidden')return;reading=true;try{const b=await request({action:'history',id:selected.id});if(active)setHistory(b.payments)}catch{/* Keep the last verified rows during a quiet refresh. */}finally{reading=false}};const timer=window.setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)}},[historyOpen,selected?.id,identity.user?.id])
 const pay=()=>{const d=selected?.destinations.find(d=>d.id===payDestination);if(!d)return;
  const tag='xpay_checkout_id='+encodeURIComponent(selected!.id)
  const url=d.kind==='xstocks'?'https://pocket.hashpaylink.com/xpay/'+d.id+'?'+tag:'https://app.hashpaylink.com/pos/ng?merchant_id='+encodeURIComponent(d.id)+'&'+tag
  if(isPocketNativeRuntime())navigate(d.kind==='xstocks'?'/xstocks/xpay?merchant='+encodeURIComponent(d.id)+'&'+tag:'/home/scan?code='+encodeURIComponent(url));else window.location.assign(url)
 }
 const content=<>
  <PocketFlowHeader centered title={history?'Payment history':setup==='bank'?'Receiving account':setup==='wallet'?'Accepted assets':creating?'Create QR':'XPay'} rightAction={selected&&!checkoutId&&!history?<button className="min-h-11 text-xs font-semibold" disabled={busy} onClick={()=>void openHistory()}>Payment history</button>:undefined} onBack={()=>{if(busy)return;setError('');if(receipt){setReceipt(null)}else if(history){setHistory(null)}else if(setup){setSetup(null)}else if(creating){setCreating(false)}else if(selected&&!checkoutId)setSelected(null);else navigate(POCKET_BASE_PATH+POCKET_ROUTES.home)}}/>
  {receipt?<PocketPaymentSuccess receipt={receipt} onDone={()=>setReceipt(null)}/>:history?<>
   {busy&&!history.length?<PocketRecentActivitySkeleton/>:!error&&!history.length&&<p className="py-8 text-center text-xs text-gray-500">No payments for this QR yet.</p>}
   {history.map((p,i)=>{const day=new Date(p.createdAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});return <div key={p.rail+':'+p.id}>{(i===0||new Date(history[i-1].createdAt).toDateString()!==new Date(p.createdAt).toDateString())&&<p className="pb-2 pt-4 text-[11px] text-gray-500">{day}</p>}<button className="flex min-h-16 w-full items-center gap-3 py-3 text-left" onClick={()=>setReceipt({type:'money_in',eventId:p.id,memo:'XPay payment',bankSettlementStatus:p.bankDelivery,receiptId:p.id,receiptHash:p.hash||'',title:'XPay payment',status:p.state,chain:p.network,payer:'',recipient:selected?.name,amount:p.amount,asset:p.asset,txHash:p.hash||'',createdAt:p.createdAt,source:'xpay',referenceId:p.id,brandName:'Pocket',brandKind:'pocket'})}><span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-[#171717]"><QrCode className="h-4 w-4"/></span><span className="flex-1 text-sm font-semibold">{formatStockQuantity(p.amount)} {p.asset}</span><span className="text-xs text-gray-500">{p.state==='successful'?'Successful':p.state==='refunded'?'Refunded':p.state==='refunding'?'Refunding':p.state==='failed'?'Failed':'Processing'}</span></button></div>})}
  </>:setup?<Suspense fallback={<PocketRecentActivitySkeleton/>}>{setup==='bank'?<BankSetup name={name} onCreated={setupDone}/>:<WalletSetup name={name} reservedAssets={destinations.filter(d=>ids.includes(d.id)&&d.kind!=='xstocks').flatMap(d=>d.assets)} onCreated={setupDone}/>}</Suspense>:loading?<PocketRecentActivitySkeleton/>:checkoutId&&selected?<>
   <h2 className="text-center text-lg font-semibold">{selected.name}</h2>
   <p className="text-center text-xs text-gray-500">Choose how to pay</p>
   {selected.destinations.map(d=><label key={d.id} className="flex min-h-20 items-center gap-3 py-3"><input type="radio" name="destination" checked={payDestination===d.id} onChange={()=>setPayDestination(d.id)}/><span><span className="block text-sm font-semibold">{d.kind==='bank'?'Pay to bank':'Pay to wallet · '+(d.kind==='xstocks'?'XStocks':'Stablecoins')}</span><span className="mt-1 block text-xs text-gray-500">{xpayDestinationDetail(d)}</span><span className="mt-2 flex gap-2">{d.assets.map(symbol=>{const asset=[stockUsdc,...stockAssets].find(a=>a.symbol===symbol);return asset?<img key={symbol} src={asset.icon||(symbol==='USDC'?'/brand/usdc-circle-logo.png':undefined)} alt={symbol} className="h-6 w-6 rounded-full"/>:null})}</span></span></label>)}
   <button className={cta} onClick={pay} disabled={!payDestination}>Continue</button><PocketGetApp/>
  </>:creating?<>
   <label className="block text-xs font-semibold">Checkout name<input aria-label="Checkout name" className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-[#262626] dark:bg-[#121212]" maxLength={60} value={name} onChange={e=>{setName(e.target.value);createKey.current=crypto.randomUUID()}}/></label>
   <p className="text-xs text-gray-500">Receive into</p>
   {destinations.map(d=><label key={d.id} className="flex min-h-20 items-center gap-3 py-3"><input type="checkbox" checked={ids.includes(d.id)} disabled={busy} onChange={e=>{const next=e.target.checked?[...ids.filter(id=>destinations.find(x=>x.id===id)?.kind!==d.kind),d.id]:ids.filter(id=>id!==d.id);try{if(next.length)validateXPayDestinations(next,destinations);setIds(next);setError('');createKey.current=crypto.randomUUID()}catch(reason){setError(reason instanceof Error?reason.message:'Choose up to 3 assets.')}}}/><span className="min-w-0"><span className="block text-sm font-semibold">{d.name}</span><span className="mt-1 block text-xs text-gray-500">{title(d)} · {d.assets.join(', ')}</span></span></label>)}
   <p className="text-xs text-gray-500">Accept up to 3 assets across your receiving options. Customers enter the amount and pay with one asset.</p>
   <button className={cta} disabled={busy||!name.trim()||!ids.length} onClick={()=>void create()}>{busy?'Creating\u2026':'Create QR'}</button>
   <button className="min-h-11 w-full text-xs font-semibold" disabled={!name.trim()||busy} onClick={()=>setSetup('bank')}>Add bank / mobile money</button>
   <button className="min-h-11 w-full text-xs font-semibold" disabled={!name.trim()||busy} onClick={()=>setSetup('wallet')}>Choose wallet assets</button>
  </>:selected?<>
   <h2 className="text-center text-sm font-semibold">{selected.name}</h2>
   <div ref={qr} className="mx-auto w-fit rounded-2xl bg-white p-5"><QRCodeCanvas value={'https://pocket.hashpaylink.com/xpay/checkout/'+selected.id} size={224} marginSize={2}/></div>
   <p className="text-center text-xs text-gray-500">XPay · Scan. Pay. Done.</p>
   <button className={cta} onClick={()=>void execute(async()=>{await navigator.clipboard.writeText('https://pocket.hashpaylink.com/xpay/checkout/'+selected.id);setCopied(true)})}>{copied?'Copied':'Copy link'}</button>
   <button className="min-h-11 w-full text-xs font-semibold" disabled={busy} onClick={()=>void execute(async()=>{const canvas=qr.current?.querySelector('canvas');if(canvas)await downloadPocketQr(canvas)})}>Download QR</button>
   <button className="min-h-11 w-full text-xs font-semibold text-red-500" onClick={()=>setDeleting(true)}>Delete QR</button>
  </>:<>
   {checkouts.map(c=><button key={c.id} className="flex min-h-20 w-full items-center gap-3 py-3 text-left" onClick={()=>{setCopied(false);setSelected(c)}}><QrCode className="h-6 w-6"/><span className="min-w-0 flex-1 text-sm font-semibold">{c.name}</span><ChevronRight className="h-4 w-4"/></button>)}
   {!checkouts.length&&<p className="py-8 text-center text-xs text-gray-500">Create one QR for your accepted payments.</p>}
   <button className={cta} onClick={()=>{createKey.current=crypto.randomUUID();setName('');setIds([]);setCreating(true)}}>Create QR</button>
   <button className="min-h-11 w-full text-xs font-semibold" onClick={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.posManage)}>Bank QRs and payments</button>
   <button className="min-h-11 w-full text-xs font-semibold" onClick={()=>navigate('/xstocks/xpay')}>Wallet QRs and payments</button>
  </>}
  {error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
  {deleting&&<PocketBottomSheet title="Delete QR" showCloseButton dismissOnBackdrop={false} dismissible={!busy} onClose={()=>setDeleting(false)}><h2 className="text-lg font-semibold">Delete this QR?</h2><p className="my-4 text-sm text-gray-500">New scans will stop working. Existing payments and receipts remain available.</p><button className={cta} disabled={busy} onClick={()=>void remove()}>{busy?'Confirming\u2026':'Delete QR'}</button></PocketBottomSheet>}
 </>
 return publicCheckout?<main className="mx-auto max-w-md space-y-5 px-4 py-8 text-gray-950 dark:text-white"><p className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold"><CPurseIcon size={26} title=""/>Pocket</p>{content}</main>:<PocketRouteShell active="home" onSelect={tab=>navigate(POCKET_BASE_PATH+(tab==='home'?POCKET_ROUTES.home:tab==='bills'?POCKET_ROUTES.bills:tab==='profile'?POCKET_ROUTES.profile:POCKET_ROUTES.activity))}>{content}</PocketRouteShell>
}
