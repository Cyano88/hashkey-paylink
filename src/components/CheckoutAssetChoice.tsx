import CheckoutVerification,{checkoutVerificationLevel} from './CheckoutVerification'
import {MoneyText,MoneyAmount} from './MoneyText'
import {usePrivy} from '@privy-io/react-auth'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import {checkoutPriceLabel} from '../lib/checkoutPricing'
import {useState,useRef} from 'react'
import {useNavigate} from 'react-router-dom'
import CheckoutMerchant from './CheckoutMerchant'
import {CheckoutFooter,HashPayLinkCheckoutBrand} from './CheckoutChrome'
import {CheckoutCountdown,CheckoutExpired,useCheckoutExpiry} from './CheckoutExpiry'
const names:Record<string,string>={base:'Base',arc:'Arc',xlayer:'X Layer',arbitrum:'Arbitrum',solana:'Solana',bsc:'BNB Chain',ethereum:'Ethereum',polygon:'Polygon'}
import {selectHostedCheckoutOption,type CheckoutSelectionView} from '../lib/checkoutSelection'
export type {CheckoutSelectionView} from '../lib/checkoutSelection'
export default function CheckoutAssetChoice({checkout,returnUrl,mode='web',cash=false,qr}:{qr?:{currency?:string;onBack:()=>void;prepare:(choice:{network:string;asset:string},amount:string,token:string)=>Promise<string>};cash?:boolean;checkout:CheckoutSelectionView;returnUrl?:string;mode?:'web'|'pocket'}){
 const {ready,authenticated,getAccessToken,user}=usePrivy()
 const [verification,setVerification]=useState<'basic'|'advanced'|null>(null)
 const [qrAmount,setQrAmount]=useState('')
 const available=checkout.options.filter(o=>!o.unavailableReason)
 const navigate=useNavigate(),lock=useRef(false)
 const [choice,setChoice]=useState<CheckoutSelectionView['options'][number]|undefined>(available.find(o=>o.network===checkout.preparingOption?.network&&o.asset===checkout.preparingOption?.asset)||available.find(o=>o.network===checkout.selected?.network&&o.asset===checkout.selected?.asset)||available.find(o=>o.network===checkout.defaultNetwork)||available[0]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const seconds=useCheckoutExpiry(checkout.expiresAt)
 if(seconds===0)return <CheckoutExpired merchant={checkout.merchantName} brandImageUrl={checkout.brandImageUrl} returnUrl={returnUrl}/>
 const networks=[...new Set(available.map(o=>o.network))],assets=available.filter(o=>o.network===choice?.network)
 async function proceed(){
  if(lock.current||!cash&&(!choice||choice.unavailableReason))return;lock.current=true;setBusy(true);setError('')
  try{const token=authenticated?await getAccessToken():null;if((cash||qr)&&!token)throw Error('Sign in to continue.');if(qr){const path=await qr.prepare(cash?{network:'base',asset:'USDC'}:choice!,qrAmount,token!);navigate(path,{replace:true});return}const path=await selectHostedCheckoutOption(checkout.id,cash?{network:'base',asset:'USDC'}:choice!,undefined,undefined,checkout.selectedCheckoutId,token?{accessToken:token,paymentMethod:cash?'cash_balance':'stablecoins'}:undefined);navigate(path+(path.includes('?')?'&':'?')+(mode==='web'?'browser=1':'pocket=1'),{replace:true})}catch(e){const level=checkoutVerificationLevel(e);if(level)setVerification(level);setError(e instanceof Error&&e.name==='TimeoutError'?'This is taking longer than usual. Continue to check your checkout.':(e as Error).message)}finally{lock.current=false;setBusy(false)}
 }
 if(verification)return <main className="mx-auto max-w-md py-6"><HashPayLinkCheckoutBrand/><CheckoutVerification email={user?.email?.address||''} level={verification} expired={seconds===0} onBack={()=>setVerification(null)} onContinue={async()=>{setVerification(null);setError('')}}/><CheckoutFooter/></main>
 return <div className="mx-auto w-full max-w-md py-6"><HashPayLinkCheckoutBrand/><section className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#101114]">
  {!busy&&<button type="button" onClick={()=>qr?qr.onBack():navigate('/pay/c/'+checkout.id)} className="mb-4 min-h-11 text-sm font-medium">Back</button>}
  <CheckoutMerchant name={checkout.merchantName} logo={checkout.brandImageUrl}/>
  {!qr&&<h1 className="mt-5 text-center text-3xl font-semibold"><MoneyText>{checkoutPriceLabel(checkout.currency?{currency:checkout.currency,amount:checkout.amount}:undefined,checkout.amount+' '+(choice?.asset||''))}</MoneyText></h1>}
  {qr&&<label className="mt-5 block text-center text-sm text-gray-500">Amount ({cash?(qr.currency||checkout.currency):choice?.asset})<input aria-label="Payment amount" inputMode="decimal" placeholder="0.00" value={qrAmount} onChange={e=>{if(/^\d*(?:\.\d{0,6})?$/.test(e.target.value))setQrAmount(e.target.value)}} className="mt-3 w-full rounded-lg border-0 bg-transparent text-center text-4xl font-semibold text-gray-950 outline-none focus-visible:ring-2 focus-visible:ring-gray-300"/></label>}
  {checkout.title&&<p className="mt-2 text-center text-sm text-gray-500">{checkout.title}</p>}
  <CheckoutCountdown seconds={seconds}/>
  {cash?<div className="mt-7"><h2 className="text-sm font-semibold">Cash balance</h2><p className="mt-2 text-sm text-gray-500">Use your Pocket cash balance. You can top up before paying.</p>{!ready?<div aria-label="Restoring session" className="mt-4 h-20 animate-pulse rounded bg-gray-100"/>:!authenticated?<PocketEmailLogin context="checkout"/>:null}</div>:<fieldset disabled={busy||!!checkout.preparingOption||!!checkout.selected&&!checkout.canChange} className="mt-7 space-y-4">
   <label className="block text-sm">Payment network<select aria-label="Payment network" className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/15" value={choice?.network} onChange={e=>{setChoice(available.find(o=>o.network===e.target.value&&o.asset===choice?.asset)||available.find(o=>o.network===e.target.value)!);setError('')}}>{networks.map(n=><option key={n} value={n}>{names[n]||n}</option>)}</select></label>
   <label className="block text-sm">Pay with<select aria-label="Payment asset" className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/15" value={choice?.asset} onChange={e=>{setChoice(assets.find(o=>o.asset===e.target.value)!);setError('')}}>{assets.map(o=><option key={o.asset} value={o.asset}>{o.asset}{o.unavailableReason?' (Unavailable)':''}</option>)}</select></label>
  </fieldset>}
  {qr&&!cash&&(!ready?<div role="status" aria-label="Restoring session" className="mt-5 h-24 animate-pulse rounded bg-gray-100"/>:!authenticated?<div className="mt-6"><PocketEmailLogin context="checkout"/></div>:null)}
  {choice?.unavailableReason&&<p role="status" className="mt-5 text-center text-sm text-gray-500">{choice.unavailableReason}</p>}
  {error&&<p role="alert" className="mt-5 text-center text-sm text-gray-500">{error}</p>}
  {((!cash&&!qr)||ready&&authenticated)&&<button disabled={busy||Boolean(qr&&(!Number.isFinite(Number(qrAmount))||Number(qrAmount)<=0))||!cash&&(!choice||!!choice.unavailableReason)||cash&&(!ready||!authenticated)} onClick={()=>void proceed()} className="mt-6 min-h-12 w-full rounded-full bg-gray-950 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{busy?'Preparing checkout…':'Continue'}</button>}
 </section><CheckoutFooter/></div>
}
