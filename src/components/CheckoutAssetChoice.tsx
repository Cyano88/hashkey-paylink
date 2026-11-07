import {checkoutPriceLabel} from '../lib/checkoutPricing'
import {useState,useRef} from 'react'
import {useNavigate} from 'react-router-dom'
import CheckoutMerchant from './CheckoutMerchant'
import {CheckoutFooter,HashPayLinkCheckoutBrand} from './CheckoutChrome'
import {CheckoutCountdown,CheckoutExpired,useCheckoutExpiry} from './CheckoutExpiry'
const names:Record<string,string>={base:'Base',arc:'Arc',xlayer:'X Layer',arbitrum:'Arbitrum',solana:'Solana',bsc:'BNB Chain',ethereum:'Ethereum',polygon:'Polygon'}
import {selectHostedCheckoutOption,type CheckoutSelectionView} from '../lib/checkoutSelection'
export type {CheckoutSelectionView} from '../lib/checkoutSelection'
export default function CheckoutAssetChoice({checkout,returnUrl,mode='web'}:{checkout:CheckoutSelectionView;returnUrl?:string;mode?:'web'|'pocket'}){
 const navigate=useNavigate(),lock=useRef(false)
 const [choice,setChoice]=useState<CheckoutSelectionView['options'][number]|undefined>(checkout.options.find(o=>o.network===checkout.preparingOption?.network&&o.asset===checkout.preparingOption?.asset)||checkout.options.find(o=>o.network===checkout.selected?.network&&o.asset===checkout.selected?.asset)||checkout.options.find(o=>o.network===checkout.defaultNetwork)||checkout.options[0]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const seconds=useCheckoutExpiry(checkout.expiresAt)
 if(seconds===0)return <CheckoutExpired merchant={checkout.merchantName} brandImageUrl={checkout.brandImageUrl} returnUrl={returnUrl}/>
 const networks=[...new Set(checkout.options.map(o=>o.network))],assets=checkout.options.filter(o=>o.network===choice?.network)
 async function proceed(){
  if(lock.current||!choice||choice.unavailableReason)return;lock.current=true;setBusy(true);setError('')
  try{const path=await selectHostedCheckoutOption(checkout.id,choice,undefined,undefined,checkout.selectedCheckoutId);navigate(path+(path.includes('?')?'&':'?')+(mode==='web'?'browser=1':'pocket=1'),{replace:true})}catch(e){setError(e instanceof Error&&e.name==='TimeoutError'?'This is taking longer than usual. Continue to check your checkout.':(e as Error).message)}finally{lock.current=false;setBusy(false)}
 }
 return <div className="mx-auto w-full max-w-md py-6"><HashPayLinkCheckoutBrand/><section className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#101114]">
  <CheckoutMerchant name={checkout.merchantName} logo={checkout.brandImageUrl}/>
  <h1 className="mt-5 text-center text-3xl font-semibold">{checkoutPriceLabel(checkout.currency?{currency:checkout.currency,amount:checkout.amount}:undefined,checkout.amount+' '+(choice?.asset||''))}</h1>
  {checkout.title&&<p className="mt-2 text-center text-sm text-gray-500">{checkout.title}</p>}
  <CheckoutCountdown seconds={seconds}/>
  <fieldset disabled={busy||!!checkout.preparingOption||!!checkout.selected&&!checkout.canChange} className="mt-7 space-y-4">
   <label className="block text-sm">Payment network<select aria-label="Payment network" className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/15" value={choice?.network} onChange={e=>{setChoice(checkout.options.find(o=>o.network===e.target.value&&o.asset===choice?.asset)||checkout.options.find(o=>o.network===e.target.value)!);setError('')}}>{networks.map(n=><option key={n} value={n}>{names[n]||n}</option>)}</select></label>
   <label className="block text-sm">Pay with<select aria-label="Payment asset" className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/15" value={choice?.asset} onChange={e=>{setChoice(assets.find(o=>o.asset===e.target.value)!);setError('')}}>{assets.map(o=><option key={o.asset} value={o.asset}>{o.asset}{o.unavailableReason?' (Unavailable)':''}</option>)}</select></label>
  </fieldset>
  {choice?.unavailableReason&&<p role="status" className="mt-5 text-center text-sm text-gray-500">{choice.unavailableReason}</p>}
  {error&&<p role="alert" className="mt-5 text-center text-sm text-gray-500">{error}</p>}
  <button disabled={busy||!choice||!!choice.unavailableReason} onClick={()=>void proceed()} className="mt-6 min-h-12 w-full rounded-full bg-gray-950 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{busy?'Preparing checkout…':'Continue'}</button>
 </section><CheckoutFooter/></div>
}
