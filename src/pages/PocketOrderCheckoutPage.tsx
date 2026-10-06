import {useEffect,useState} from 'react'
import {useNavigate,useParams} from 'react-router-dom'
import PocketPaymentChoices from '../pocket/components/PocketPaymentChoices'
import {CPurseIcon} from '../pocket/components/CPurseIcon'
import PocketSelect from '../pocket/components/PocketSelect'
import type {XPayDestination} from '../pocket/lib/pocketUnifiedXPay'
import PocketBottomSheet from '../pocket/components/PocketBottomSheet'
import '../pocket/pocketTheme.css'

export default function PocketOrderCheckoutPage(){
 const {orderId=''}=useParams(),navigate=useNavigate()
 const [order,setOrder]=useState<{id:string;merchant:string;cents:number}|null>(null)
 const [asset,setAsset]=useState<'USDC'|'NVDAx'>('USDC'),[rail,setRail]=useState<'circle'|'xlayer'>('circle')
 const [destinations,setDestinations]=useState<XPayDestination[]>([]),[network,setNetwork]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 function open(url:string){
  if(!/^\/pay\/c\/(?:chkx_[a-f0-9]{24}|chk_[a-zA-Z0-9]{8,40})(?:\?attempt=[a-zA-Z0-9_-]+)?$/.test(url))throw Error('Unable to open payment.')
  navigate(url,{replace:true})
 }
 useEffect(()=>{let active=true;void fetch('/api/demo/food/orders?purpose=selection&id='+encodeURIComponent(orderId),{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Unable to load order.');if(active){if(d.checkoutUrl)open(d.checkoutUrl);else {setOrder({...d.order,id:orderId});setDestinations(d.destinations||[]);let saved;try{saved=JSON.parse(sessionStorage.getItem('pocket.checkout.choice:'+orderId)||'null')}catch{}const first=d.destinations?.find((option:XPayDestination)=>option.id===saved?.rail)||d.destinations?.[0];if(first){setRail(first.id);setAsset(first.assets.includes(saved?.asset)?saved.asset:first.assets[0]);setNetwork(first.networks?.includes(saved?.network)?saved.network:first.networks?.[0]||'')}}}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[orderId])
 useEffect(()=>{if(order?.id===orderId&&destinations.length)try{sessionStorage.setItem('pocket.checkout.choice:'+orderId,JSON.stringify({rail,asset,network}))}catch{}},[orderId,order,rail,asset,network,destinations])
 async function proceed(){setBusy(true);setError('');try{const r=await fetch('/api/demo/food/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:orderId,asset,rail,network})}),d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Unable to open payment.');open(d.checkoutUrl)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <PocketBottomSheet fullScreen desktopCentered title="Pay with Pocket" dismissible={false} showCloseButton={false} onClose={()=>{}}>
  <p className="mb-7 flex items-center justify-center gap-2 text-sm font-semibold"><CPurseIcon size={26} title=""/>Pocket</p>
  <p className="mb-3 text-center text-sm text-gray-500">{order?.merchant||'Loading order...'}</p>
  {order&&<>
   <p className="mb-7 text-center text-3xl font-semibold">${(order.cents/100).toFixed(2)}</p>
   <PocketPaymentChoices destinations={destinations} value={rail} onChange={id=>{const d=destinations.find(d=>d.id===id);if(d){setRail(id as 'circle'|'xlayer');setAsset(d.assets[0] as 'USDC'|'NVDAx');setNetwork(d.networks?.[0]||'')}}} network={network} onNetworkChange={setNetwork}/>
   {rail==='xlayer'&&(destinations.find(d=>d.id===rail)?.assets.length||0)>1&&<PocketSelect ariaLabel="Payment asset" value={asset} options={(destinations.find(d=>d.id===rail)?.assets||[]).map(value=>({value,label:value==='NVDAx'?'NVIDIA xStock (NVDAx)':value}))} onChange={value=>setAsset(value as 'USDC'|'NVDAx')}/>}
   <p className="my-5 text-xs text-gray-500">Review the amount and fees before confirming payment.</p>
  </>}
  {error&&<p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
  <button className="pocket-cta-primary w-full" disabled={!order||!destinations.length||busy} onClick={()=>void proceed()}>{busy?'Opening wallet...':'Continue'}</button>
  <button className="mt-4 w-full text-center text-sm text-gray-500" onClick={()=>navigate('/demo/food')}>Back to store</button>
 </PocketBottomSheet>
}
