import type {PocketNetwork} from '../lib/pocketSchemas'
import PocketSelect from '../components/PocketSelect'
import PocketXPayUsdcSetup from '../components/PocketXPayUsdcSetup'
import PocketKycPrompt from '../components/PocketKycPrompt'
import PocketActivityPanel from '../features/activity/PocketActivityPanel'
import {PlusIcon} from '@heroicons/react/24/outline'
import {readXPayJson,readXPayMineCache,cacheXPayMine,clearXPayMineCache} from '../lib/pocketXPayRead'
import {registerPocketRefreshHandler} from '../lib/pocketRefresh'
import usePocketXPayBack from '../hooks/usePocketXPayBack'
import {xStockNavPath} from '../lib/pocketRail'
import {xpayOrigin,xpayHome,xpayReturnPath} from '../lib/pocketXPayNavigation'
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
import {QrCode,ChevronRight,Coins,TrendingUp,History,Landmark} from '../components/PocketIcons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import {isPocketNativeRuntime,pocketApiUrl,POCKET_BASE_PATH,POCKET_ROUTES} from '../lib/pocketRoutes'
import {requestPocketPaymentApproval,takePocketPaymentApproval} from '../lib/pocketPaymentApproval'
import {downloadPocketQr} from '../lib/pocketQrDownload'
import {validateXPayDestinations,xpayDestinationDetail,type XPayCheckout,type XPayDestination} from '../lib/pocketUnifiedXPay'
const NativeStockPayment=lazy(()=>import('../components/PocketXPayNativeStockPayment'))
const NativePayment=lazy(()=>import('../components/PocketXPayNativePayment'))
const BankCheckout=lazy(()=>import('../components/PocketXPayBankCheckout'))
const BankSetup=lazy(()=>import('../components/PocketUnifiedXPaySetup').then(m=>({default:m.XPayBankSetup})))
const WalletSetup=lazy(()=>import('../components/PocketUnifiedXPaySetup').then(m=>({default:m.XPayWalletSetup})))
const cta='pocket-cta-primary w-full'
const title=(d:XPayDestination)=>d.kind==='bank'?'Bank or mobile money':d.kind==='xstocks'?(d.assets.includes('USDC')?(d.assets.length===1?'USDC':'USDC or stocks'):'XStocks'):'USDC'
const paymentOptions=[
 {kind:'stablecoins' as const,title:'USDC',detail:'Receive on your selected Stablecoins networks.',Icon:Coins,destinationKind:'stablecoins'},
 {kind:'bank' as const,title:'Bank or mobile money',detail:'Receive local currency.',Icon:Landmark,destinationKind:'bank'},
 {kind:'wallet' as const,title:'XStocks & USDC',detail:'Receive on X Layer.',Icon:Coins,destinationKind:'xstocks'},
]
export default function PocketUnifiedXPayPage({publicCheckout=false}:{publicCheckout?:boolean}){
 const identity=usePocketIdentity(),navigate=useNavigate(),location=useLocation()
 const checkoutId=/\/xpay\/checkout\/(xp_[0-9a-f-]{36})$/.exec(location.pathname)?.[1]||''
 const resumeId=new URLSearchParams(location.search).get('resume')||'',resumeMerchant=new URLSearchParams(location.search).get('bank')||''
 const recovering=Boolean(checkoutId&&/^[0-9a-f-]{36}$/.test(resumeId))
 const [standaloneIds,setStandaloneIds]=useState<string[]|undefined>(undefined)
 const [reload,setReload]=useState(0)
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [checkouts,setCheckouts]=useState<XPayCheckout[]>([]),[destinations,setDestinations]=useState<XPayDestination[]>([]),[selected,setSelected]=useState<XPayCheckout|null>(null)
 const [nativePayment,setNativePayment]=useState<{destination:XPayDestination;network:PocketNetwork}|null>(null)
 const [payNetwork,setPayNetwork]=useState(location.state?.xpayNetwork||'')
 const [creating,setCreating]=useState(false),[name,setName]=useState(''),[ids,setIds]=useState<string[]>([]),[payDestination,setPayDestination]=useState(''),[deleting,setDeleting]=useState(false)
 const stockManagement=!checkoutId&&xpayOrigin(location.state)==='xstocks'
 const [stockTotals,setStockTotals]=useState<Array<{symbol:string;amount:string}>>([])
 const [managing,setManaging]=useState(false),[setupKey,setSetupKey]=useState(''),[setupReplace,setSetupReplace]=useState('')
 const [setup,setSetup]=useState<'bank'|'wallet'|'stablecoins'|null>(null),[history,setHistory]=useState<XPayHistoryEntry[]|null>(null),[receipt,setReceipt]=useState<PaylinkReceipt|null>(null),[copied,setCopied]=useState(false)
 const ownerScope=useRef(identity.user?.id);ownerScope.current=identity.user?.id
 const action=useRef(false),createKey=useRef(''),qr=useRef<HTMLDivElement>(null)
 async function request(body:Record<string,unknown>,approval?:{token:string;authorization:string}){
  const owner=ownerScope.current
  const token=approval?.authorization||'Bearer '+await identity.getAccessToken()
  if(body.action==='history')body={...body,rail:stockManagement?'xstocks':'stablecoins'}
  const b=await readXPayJson(pocketApiUrl('/api/pocket/xpay'),{method:'POST',headers:{'content-type':'application/json',authorization:token,...(approval?{'X-Pocket-Payment-Approval':approval.token}:{})},body:JSON.stringify(body)},body.action==='mine'||body.action==='history')
  if(owner!==ownerScope.current)throw Error('Your Pocket account changed.')
  if(body.action==='history')setStockTotals(b.stockTotals||[])
  if(body.action==='mine')cacheXPayMine(owner,b)
  else if(['create','delete','adopt','configure'].includes(String(body.action)))clearXPayMineCache(owner)
  return b
 }
 useEffect(()=>{let active=true;const abort=new AbortController();const cached=!checkoutId?readXPayMineCache(identity.user?.id):undefined;setLoading(!cached);setError('');setCheckouts(cached?.checkouts||[]);setSelected(null);setDestinations(cached?.destinations||[]);setStandaloneIds(cached?.standaloneIds);setCreating(false);setManaging(false);setSetup(null);setHistory(null);setStockTotals([]);setReceipt(null);
  if(recovering){setLoading(false);return()=>{active=false;abort.abort()}}
  const work=checkoutId?readXPayJson(pocketApiUrl('/api/pocket/xpay?id='+encodeURIComponent(checkoutId)),{signal:abort.signal},true):request({action:'mine'})
  void work.then(b=>{if(!active)return;if(checkoutId){setSelected(b.checkout);setPayDestination(b.checkout.destinations.some((d:XPayDestination)=>d.id===location.state?.xpayDestination)?location.state.xpayDestination:b.checkout.destinations[0]?.id||'')}else{setDestinations(b.destinations);setStandaloneIds(b.standaloneIds);setCheckouts(b.checkouts)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false;abort.abort()}
 },[checkoutId,identity.user?.id,recovering,reload,stockManagement])
 const execute=async(fn:()=>Promise<void>)=>{if(action.current)return;action.current=true;setBusy(true);setError('');try{await fn()}catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{action.current=false;setBusy(false)}}
 const adoptCheckout=(checkout:XPayCheckout)=>{setCheckouts(old=>[checkout,...old.filter(c=>c.id!==checkout.id)]);setSelected(checkout);setIds(checkout.destinations.map(d=>d.id));setName(checkout.name)}
 const create=()=>execute(async()=>{const b=await request({action:'create',name,key:createKey.current});adoptCheckout(b.checkout);setCreating(false);setManaging(true)})
 const remove=()=>execute(async()=>{if(!selected)return;await requestPocketPaymentApproval();const approval=takePocketPaymentApproval();if(!approval)throw Error('Confirm deletion again.');await request({action:'delete',id:selected.id},approval);setCheckouts(old=>old.filter(c=>c.id!==selected.id));setSelected(null);setDeleting(false)})
 const configure=async(next:string[])=>{if(!selected)return;await requestPocketPaymentApproval();const approval=takePocketPaymentApproval();if(!approval)throw Error('Confirm these changes again.');const b=await request({action:'configure',id:selected.id,version:selected.version||0,destinationIds:next},approval);adoptCheckout(b.checkout)}
 const beginSetup=(kind:'bank'|'wallet'|'stablecoins',replaceId='')=>execute(async()=>{if(!selected)return;const b=await request({action:'begin-setup',id:selected.id,kind});setSetupKey(b.key);setSetupReplace(replaceId);setSetup(kind)})
 const setupDone=async(id:string)=>{const b=await request({action:'mine'});const added=b.destinations.find((d:XPayDestination)=>d.id===id);if(!added)throw Error('Receiving option is not ready. Try again.');setDestinations(b.destinations);await configure([...(selected?.destinations||[]).filter(d=>d.kind!==added.kind&&d.id!==setupReplace).map(d=>d.id),id]);setSetup(null)}
 const adoptLegacy=(d:XPayDestination)=>execute(async()=>{const b=await request({action:'adopt',destinationId:d.id});adoptCheckout(b.checkout)})
 const openHistory=()=>{setStockTotals([]);setHistory([]);return execute(async()=>{const b=await request({action:'history',...(selected?{id:selected.id}:{})});setHistory(b.payments)})}
 const historyOpen=history!==null
 useEffect(()=>{if(!historyOpen)return;let active=true,reading=false;const refresh=async()=>{if(reading||document.visibilityState==='hidden')return;reading=true;try{const b=await request({action:'history',...(selected?{id:selected.id}:{})});if(active)setHistory(b.payments)}catch{/* Keep the last verified rows during a quiet refresh. */}finally{reading=false}};const timer=window.setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)}},[historyOpen,selected?.id,identity.user?.id])
 const pay=()=>{const d=selected?.destinations.find(d=>d.id===payDestination);if(!d)return;
  const tag='xpay_checkout_id='+encodeURIComponent(selected!.id)
  const network=d.networks?.includes(payNetwork)?payNetwork:d.networks?.[0]||'base'
  if(isPocketNativeRuntime()){setNativePayment({destination:d,network:network as PocketNetwork});return}
  const url=d.kind==='xstocks'?'https://pocket.hashpaylink.com/xpay/'+d.id+'?'+tag:'https://app.hashpaylink.com/pos/ng?merchant_id='+encodeURIComponent(d.id)+'&n='+encodeURIComponent(network)+'&'+tag
  window.location.assign(url)
 }
 const origin=xpayOrigin(location.state),home=xpayHome(location.state)
 const exit=()=>navigate(xpayReturnPath(location.state,home),{state:{xpayOrigin:origin},replace:true})
 const back=()=>{if(busy||deleting)return;setError('');if(receipt)setReceipt(null);else if(history)setHistory(null);else if(setup)setSetup(null);else if(creating)setCreating(false);else if(managing)setManaging(false);else if(selected&&!checkoutId)setSelected(null);else exit()}
 usePocketXPayBack(back)
 const stepKey=receipt?'receipt':history?'history:'+selected?.id:setup?'setup:'+setup:creating?'create':managing?'manage:'+selected?.id:selected?'qr:'+selected.id:'list'
 const refreshEnabled=!checkoutId&&!creating&&!managing&&!setup&&!receipt&&(!selected||historyOpen)
 useEffect(()=>{if(!refreshEnabled||publicCheckout)return;let live=true;const unregister=registerPocketRefreshHandler(async()=>{const b=await request(historyOpen?{action:'history',...(selected?{id:selected.id}:{})}:{action:'mine'});if(!live)return;if(historyOpen)setHistory(b.payments);else{setCheckouts(b.checkouts);setDestinations(b.destinations);setStandaloneIds(b.standaloneIds)}});return()=>{live=false;unregister()}},[refreshEnabled,publicCheckout,historyOpen,selected?.id,identity.user?.id])
 const childState={xpayOrigin:origin,xpayReturnTo:location.pathname}
 const startCreate=()=>{if(stockManagement)return;createKey.current=crypto.randomUUID();setName('');setIds([]);setManaging(false);setSelected(null);setCreating(true);setError('')}
 const loose=destinations.filter(d=>!stockManagement&&(!standaloneIds||standaloneIds.includes(d.id))&&!checkouts.some(c=>c.destinations.some(x=>x.id===d.id)))
 const content=<>
  {!history&&<PocketFlowHeader centered wideActions title={history?'Payment history':setup==='stablecoins'?'USDC':setup==='bank'?'Bank or mobile money':setup==='wallet'?(stockManagement?'XStocks':'USDC or stocks'):creating?'Create terminal':managing?'Payment options':stockManagement?'Manage XPay':'XPay'} rightAction={!checkoutId&&!history&&!setup&&!creating&&!managing?<div className="flex items-center gap-1">{!selected&&!stockManagement&&<button aria-label="Create QR" className="flex h-10 w-10 items-center justify-center" disabled={busy} onClick={startCreate}><PlusIcon className="h-5 w-5"/></button>}<button aria-label="Payment history" className="flex h-10 w-10 items-center justify-center" disabled={busy} onClick={()=>void openHistory()}><History className="h-5 w-5"/></button></div>:undefined} onBack={back}/>}
  {recovering?<Suspense fallback={<PocketRecentActivitySkeleton/>}><BankCheckout checkoutId={checkoutId} merchantId={resumeMerchant} merchantName="XPay" currency="NGN" assets={[]} resumeId={resumeId} onClose={exit}/></Suspense>:receipt?<PocketPaymentSuccess receipt={receipt} onDone={()=>setReceipt(null)}/>:history?<><PocketActivityPanel renderHeader={actions=><><PocketFlowHeader centered wideActions title="Payment history" onBack={back} rightAction={actions}/>{stockManagement&&stockTotals.length>0&&<section aria-label="Stocks received" className="space-y-2"><p className="text-xs text-gray-500">Total received</p>{stockTotals.map(total=><p key={total.symbol} className="text-sm font-semibold">{total.amount} {total.symbol}</p>)}</section>}</>} hideHeading incomingPos view="all" rows={history.map(p=>({eventId:p.id,txHash:p.hash||'',chain:p.network,payer:'',memo:'XPay payment',activityLabel:p.merchantName||selected?.name||'XPay payment',amount:p.amount,assetSymbol:p.asset,ts:p.createdAt,source:'xpay',direction:'in' as const,paycrestStatus:p.state,bankSettlementStatus:p.bankDelivery,...(['NGN','UGX'].includes(p.asset)?{fiatCurrency:p.asset as 'NGN'|'UGX',amountNgn:p.amount}:{})}))} authenticated={identity.authenticated} busy={busy} error={error} onRefund={async()=>''}/>
  </>:setup?<Suspense fallback={<PocketRecentActivitySkeleton/>}>{setup==='stablecoins'?<PocketXPayUsdcSetup key={setupKey} initialNetworks={selected?.destinations.find(d=>d.id===setupReplace)?.networks} onSave={async networks=>{const result=await request({action:'setup-usdc',key:setupKey,networks});await setupDone(result.merchant.merchant_id)}}/>:setup==='bank'?<BankSetup key={setupKey} setupKey={setupKey} name={selected?.name||name} onCreated={setupDone}/>:<WalletSetup stocksOnly={stockManagement} key={setupKey} setupKey={setupKey} initialAssets={selected?.destinations.find(d=>d.id===setupReplace)?.assets||[]} name={selected?.name||name} reservedAssets={(selected?.destinations||[]).filter(d=>d.kind!=='xstocks').flatMap(d=>d.assets)} onCreated={setupDone}/>}</Suspense>:loading?<PocketRecentActivitySkeleton/>:checkoutId&&selected?<>
   <h2 className="text-center text-lg font-semibold">{selected.name}</h2>
   <p className="text-center text-xs text-gray-500">Choose how to pay</p>
   {selected.destinations.map(d=><label key={d.id} className="flex min-h-20 items-center gap-3 py-3"><input className="shrink-0 accent-black dark:accent-white" type="radio" name="destination" checked={payDestination===d.id} onChange={()=>setPayDestination(d.id)}/><span><span className="block text-sm font-semibold">{d.kind==='bank'?'Bank or mobile money':d.kind==='xstocks'?'XStocks & USDC on X Layer':'USDC on Stablecoins'}</span><span className="mt-1 block text-xs text-gray-500">{xpayDestinationDetail(d)}</span><span className="mt-2 flex gap-2">{d.assets.map(symbol=>{const asset=[stockUsdc,...stockAssets].find(a=>a.symbol===symbol);return asset?<img key={symbol} src={asset.icon||(symbol==='USDC'?'/brand/usdc-circle-logo.png':undefined)} alt={symbol} className="h-6 w-6 rounded-full"/>:null})}</span></span></label>)}
   {selected.destinations.find(d=>d.id===payDestination)?.kind==='stablecoins'&&<PocketSelect ariaLabel="Receiving network" value={selected.destinations.find(d=>d.id===payDestination)?.networks?.includes(payNetwork)?payNetwork:selected.destinations.find(d=>d.id===payDestination)?.networks?.[0]||'base'} options={(selected.destinations.find(d=>d.id===payDestination)?.networks||['base']).map(value=>({value,label:value==='arbitrum'?'Arbitrum':value==='arc'?'Arc':value==='ethereum'?'Ethereum':value==='polygon'?'Polygon':value==='solana'?'Solana':'Base'}))} onChange={setPayNetwork}/>}
   <button className={cta} onClick={()=>pay()} disabled={!payDestination}>Continue</button><PocketGetApp/>
  </>:creating?<>
   <div className="min-h-0 flex-1"><label className="block text-xs font-semibold">Business name<input aria-label="Business name" className="mt-2 min-h-12 w-full rounded-xl bg-gray-100 px-3 text-sm dark:bg-[#121212]" maxLength={60} value={name} onChange={e=>{setName(e.target.value);createKey.current=crypto.randomUUID()}}/></label></div>
   <button className={cta+' shrink-0'} disabled={busy||!name.trim()} onPointerDown={event=>event.preventDefault()} onClick={()=>void create()}>{busy?'Creating...':'Create terminal'}</button>
  </>:managing&&selected?<>
   <p className="text-sm font-semibold">{selected.name}</p>
   {selected.destinations.length>0&&<section aria-label="Current payment options" className="divide-y divide-gray-100 dark:divide-[#262626]">{selected.destinations.filter(d=>!stockManagement||d.kind==='xstocks').map(d=><div key={d.id} className="flex min-h-20 items-center gap-4 py-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-[#121212]">{d.kind==='bank'?<Landmark className="h-5 w-5"/>:<Coins className="h-5 w-5"/>}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title(d)}</p><p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{d.kind==='bank'?'Receive '+d.currency:'Pocket · '+d.assets.join(', ')}</p></div><button aria-label={'Change '+title(d)} className="min-h-11 px-2 text-xs font-semibold" disabled={busy} onClick={()=>void beginSetup(d.kind==='xstocks'?'wallet':d.kind==='stablecoins'?'stablecoins':'bank',d.id)}>Change</button><button aria-label={'Remove '+title(d)} className="min-h-11 px-2 text-xs font-semibold text-red-500" disabled={busy} onClick={()=>void execute(()=>configure(selected.destinations.filter(x=>x.id!==d.id).map(x=>x.id)))}>Remove</button></div>)}</section>}
   {paymentOptions.some(option=>(!stockManagement||option.kind==='wallet')&&!selected.destinations.some(d=>d.kind===option.destinationKind))&&<>
    <p className="text-sm font-semibold">{selected.destinations.length?'Add payment option':'How do you want to get paid?'}</p>
    <section aria-label="Add payment option" className="divide-y divide-gray-100 dark:divide-[#262626]">{paymentOptions.filter(option=>(!stockManagement||option.kind==='wallet')&&!selected.destinations.some(d=>d.kind===option.destinationKind)).map(({kind,title,detail,Icon})=><button key={kind} type="button" disabled={busy} onClick={()=>void beginSetup(kind)} className="flex min-h-20 w-full items-center gap-4 py-4 text-left disabled:opacity-50">
     <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-[#121212]"><Icon className="h-5 w-5"/></span>
     <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{stockManagement&&kind==='wallet'?'XStocks':title}</span><span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">{stockManagement&&kind==='wallet'?'Receive stocks in your XStocks wallet.':detail}</span></span>
     <ChevronRight className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"/>
    </button>)}</section>
   </>}
   <p className="text-xs text-gray-500">Accept up to 3 assets. Changes apply to new payments for this business only.</p>
   <button className={cta} disabled={busy} onClick={()=>setManaging(false)}>Done</button>
  </>:selected?<>
   <h2 className="text-center text-sm font-semibold">{selected.name}</h2>
   <div ref={qr} className="mx-auto w-fit rounded-2xl bg-white p-5"><QRCodeCanvas value={'https://pocket.hashpaylink.com/xpay/checkout/'+selected.id} size={1024} style={{width:224,height:224}} marginSize={2}/></div>
   {!selected.destinations.length&&<p className="text-center text-xs text-gray-500">Add a payment option to start accepting payments.</p>}
   <button className="min-h-11 w-full text-xs font-semibold" onClick={()=>{setName(selected.name);setManaging(true)}}>Payment options</button>
   <p className="text-center text-xs text-gray-500">XPay · Scan. Pay. Done.</p>
   <button className={cta} onClick={()=>void execute(async()=>{await navigator.clipboard.writeText('https://pocket.hashpaylink.com/xpay/checkout/'+selected.id);setCopied(true)})}>{copied?'Copied':'Copy link'}</button>
   <button className="min-h-11 w-full text-xs font-semibold" disabled={busy} onClick={()=>void execute(async()=>{const canvas=qr.current?.querySelector('canvas');if(canvas)await downloadPocketQr(canvas)})}>Download QR</button>
   {!stockManagement&&<button className="min-h-11 w-full text-xs font-semibold text-red-500" onClick={()=>setDeleting(true)}>Delete QR</button>}
  </>:<>
   <section aria-label="XPay QRs" className="divide-y divide-gray-100 dark:divide-[#262626]">{checkouts.map(c=><button key={c.id} className="flex min-h-20 w-full items-center gap-4 py-4 text-left" onClick={()=>{setCopied(false);setSelected(c)}}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-[#121212]"><QrCode className="h-5 w-5"/></span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span><ChevronRight className="h-4 w-4 shrink-0 text-gray-500"/></button>)}{loose.map(d=><button key={d.id} className="flex min-h-20 w-full items-center gap-4 py-4 text-left" onClick={()=>void adoptLegacy(d)}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-[#121212]"><QrCode className="h-5 w-5"/></span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{d.name}</span><ChevronRight className="h-4 w-4 shrink-0 text-gray-500"/></button>)}</section>
   {!checkouts.length&&!loose.length&&!error&&<p className="py-8 text-center text-xs text-gray-500">{stockManagement?'Create your business QR in XPay under Stablecoins, then enable stock payments here.':'Your saved QRs will appear here. Tap + to create one.'}</p>}
  </>}
  {nativePayment&&selected&&<Suspense fallback={<PocketBottomSheet title="XPay" onClose={()=>setNativePayment(null)}><div role="status" aria-label="Preparing payment" className="h-72 animate-pulse rounded-xl bg-gray-100 dark:bg-white/10"/></PocketBottomSheet>}>{nativePayment.destination.kind==='xstocks'?<NativeStockPayment key={identity.user?.id+':'+selected.id+':'+nativePayment.destination.id} checkoutId={selected.id} merchantId={nativePayment.destination.id} onClose={()=>setNativePayment(null)}/>:<NativePayment key={identity.user?.id+':'+selected.id+':'+nativePayment.destination.id+':'+nativePayment.network} checkoutId={selected.id} destination={nativePayment.destination} network={nativePayment.network} onClose={()=>setNativePayment(null)}/>}</Suspense>}
  {error&&<p role="alert" className="text-xs text-red-500">{error}</p>}{error&&!busy&&!selected&&!creating&&!setup&&<button className="min-h-11 w-full text-xs font-semibold" onClick={()=>setReload(n=>n+1)}>Try again</button>}
  {deleting&&<PocketBottomSheet title="Delete QR" showCloseButton dismissOnBackdrop={false} dismissible={!busy} onClose={()=>setDeleting(false)}><h2 className="text-lg font-semibold">Delete this QR?</h2><p className="my-4 text-sm text-gray-500">New scans will stop working. Existing payments and receipts remain available.</p><button className={cta} disabled={busy} onClick={()=>void remove()}>{busy?'Confirming\u2026':'Delete QR'}</button></PocketBottomSheet>}
 </>
 return publicCheckout?<main className="mx-auto max-w-md space-y-5 px-4 py-8 text-gray-950 dark:text-white"><p className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold"><CPurseIcon size={26} title=""/>Pocket</p>{content}<PocketKycPrompt/></main>:<PocketRouteShell refreshEnabled={refreshEnabled} navigationDisabled={busy} rail={origin} scrollKey={stepKey} fixedPage={setup==='wallet'||creating} active="xpay" onSelect={tab=>navigate(origin==='xstocks'?xStockNavPath(tab):POCKET_BASE_PATH+(tab==='home'?POCKET_ROUTES.home:tab==='bills'?POCKET_ROUTES.bills:tab==='profile'?POCKET_ROUTES.profile:POCKET_ROUTES.activity))}>{content}</PocketRouteShell>
}
