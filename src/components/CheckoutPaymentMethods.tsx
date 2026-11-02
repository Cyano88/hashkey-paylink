import type {ReactNode} from 'react'
import {CircleStackIcon, CreditCardIcon, BuildingLibraryIcon, CheckIcon} from '@heroicons/react/24/outline'

/** Presentation only: upcoming rails cannot select a route or initiate payment. */
export default function CheckoutPaymentMethods({children}:{children:ReactNode}) {
 return <section aria-label="Payment methods" className="space-y-3">
  <div className="overflow-hidden rounded-2xl border border-gray-950 dark:border-white/60">
   <div className="flex min-h-16 items-center gap-3 px-4 py-3">
    <span aria-hidden="true" className="flex h-10 w-14 shrink-0 items-center justify-center"><CircleStackIcon className="h-7 w-7"/></span>
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Stablecoins</p><p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Pay from your wallet</p></div>
    <CheckIcon aria-label="Selected payment method" className="h-5 w-5 shrink-0"/>
   </div>
   <div className="border-t border-gray-100 px-4 pb-4 pt-3 dark:border-white/10">{children}</div>
  </div>
  <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 dark:divide-white/10 dark:border-white/15">
   {([
    {name:'Card',Icon:CreditCardIcon},
    {name:'Google Pay',src:'/brand/payments/google-pay.svg'},
    {name:'Apple Pay',src:'/brand/payments/apple-pay.svg'},
    {name:'Bank transfer',Icon:BuildingLibraryIcon},
   ]).map(({name,src,Icon})=><button key={name} type="button" disabled aria-label={`${name} — Coming soon`} className="flex min-h-16 w-full cursor-not-allowed items-center gap-3 px-4 py-3 text-left">
    <span aria-hidden="true" className={'flex h-10 w-14 shrink-0 items-center justify-center '+(src?'rounded-lg bg-white':'text-gray-500 dark:text-gray-400')}>
     {src?<img src={src} alt="" className="h-7 w-10 object-contain"/>:Icon?<Icon className="h-7 w-7"/>:null}
    </span>
    <span className="min-w-0 flex-1 text-sm font-medium text-gray-600 dark:text-gray-300">{name}</span>
    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-400">Coming soon</span>
   </button>)}
  </div>
 </section>
}
