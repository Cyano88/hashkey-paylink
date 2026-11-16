import {xpayCoinNetworks,xpayCoinExecutable,XPAY_NETWORK_NAMES as names,type XPayCoin} from '../lib/xpayStablecoinOptions'
import {useRef,useState} from 'react'
import {CircleStackIcon,BuildingLibraryIcon,ChevronRightIcon} from '@heroicons/react/24/outline'
import {CheckoutUpcomingMethods} from '../../components/CheckoutPaymentMethods'
import PocketNetworkMark from './PocketNetworkMark'
import {normalizeXPayAcceptance,xpayAvailableRoutes,type XPayAcceptance} from '../lib/xpayAcceptance'
import type {XPayCheckout} from '../lib/pocketUnifiedXPay'

export default function PocketXPayAcceptanceSettings({asset='USDC',checkout,draft,onDraftChange,onSave,networkMode,onOpenNetworks,onBackNetworks,onFiatSetup}:{onDraftChange?:(draft:XPayAcceptance)=>void;asset?:XPayCoin;checkout:XPayCheckout;draft?:XPayAcceptance;onSave:(acceptance:XPayAcceptance)=>Promise<void>;networkMode:boolean;onOpenNetworks:(draft:XPayAcceptance)=>void;onBackNetworks:(draft:XPayAcceptance)=>void;onFiatSetup:(draft:XPayAcceptance)=>void}){
 const available=xpayAvailableRoutes(checkout.destinations)
 const bankIds=new Set(checkout.destinations.filter(d=>d.kind==='bank').map(d=>d.id))
 // Bank settlement keeps its existing executable funding route. It is not a
 // cash-balance capability and must not be presented as another payment method.
 const bankRoutes=available.filter(r=>bankIds.has(r.destinationId))
 const walletRoutes=available.filter(r=>!bankIds.has(r.destinationId))
 const [selected,setSelected]=useState(()=>walletRoutes.filter(r=>!(draft||checkout.acceptance)||(draft||checkout.acceptance)!.routes.some(p=>p.destinationId===r.destinationId&&p.network===r.network&&p.asset===r.asset)))
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),saving=useRef(false)
 const choices=walletRoutes.filter(r=>r.asset===asset)
 const pending=xpayCoinNetworks(asset).filter(network=>!choices.some(r=>r.network===network))
 const currentDraft=():XPayAcceptance=>({version:1,cashBalance:false,routes:[...selected,...bankRoutes]})
 const valid=checkout.destinations.every(d=>d.kind!=='stablecoins'||selected.some(r=>r.destinationId===d.id))
 return <div className="flex min-h-0 flex-1 flex-col gap-4">
  <div aria-label="Accepted payment options" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
   {!networkMode&&<div className="divide-y divide-gray-100 dark:divide-white/10">
    <button type="button" disabled={busy} onClick={()=>onOpenNetworks(currentDraft())} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
     <span aria-hidden="true" className="flex h-10 w-14 shrink-0 items-center justify-center"><CircleStackIcon className="h-7 w-7"/></span><span className="flex-1 text-sm font-semibold">Stablecoins</span><ChevronRightIcon className="h-5 w-5"/>
    </button>
    <button type="button" disabled={busy} onClick={()=>onFiatSetup({version:1,cashBalance:false,routes:[...selected,...bankRoutes]})} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
     <span aria-hidden="true" className="flex h-10 w-14 shrink-0 items-center justify-center"><BuildingLibraryIcon className="h-7 w-7"/></span><span className="flex-1 text-sm font-semibold">Receive fiat</span><ChevronRightIcon className="h-5 w-5"/>
    </button>
    <button type="button" disabled aria-label="Cash balance, Coming soon" className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
     <span aria-hidden="true" className="flex h-10 w-14 shrink-0 items-center justify-center text-gray-500"><BuildingLibraryIcon className="h-7 w-7"/></span><span className="min-w-0 flex-1 text-sm font-medium text-gray-600 dark:text-gray-300">Cash balance</span><span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-400">Coming soon</span>
    </button>
    <CheckoutUpcomingMethods plain/>
   </div>}
    {networkMode&&<fieldset id="xpay-accepted-networks" aria-label="Stablecoin networks" className="divide-y divide-gray-100 dark:divide-white/10">
     {choices.map(r=><label key={r.destinationId+':'+r.network+':'+r.asset} className="flex min-h-16 items-center gap-3 py-3">
      <PocketNetworkMark network={r.network}/><span className="flex-1"><span className="block text-sm font-semibold">{r.asset}</span><span className="text-xs text-gray-500">{names[r.network]||r.network}</span></span>
      <input type="checkbox" className="h-4 w-4 accent-black dark:accent-white" aria-label={'Accept '+r.asset+' on '+names[r.network]} disabled={busy||!walletRoutes.length} checked={!walletRoutes.length||selected.some(p=>p.destinationId===r.destinationId&&p.network===r.network&&p.asset===r.asset)} onChange={e=>{setError('');const next=e.target.checked?[...selected,r]:selected.filter(p=>p.destinationId!==r.destinationId||p.network!==r.network||p.asset!==r.asset);setSelected(next);onDraftChange?.({version:1,cashBalance:false,routes:[...next,...bankRoutes]})}}/>
     </label>)}
     {pending.map(network=><div key={network} className="flex min-h-16 items-center gap-3 py-3 text-gray-500"><PocketNetworkMark network={network}/><span className="flex-1 text-sm">{names[network]}</span><span className="text-xs">{xpayCoinExecutable(asset,network)?'Not enabled':'Coming soon'}</span></div>)}
    </fieldset>}
  </div>
  <div className="shrink-0 space-y-3">
   {error&&<p role="alert" className="text-center text-xs text-red-500">{error}</p>}
   <button className="pocket-cta-primary w-full" disabled={busy||!valid} onClick={async()=>{
    if(networkMode){onBackNetworks(currentDraft());return}
    if(saving.current)return;saving.current=true;setBusy(true);setError('')
    try{await onSave(normalizeXPayAcceptance({version:1,cashBalance:false,routes:[...selected,...bankRoutes]},checkout.destinations))}
    catch(e){if((e as {code?:string})?.code!=='POCKET_APPROVAL_CANCELLED')setError(e instanceof Error?e.message:'Could not save payment options.')}
    finally{saving.current=false;setBusy(false)}
   }}>{busy?<span role="status" aria-label="Saving payment options" className="mx-auto block h-4 w-24 animate-pulse rounded bg-current opacity-25"/>:networkMode?'Done':'Save changes'}</button>
  </div>
 </div>
}
