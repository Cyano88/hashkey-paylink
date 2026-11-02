import {useEffect,useRef,useState} from 'react'
import PocketBottomSheet from './PocketBottomSheet'
import PocketSelect from './PocketSelect'
import {PocketWebPaymentIdentity} from './PocketWebPaymentIdentity'
import {checkoutPriceLabel} from '../../lib/checkoutPricing'
import {selectHostedCheckoutOption,type CheckoutSelectionView} from '../../lib/checkoutSelection'
import {useCheckoutExpiry,CheckoutCountdown} from '../../components/CheckoutExpiry'
import {pocketApiUrl} from '../lib/pocketRoutes'

const names:Record<string,string>={base:'Base',arc:'Arc',arbitrum:'Arbitrum',solana:'Solana',ethereum:'Ethereum',polygon:'Polygon',xlayer:'X Layer',bsc:'BNB Chain'}
export default function PocketHostedCheckoutChoice({checkout,onSelected,onClose}:{checkout:CheckoutSelectionView;onSelected:(path:string)=>void;onClose:()=>void}){
 const [choice,setChoice]=useState(checkout.options.find(o=>o.network===checkout.selected?.network&&o.asset===checkout.selected?.asset)||checkout.options.find(o=>o.network===checkout.defaultNetwork)||checkout.options[0])
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const lock=useRef(false),abort=useRef<AbortController|null>(null)
 useEffect(()=>()=>abort.current?.abort(),[])
 const seconds=useCheckoutExpiry(checkout.expiresAt),expired=seconds===0
 const networks=[...new Set(checkout.options.map(o=>o.network))],assets=checkout.options.filter(o=>o.network===choice?.network)
 async function proceed(){
  if(lock.current||expired||!choice||choice.unavailableReason)return
  lock.current=true;setBusy(true);setError('');const controller=new AbortController();abort.current=controller
  try{const path=await selectHostedCheckoutOption(checkout.id,choice,pocketApiUrl('/api/v2/checkouts'),controller.signal);if(!controller.signal.aborted)onSelected(path)}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error&&e.name==='TimeoutError'?'This is taking longer than usual. Continue to check your checkout.':(e as Error).message)}
  finally{if(!controller.signal.aborted){lock.current=false;setBusy(false)}}
 }
 return <PocketBottomSheet title="Choose payment" onClose={onClose} showCloseButton dismissOnBackdrop={false} dismissible={!busy}>
  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10"><PocketWebPaymentIdentity name={checkout.merchantName} imageUrl={checkout.brandImageUrl}/></div>
  <h2 className="text-center text-sm font-semibold">{checkout.merchantName}</h2>
  <p className="mt-3 text-center text-3xl font-semibold tracking-tight">{checkoutPriceLabel(checkout.currency?{currency:checkout.currency,amount:checkout.amount}:undefined,checkout.amount+' '+(choice?.asset||''))}</p>
  {checkout.title&&<p className="mt-2 text-center text-xs text-gray-500">{checkout.title}</p>}
  <CheckoutCountdown seconds={seconds}/>
  {checkout.settlementMode&&checkout.settlementMode!=='usdc'&&<p className="mt-3 text-center text-xs text-gray-500">Merchant receives {checkout.settlementMode.toUpperCase()}. You pay with the asset below.</p>}
  {expired?<p role="alert" className="my-5 text-center text-sm text-gray-500">Payment session expired. Start a new checkout.</p>:<div className="mt-5 space-y-4">
   <div><p className="mb-2 text-xs font-medium text-gray-500">Network</p><PocketSelect ariaLabel="Payment network" showNetworkBalances={false} value={choice?.network||''} options={networks.map(value=>({value,label:names[value]||value}))} disabled={busy||!!checkout.selected} onChange={network=>{setChoice(checkout.options.find(o=>o.network===network)!);setError('')}} layer={95}/></div>
   <div><p className="mb-2 text-xs font-medium text-gray-500">Pay with</p><PocketSelect ariaLabel="Payment asset" showNetworkBalances={false} value={choice?.asset||''} options={assets.map(o=>({value:o.asset,label:o.asset+(o.unavailableReason?' (Unavailable)':'')}))} disabled={busy||!!checkout.selected} onChange={asset=>{setChoice(assets.find(o=>o.asset===asset)!);setError('')}} layer={95}/></div>
   {choice?.unavailableReason&&<p role="status" className="text-center text-xs leading-5 text-gray-500">{choice.unavailableReason}</p>}
  </div>}
  {error&&<p role="alert" className="mt-4 text-center text-xs leading-5 text-gray-500">{error}</p>}
  {busy&&<div role="status" aria-label="Preparing payment" className="mt-4 h-4 animate-pulse rounded bg-gray-100 dark:bg-white/10"/>}
  <button className="pocket-cta-primary mt-6 w-full" type="button" disabled={busy||expired||!choice||!!choice.unavailableReason} onClick={()=>void proceed()}>Continue</button>
 </PocketBottomSheet>
}
