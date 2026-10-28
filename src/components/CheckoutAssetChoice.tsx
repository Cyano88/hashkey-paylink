import {useState,useRef} from 'react'
import {useNavigate} from 'react-router-dom'
import CheckoutMerchant from './CheckoutMerchant'
import {CheckoutFooter} from './CheckoutChrome'
import {CheckoutCountdown,CheckoutExpired,useCheckoutExpiry} from './CheckoutExpiry'
const names:Record<string,string>={base:'Base',arc:'Arc',xlayer:'X Layer',arbitrum:'Arbitrum',solana:'Solana',bsc:'BNB Chain',ethereum:'Ethereum',polygon:'Polygon'}
export type CheckoutSelectionView={defaultNetwork?:string;id:string;amount:string;merchantName:string;brandImageUrl?:string;title?:string;expiresAt:string;options:Array<{network:string;asset:string}>;selected?:{network:string;asset:string}}
export default function CheckoutAssetChoice({checkout,returnUrl}:{checkout:CheckoutSelectionView;returnUrl?:string}){
 const navigate=useNavigate(),lock=useRef(false)
 const [choice,setChoice]=useState(checkout.selected||checkout.options.find(o=>o.network===checkout.defaultNetwork)||checkout.options[0]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const seconds=useCheckoutExpiry(checkout.expiresAt)
 if(seconds===0)return <CheckoutExpired merchant={checkout.merchantName} brandImageUrl={checkout.brandImageUrl} returnUrl={returnUrl}/>
 const networks=[...new Set(checkout.options.map(o=>o.network))],assets=checkout.options.filter(o=>o.network===choice?.network)
 async function proceed(){
  if(lock.current||!choice)return;lock.current=true;setBusy(true);setError('')
  try{const r=await fetch('/api/v2/checkouts?id='+encodeURIComponent(checkout.id)+'&action=select-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(choice),signal:AbortSignal.timeout(25000)}),d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Payment could not be prepared.');if(!/^\/pay\/c\/chk(?:b|x)?_[a-zA-Z0-9]{8,40}(?:\?attempt=[a-zA-Z0-9_-]+)?$/.test(d.selectedCheckoutUrl))throw Error('Checkout could not be verified.');navigate(d.selectedCheckoutUrl,{replace:true})}catch(e){setError(e instanceof Error&&e.name==='TimeoutError'?'This is taking longer than usual. Continue to check your checkout.':(e as Error).message)}finally{lock.current=false;setBusy(false)}
 }
 return <div className="mx-auto w-full max-w-md"><section className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#101114]">
  <CheckoutMerchant name={checkout.merchantName} logo={checkout.brandImageUrl}/>
  <h1 className="mt-5 text-center text-3xl font-semibold">{checkout.amount} {choice?.asset}</h1>
  {checkout.title&&<p className="mt-2 text-center text-sm text-gray-500">{checkout.title}</p>}
  <CheckoutCountdown seconds={seconds}/>
  <fieldset disabled={busy||!!checkout.selected} className="mt-7 space-y-4">
   <label className="block text-sm">Payment network<select aria-label="Payment network" className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/15" value={choice?.network} onChange={e=>{setChoice(checkout.options.find(o=>o.network===e.target.value)!);setError('')}}>{networks.map(n=><option key={n} value={n}>{names[n]||n}</option>)}</select></label>
   <label className="block text-sm">Pay with<select aria-label="Payment asset" className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/15" value={choice?.asset} onChange={e=>{setChoice(assets.find(o=>o.asset===e.target.value)!);setError('')}}>{assets.map(o=><option key={o.asset} value={o.asset}>{o.asset}</option>)}</select></label>
  </fieldset>
  {error&&<p role="alert" className="mt-5 text-center text-sm text-gray-500">{error}</p>}
  <button disabled={busy||!choice} onClick={()=>void proceed()} className="mt-6 min-h-12 w-full rounded-full bg-gray-950 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{busy?'Preparing checkout…':'Continue'}</button>
 </section><CheckoutFooter/></div>
}
