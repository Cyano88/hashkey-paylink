import {CheckoutCountdown,CheckoutExpired,useCheckoutExpiry,checkoutSecondsLeft} from './CheckoutExpiry'
import CheckoutMerchant from './CheckoutMerchant'
import {CheckoutFooter,HashPayLinkCheckoutBrand} from './CheckoutChrome'
import {useEffect,useRef,useState} from 'react'
import {ArrowLeftIcon} from '@heroicons/react/24/outline'
import {QRCodeSVG} from 'qrcode.react'
import {pocketStoreUrl} from '../lib/pocketStoreUrl'
import {checkoutHandoff} from '../lib/checkoutHandoff'
import CheckoutPaymentMethods from './CheckoutPaymentMethods'
export default function CheckoutChoice({id,attempt,merchant,brandImageUrl,title,amount,onBrowser,onPocket,autoOpenPocket=false,expiresAt,returnUrl}:{onPocket?:()=>void;autoOpenPocket?:boolean;expiresAt?:string;returnUrl?:string;id:string;attempt?:string;merchant:string;brandImageUrl?:string;title?:string;amount:string;onBrowser:()=>void}) {
 const [opened,setOpened]=useState(autoOpenPocket)
 const fallback=new URLSearchParams(window.location.search).get('pocketFallback')==='1'
 const [stablecoins,setStablecoins]=useState(fallback||autoOpenPocket)
 const backNavigation=useRef<HTMLDivElement>(null)
 const methodNavigation=useRef<HTMLDivElement>(null)
 const focusNavigation=useRef(false)
 useEffect(()=>{if(focusNavigation.current){(stablecoins?backNavigation:methodNavigation).current?.querySelector<HTMLElement>('button')?.focus();focusNavigation.current=false}},[stablecoins])
 const changeStep=(next:boolean)=>{focusNavigation.current=true;setStablecoins(next);setOpened(false)}
 const [storeUrl,setStoreUrl]=useState('')
 useEffect(()=>{if(!fallback)return;const controller=new AbortController();void fetch('/api/pocket/checkout-config',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>setStoreUrl(pocketStoreUrl(data?.playStoreUrl))).catch(()=>{});return()=>controller.abort()},[fallback])
 const handoff=onPocket?null:checkoutHandoff(id,attempt)
 const seconds=useCheckoutExpiry(expiresAt)
 if(seconds===0)return <CheckoutExpired returnUrl={returnUrl} merchant={merchant} brandImageUrl={brandImageUrl}/>
 const android=/Android/i.test(navigator.userAgent)
 return <div className="mx-auto w-full max-w-md"><HashPayLinkCheckoutBrand/><section className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-950 dark:border-white/10 dark:bg-[#101114] dark:text-white sm:p-8">
  <div ref={backNavigation}>{stablecoins&&<button type="button" onClick={()=>changeStep(false)} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-sm font-medium text-gray-600 hover:text-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:text-white"><ArrowLeftIcon aria-hidden="true" className="h-4 w-4"/>Back</button>}</div>
  <CheckoutMerchant name={merchant} logo={brandImageUrl}/>
  <h1 className="mt-4 break-words text-center text-3xl font-semibold tracking-tight">{amount || 'Payment request'}</h1>
  {title&&<p className="mt-2 text-center text-sm text-gray-500">{title}</p>}
  <CheckoutCountdown seconds={seconds}/>
  <div ref={methodNavigation} className="mt-6">{!stablecoins?<CheckoutPaymentMethods onStablecoins={()=>{if(checkoutSecondsLeft(expiresAt)!==0)changeStep(true)}}/>:<div className="space-y-3" aria-label="Stablecoin payment options">
   <h2 className="pb-1 text-sm font-semibold">Pay with stablecoins</h2>
   {fallback&&storeUrl?<a href={storeUrl} className="flex min-h-12 w-full items-center justify-center rounded-full bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Get Pocket</a>:<a href={handoff?(android?handoff.android:handoff.url):'#'} onClick={event=>{if(checkoutSecondsLeft(expiresAt)===0){event.preventDefault();return}if(onPocket){event.preventDefault();onPocket();return}setOpened(true);if(!android){event.preventDefault()}}} className="flex min-h-12 w-full items-center justify-center rounded-full bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">{fallback?'Try opening Pocket':'Pay with Pocket'}</a>}
   <button onClick={()=>{if(checkoutSecondsLeft(expiresAt)!==0)onBrowser()}} className="min-h-12 w-full rounded-full border border-gray-200 px-4 text-sm font-semibold dark:border-white/15">Pay on web</button>
  </div>}</div>
  {stablecoins&&fallback&&<p role="status" className="mt-4 text-center text-xs leading-5 text-gray-500">{storeUrl?'Pocket did not open. Get Pocket or continue on web.':'Pocket did not open. You can retry or continue on web.'}</p>}
  {stablecoins&&opened&&handoff&&!android&&!fallback&&<div className="mt-6 text-center"><div className="mx-auto w-fit rounded-2xl bg-white p-3"><QRCodeSVG value={handoff.url} size={160}/></div><p role="status" className="mt-3 text-xs leading-5 text-gray-500">Scan with Pocket to review this payment. You can also continue in this browser.</p><p className="mt-2 text-xs text-gray-500">Opening the app does not send money.</p></div>}
 </section><CheckoutFooter/></div>
}
