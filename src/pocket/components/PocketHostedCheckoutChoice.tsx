import {MoneyText,MoneyAmount} from '../../components/MoneyText'
import usePocketIdentity from '../hooks/usePocketIdentity'
import {useEffect,useRef,useState} from 'react'
import PocketBottomSheet from './PocketBottomSheet'
import PocketSelect from './PocketSelect'
import CheckoutPaymentMethods from '../../components/CheckoutPaymentMethods'
import {checkoutPriceLabel} from '../../lib/checkoutPricing'
import {selectHostedCheckoutOption,type CheckoutSelectionView} from '../../lib/checkoutSelection'
import {useCheckoutExpiry,CheckoutCountdown} from '../../components/CheckoutExpiry'
import {pocketApiUrl} from '../lib/pocketRoutes'
const names:Record<string,string>={base:'Base',arc:'Arc',arbitrum:'Arbitrum',solana:'Solana',ethereum:'Ethereum',polygon:'Polygon',xlayer:'X Layer',bsc:'BNB Chain'}
export default function PocketHostedCheckoutChoice({checkout,onSelected,onClose,onBack,initialMethods=false}:{checkout:CheckoutSelectionView;onSelected:(path:string)=>void;onClose:()=>void;onBack?:()=>void;initialMethods?:boolean}){
 const {getAccessToken}=usePocketIdentity()
 const cashEnabled=checkout.paymentMethods?.includes('cash_balance')===true
 const stablecoinsEnabled=checkout.paymentMethods?.includes('stablecoins')!==false
 const [cash,setCash]=useState(cashEnabled&&checkout.paymentMethod==='cash_balance')
 const [methods,setMethods]=useState(initialMethods)
 const available=stablecoinsEnabled?checkout.options.filter(o=>!o.unavailableReason):[]
 const [choice,setChoice]=useState(available.find(o=>o.network===checkout.selected?.network&&o.asset===checkout.selected?.asset)||available.find(o=>o.network===checkout.defaultNetwork)||available[0])
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const lock=useRef(false),abort=useRef<AbortController|null>(null)
 useEffect(()=>()=>abort.current?.abort(),[])
 const seconds=useCheckoutExpiry(checkout.expiresAt),expired=seconds===0
 const networks=[...new Set(available.map(o=>o.network))],assets=available.filter(o=>o.network===choice?.network)
 async function proceed(){
  if(lock.current||expired||cash&&!cashEnabled||!cash&&!choice)return
  lock.current=true;setBusy(true);setError('');const controller=new AbortController();abort.current=controller;let handedOff=false
  try{const token=await getAccessToken();if(!token)throw Error('Sign in to Pocket again.');const path=await selectHostedCheckoutOption(checkout.id,cash?{network:'base',asset:'USDC'}:choice!,pocketApiUrl('/api/v2/checkouts'),controller.signal,checkout.selectedCheckoutId,{accessToken:token,paymentMethod:cash?'cash_balance':'stablecoins'});if(!controller.signal.aborted){handedOff=true;onSelected(path)}}
  catch(e){if(!controller.signal.aborted)setError((e as Error).message||'Payment could not be prepared.')}
  finally{if(!controller.signal.aborted&&!handedOff){lock.current=false;setBusy(false)}}
 }
 return <PocketBottomSheet quietBackdrop title={methods?'Payment methods':cash?'Cash balance':'Stablecoins'} layer={initialMethods?95:85} onClose={onClose} onBack={methods?(onBack||(initialMethods?onClose:()=>setMethods(false))):initialMethods?()=>setMethods(true):undefined} showCloseButton dismissOnBackdrop={false} dismissible={!busy}>
  <h2 className="mb-3 text-center text-base font-semibold">{checkout.merchantName}</h2>
  <><p className="text-center text-2xl font-semibold"><MoneyText>{checkoutPriceLabel(checkout.currency?{currency:checkout.currency,amount:checkout.amount}:undefined,checkout.amount+' '+(choice?.asset||''))}</MoneyText></p><CheckoutCountdown seconds={seconds}/></>
  {expired?<p role="alert" className="my-5 text-center text-sm text-gray-500">Payment session expired. Start a new checkout.</p>:methods?<CheckoutPaymentMethods stablecoinsEnabled={stablecoinsEnabled&&available.length>0} onStablecoins={()=>{setCash(false);setMethods(false);setError('')}} onCash={cashEnabled?()=>{setCash(true);setMethods(false);setError('')}:undefined}/>:<>
   <div className="mt-5 space-y-4">{cash?<div className="flex min-h-14 items-center justify-between rounded-xl border border-gray-100 px-3.5 dark:border-white/15"><span className="text-sm text-gray-500">Pay with</span><span className="text-sm font-semibold">Cash balance</span></div>:<>
    <div><p className="mb-2 text-xs text-gray-500">Network</p><PocketSelect ariaLabel="Payment network" showNetworkBalances={false} value={choice?.network||''} options={networks.map(value=>({value,label:names[value]||value}))} disabled={busy} onChange={network=>{setChoice(available.find(o=>o.network===network)!);setError('')}} layer={105}/></div>
    <div><p className="mb-2 text-xs text-gray-500">Pay with</p><PocketSelect ariaLabel="Payment asset" showNetworkBalances={false} value={choice?.asset||''} options={assets.map(o=>({value:o.asset,label:o.asset}))} disabled={busy} onChange={asset=>{setChoice(assets.find(o=>o.asset===asset)!);setError('')}} layer={105}/></div>
   </>}</div>
   {error&&<p role="alert" className="mt-4 text-center text-xs text-gray-500">{error}</p>}
   <button className="pocket-cta-primary mt-6 flex w-full items-center justify-center gap-2" type="button" aria-busy={busy} disabled={busy||cash&&!cashEnabled||!cash&&!choice} onClick={()=>void proceed()}>{busy?<span role="status" aria-label="Preparing payment" className="h-4 w-24 animate-pulse rounded bg-current/20"/>:'Continue'}</button>
   {!initialMethods&&<button type="button" disabled={busy} onClick={()=>setMethods(true)} className="mt-2 min-h-11 w-full text-xs font-medium">Change payment method</button>}
  </>}
 </PocketBottomSheet>
}
