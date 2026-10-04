import {useLocation} from 'react-router-dom'
import type {XPayCheckout} from '../lib/pocketUnifiedXPay'
import {xpayDestinationDetail} from '../lib/pocketUnifiedXPay'

/** Preserve the reviewed options visually while a payment sheet owns interaction. */
export default function PocketXPayCheckoutBackdrop(){
 const {state}=useLocation(),checkout=state?.xpayCheckout as XPayCheckout|undefined
 if(!checkout?.destinations?.length)return null
 return <section aria-label="XPay payment options" style={{zIndex:84}} className="fixed inset-0 z-[84] overflow-y-auto bg-[#F5F5F7] px-5 pt-[calc(var(--pocket-safe-top)+2rem)] text-gray-950 dark:bg-black dark:text-white">
  <div className="mx-auto max-w-md space-y-5"><h1 className="text-center text-lg font-semibold">{checkout.name}</h1><p className="text-center text-xs text-gray-500">Choose how to pay</p>
   {checkout.destinations.map(d=><div key={d.id} className="flex min-h-20 items-center gap-3"><span aria-hidden className={'h-4 w-4 shrink-0 rounded-full border '+(d.id===state.xpayDestination?'border-4 border-gray-950 dark:border-white':'border-gray-400')}/><div><p className="text-sm font-semibold">{d.kind==='bank'?'Bank or mobile money':d.kind==='xstocks'?'XStocks & USDC · X Layer':'USDC · Stablecoins'}</p><p className="mt-1 text-xs text-gray-500">{xpayDestinationDetail(d)}</p></div></div>)}
  </div>
 </section>
}
