import {useState} from 'react'
import {QRCodeSVG} from 'qrcode.react'
import {checkoutHandoff} from '../lib/checkoutHandoff'
export default function CheckoutChoice({id,attempt,merchant,title,amount,onBrowser}:{id:string;attempt?:string;merchant:string;title?:string;amount:string;onBrowser:()=>void}) {
 const [opened,setOpened]=useState(false)
 const handoff=checkoutHandoff(id,attempt)
 const android=/Android/i.test(navigator.userAgent)
 return <section className="mx-auto w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 text-gray-950 dark:border-white/10 dark:bg-[#101114] dark:text-white sm:p-8">
  <p className="text-center text-sm font-medium">{merchant}</p>
  <h1 className="mt-4 break-words text-center text-3xl font-semibold tracking-tight">{amount || 'Payment request'}</h1>
  {title&&<p className="mt-2 text-center text-sm text-gray-500">{title}</p>}
  <div className="mt-8 space-y-3">
   <a href={android?handoff.android:handoff.url} onClick={event=>{setOpened(true);if(!android){event.preventDefault()}}} className="flex min-h-12 w-full items-center justify-center rounded-full bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Pay with Pocket</a>
   <button onClick={onBrowser} className="min-h-12 w-full rounded-full border border-gray-200 px-4 text-sm font-semibold dark:border-white/15">Continue in browser</button>
  </div>
  {opened&&<div className="mt-6 text-center"><div className="mx-auto w-fit rounded-2xl bg-white p-3"><QRCodeSVG value={handoff.url} size={160}/></div><p role="status" className="mt-3 text-xs leading-5 text-gray-500">Scan with Pocket to review this payment. You can also continue in this browser.</p><p className="mt-2 text-xs text-gray-500">Opening the app does not send money.</p></div>}
  <p className="mt-6 text-center text-xs text-gray-500">Secure checkout by Hash PayLink</p>
 </section>
}
