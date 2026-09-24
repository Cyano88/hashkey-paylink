import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePrivyLoginLauncher } from '../../lib/PrivyLoginProvider'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketStockWallet from '../hooks/usePocketStockWallet'
import PocketPaymentSecurityGate from '../components/PocketPaymentSecurityGate'
import PocketXPay from '../components/PocketXPay'
import { pocketApiUrl } from '../lib/pocketRoutes'
import { CPurseIcon } from '../components/CPurseIcon'
import '../pocketTheme.css'
function Payment(){const wallet=usePocketStockWallet();return <PocketXPay wallet={wallet} checkout/>}
export default function PocketXPayCheckoutPage(){
 const {merchantId=''}=useParams(),identity=usePocketIdentity(),login=usePrivyLoginLauncher()
 const [merchant,setMerchant]=useState<{name:string}|null>(null),[error,setError]=useState('')
 useEffect(()=>{let active=true;const abort=new AbortController();setMerchant(null);setError('');void fetch(pocketApiUrl('/api/pocket/xstocks/xpay?id='+encodeURIComponent(merchantId)),{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Checkout unavailable.');if(active)setMerchant(d.merchant)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false;abort.abort()}},[merchantId])
 return <main className="mx-auto w-full max-w-md px-5 py-10 text-gray-950 dark:text-white"><p className="mb-8 flex items-center justify-center gap-2 text-sm font-bold"><CPurseIcon size={28} title=""/>Pocket</p>{error?<p role="alert" className="text-center text-sm">{error}</p>:!merchant?<div role="status" aria-label="Loading checkout" className="h-40 animate-pulse rounded-3xl bg-gray-100 dark:bg-white/10"/>:!identity.authenticated?<section className="rounded-3xl border border-gray-100 p-6 dark:border-white/10"><h1 className="text-xl font-bold">{merchant.name}</h1><p className="mt-3 text-sm text-gray-500">Pay with your XStocks balance.</p><button disabled={!identity.ready} onClick={()=>login?.requestLogin()} className="mt-6 min-h-12 w-full rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">Continue with email</button></section>:<PocketPaymentSecurityGate key={identity.user?.id} email={identity.email} getAccessToken={identity.getAccessToken}><Payment/></PocketPaymentSecurityGate>}<p className="mt-8 text-center text-[11px] text-gray-400">Hash PayLink checkout</p></main>
}
