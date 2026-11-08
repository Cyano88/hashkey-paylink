import usePocketIdentity from '../hooks/usePocketIdentity'
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
 const {getAccessToken}=usePocketIdentity()
 const [cash,setCash]=useState(checkout.paymentMethod==='cash_balance'||checkout.paymentMethods?.length===1&&checkout.paymentMethods[0]==='cash_balance')
 const available=checkout.options.filter(o=>!o.unavailableReason)
 const [choice,setChoice]=useState(available.find(o=>o.network===checkout.selected?.network&&o.asset===checkout.selected?.asset)||available.find(o=>o.network===checkout.defaultNetwork)||available[0])
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const lock=useRef(false),abort=useRef<AbortController|null>(null)
 useEffect(()=>()=>abort.current?.abort(),[])
 const seconds=useCheckoutExpiry(checkout.expiresAt),expired=seconds===0
 const networks=[...new Set(available.map(o=>o.network))],assets=available.filter(o=>o.network===choice?.network)
 async function proceed(){
  if(lock.current||expired||!cash&&(!choice||choice.unavailableReason))return
  lock.current=true;setBusy(true);setError('');const controller=new AbortController();abort.current=controller
  try{const token=cash?await getAccessToken():null;if(cash&&!token)throw Error('Sign in to Pocket again.');const path=await selectHostedCheckoutOption(checkout.id,cash?{network:'base',asset:'USDC'}:choice!,pocketApiUrl('/api/v2/checkouts'),controller.signal,checkout.selectedCheckoutId,cash?{accessToken:token!}:undefined);if(!controller.signal.aborted)onSelected(path)}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error&&e.name==='TimeoutError'?'This is taking longer than usual. Continue to check your checkout.':(e as Error).message)}
  finally{if(!controller.signal.aborted){lock.current=false;setBusy(false)}}
 }
 return <PocketBottomSheet title="Choose payment" onClose={onClose} showCloseButton dismissOnBackdrop={false} dismissible={!busy}>
  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10"><PocketWebPaymentIdentity name={checkout.merchantName} imageUrl={checkout.brandImageUrl}/></div>
  <h2 className="text-center text-sm font-semibold">{checkout.merchantName}</h2>
  <p className="mt-3 text-center text-3xl font-semibold tracking-tight">{checkoutPriceLabel(checkout.currency?{currency:checkout.currency,amount:checkout.amount}:undefined,checkout.amount+' '+(choice?.asset||''))}</p>
  {checkout.title&&<p className="mt-2 text-center text-xs text-gray-500">{checkout.title}</p>}
  <CheckoutCountdown seconds={seconds}/>
  {cash&&<p className="mt-3 text-center text-xs text-gray-500">Merchant receives NGN.</p>}
  {expired?<p role="alert" className="my-5 text-center text-sm text-gray-500">Payment session expired. Start a new checkout.</p>:<div className="mt-5 space-y-4">
   {checkout.paymentMethods?.includes('cash_balance')&&<div role="group" aria-label="Payment method" className="grid grid-cols-2 gap-2">{[{label:'Stablecoins',value:false},{label:'Cash balance',value:true}].filter(m=>checkout.paymentMethods?.includes(m.value?'cash_balance':'stablecoins')).map(m=><button key={m.label} type="button" aria-pressed={cash===m.value} disabled={busy||!!checkout.selected&&!checkout.canChange} onClick={()=>{setCash(m.value);setError('')}} className={'min-h-12 rounded-xl border px-3 text-sm font-medium '+(cash===m.value?'border-gray-950 dark:border-white':'border-gray-200 text-gray-500 dark:border-white/15')}>{m.label}</button>)}</div>}
   {!cash&&<><div><p className="mb-2 text-xs font-medium text-gray-500">Network</p><PocketSelect ariaLabel="Payment network" showNetworkBalances={false} value={choice?.network||''} options={networks.map(value=>({value,label:names[value]||value}))} disabled={busy||!!checkout.selected&&!checkout.canChange} onChange={network=>{setChoice(available.find(o=>o.network===network)!);setError('')}} layer={95}/></div>
   <div><p className="mb-2 text-xs font-medium text-gray-500">Pay with</p><PocketSelect ariaLabel="Payment asset" showNetworkBalances={false} value={choice?.asset||''} options={assets.map(o=>({value:o.asset,label:o.asset+(o.unavailableReason?' (Unavailable)':'')}))} disabled={busy||!!checkout.selected&&!checkout.canChange} onChange={asset=>{setChoice(assets.find(o=>o.asset===asset)!);setError('')}} layer={95}/></div>
   </>}{cash&&<p className="text-center text-xs text-gray-500">Pay from your Pocket cash balance.</p>}
   {choice?.unavailableReason&&<p role="status" className="text-center text-xs leading-5 text-gray-500">{choice.unavailableReason}</p>}
  </div>}
  {error&&<p role="alert" className="mt-4 text-center text-xs leading-5 text-gray-500">{error}</p>}
  {busy&&<div role="status" aria-label="Preparing payment" className="mt-4 h-4 animate-pulse rounded bg-gray-100 dark:bg-white/10"/>}
  <button className="pocket-cta-primary mt-6 w-full" type="button" disabled={busy||expired||!cash&&(!choice||!!choice.unavailableReason)} onClick={()=>void proceed()}>Continue</button>
 </PocketBottomSheet>
}
