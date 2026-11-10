import {HashPayLinkCheckoutBrand} from './CheckoutChrome'
import './developer-loading-skeleton.css'

/** Reuses the portal shimmer while matching the standalone seller form layout. */
export default function SellerVerificationSkeleton({fullPage=true}:{fullPage?:boolean}) {
 const content=<div role="status" aria-label="Loading seller verification" aria-busy="true" className={fullPage?'mx-auto max-w-xl py-8':'mt-4'}>
  <span className="sr-only">Loading seller verification</span>
  <div aria-hidden="true">
   {fullPage&&<><HashPayLinkCheckoutBrand/><div className="developer-shimmer h-8 w-56 max-w-full rounded-lg"/><div className="developer-shimmer mt-4 h-4 w-full rounded-lg"/><div className="developer-shimmer mt-2 h-4 w-3/4 rounded-lg"/></>}
   <div className={fullPage?'mt-8 space-y-5':'space-y-3'}><div className="developer-shimmer h-5 w-2/3 rounded-lg"/><div className="developer-shimmer h-12 w-full rounded-xl"/>{fullPage&&<div className="developer-shimmer h-12 w-44 rounded-full"/>}</div>
  </div>
 </div>
 return fullPage?<main className="developer-surface min-h-screen bg-white p-5 dark:bg-gray-950">{content}</main>:content
}
