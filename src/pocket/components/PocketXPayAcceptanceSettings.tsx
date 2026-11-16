import {useRef,useState} from 'react'
import PocketNetworkMark from './PocketNetworkMark'
import {normalizeXPayAcceptance,xpayAvailableRoutes,type XPayAcceptance} from '../lib/xpayAcceptance'
import type {XPayCheckout} from '../lib/pocketUnifiedXPay'

const names:Record<string,string>={base:'Base',arbitrum:'Arbitrum',arc:'Arc',ethereum:'Ethereum',polygon:'Polygon',solana:'Solana'}
export default function PocketXPayAcceptanceSettings({checkout,onSave}:{checkout:XPayCheckout;onSave:(acceptance:XPayAcceptance)=>Promise<void>}){
 const available=xpayAvailableRoutes(checkout.destinations)
 const [selected,setSelected]=useState(()=>available.filter(r=>!checkout.acceptance||checkout.acceptance.routes.some(p=>p.destinationId===r.destinationId&&p.network===r.network&&p.asset===r.asset)))
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),saving=useRef(false)
 const has=(destinationId:string,network:string,asset:string)=>selected.some(r=>r.destinationId===destinationId&&r.network===network&&r.asset===asset)
 const valid=checkout.destinations.every(d=>d.kind==='xstocks'||selected.some(r=>r.destinationId===d.id))
 return <div className="space-y-5">
  <p className="text-sm text-gray-500">Choose what customers can pay with.</p>
  {checkout.destinations.filter(d=>d.kind!=='xstocks').map(d=><fieldset key={d.id} className="space-y-2">
   <legend className="mb-2 text-xs font-semibold text-gray-500">{d.kind==='bank'?'Receive '+d.currency:'Receive stablecoins'}</legend>
   {available.filter(r=>r.destinationId===d.id).map(r=><label key={r.network+':'+r.asset} className="flex min-h-16 items-center gap-3 rounded-2xl border border-gray-200 px-4 dark:border-[#262626]">
    <PocketNetworkMark network={r.network}/><span className="flex-1"><span className="block text-sm font-semibold">{r.asset}</span><span className="text-xs text-gray-500">{names[r.network]||r.network}</span></span>
    <input type="checkbox" aria-label={'Accept '+r.asset+' on '+names[r.network]+(d.kind==='bank'?' for '+d.currency:'')} disabled={busy} checked={has(r.destinationId,r.network,r.asset)} onChange={e=>setSelected(old=>e.target.checked?[...old,r]:old.filter(p=>p.destinationId!==r.destinationId||p.network!==r.network||p.asset!==r.asset))}/>
   </label>)}
  </fieldset>)}
  <div aria-label="Cash balance coming soon" className="flex min-h-14 items-center justify-between text-sm text-gray-500"><span>Cash balance</span><span className="text-xs">Coming soon</span></div>
  {error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
  <button className="pocket-cta-primary w-full" disabled={busy||!valid} onClick={async()=>{
   if(saving.current)return;saving.current=true;setBusy(true);setError('')
   try{await onSave(normalizeXPayAcceptance({version:1,cashBalance:false,routes:selected},checkout.destinations))}
   catch(e){setError(e instanceof Error?e.message:'Could not save payment options.')}
   finally{saving.current=false;setBusy(false)}
  }}>{busy?<span role="status" aria-label="Saving payment options" className="mx-auto block h-4 w-24 animate-pulse rounded bg-current opacity-25"/>:'Save changes'}</button>
 </div>
}
