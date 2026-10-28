import {useEffect,useState} from 'react'

export function checkoutSecondsLeft(expiresAt:string|undefined,now=Date.now()) {
  const expiry=Date.parse(expiresAt||'')
  return Number.isFinite(expiry)?Math.max(0,Math.ceil((expiry-now)/1000)):null
}
export function useCheckoutExpiry(expiresAt?:string) {
  const [now,setNow]=useState(Date.now)
  useEffect(()=>{
    const update=()=>setNow(Date.now())
    update()
    if(!expiresAt)return
    const timer=setInterval(update,1000)
    document.addEventListener('visibilitychange',update)
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update)}
  },[expiresAt])
  return checkoutSecondsLeft(expiresAt,now)
}
export function CheckoutCountdown({seconds}:{seconds:number|null}) {
  if(seconds===null)return null
  return <p role="timer" aria-live="off" className="mt-3 text-center text-xs tabular-nums text-gray-500">{seconds===0?'Checkout expired':`Time left ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}</p>
}
export function CheckoutExpired({returnUrl}:{returnUrl?:string}) {
  const safe=returnUrl&&/^https:\/\//i.test(returnUrl)?returnUrl:undefined
  return <section className="mx-auto w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 text-center dark:border-white/10 dark:bg-[#101114]"><h1 className="text-xl font-semibold">Checkout expired</h1><p className="mt-3 text-sm text-gray-500">Return to the store to start a new checkout.</p>{safe&&<a href={safe} className="mt-6 flex min-h-12 items-center justify-center rounded-full bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Back to store</a>}</section>
}
