import {CheckoutCountdown,CheckoutExpired,useCheckoutExpiry} from '../../components/CheckoutExpiry'
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
function Payment({merchantId,returnUrl,brandImageUrl}:{merchantId:string;returnUrl?:string;brandImageUrl?:string}){const wallet=usePocketStockWallet();return <PocketXPay wallet={wallet} checkout merchantOverride={merchantId} checkoutReturnUrl={returnUrl} checkoutBrandImageUrl={brandImageUrl}/>}
export default function PocketXPayCheckoutPage({merchantOverride,returnUrl,brandImageUrl}:{merchantOverride?:string;returnUrl?:string;brandImageUrl?:string}){
 const {merchantId:routeMerchantId=''}=useParams(),merchantId=merchantOverride||routeMerchantId,identity=usePocketIdentity(),login=usePrivyLoginLauncher()
 const [merchant,setMerchant]=useState<{name:string;expiresAt?:number}|null>(null),[error,setError]=useState('')
 useEffect(()=>{let active=true;const abort=new AbortController();setMerchant(null);setError('');void fetch(pocketApiUrl('/api/pocket/xstocks/xpay?id='+encodeURIComponent(merchantId)),{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Checkout unavailable.');if(active){if(/^xp_[0-9a-f-]{36}$/.test(d.terminalId||'')&&!new URLSearchParams(window.location.search).get('xpay_checkout_id')){window.location.replace('/xpay/checkout/'+d.terminalId);return}setMerchant(d.merchant)}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false;abort.abort()}},[merchantId])
 const seconds=useCheckoutExpiry(/^chkx_[a-f0-9]{24}$/.test(merchantId)&&merchant?.expiresAt?new Date(merchant.expiresAt).toISOString():undefined)
 if(seconds===0&&!identity.authenticated)return <CheckoutExpired merchant={merchant?.name} brandImageUrl={brandImageUrl} returnUrl={returnUrl}/>
 return <main className="fixed inset-0 z-[60] overflow-y-auto bg-white px-5 py-10 text-gray-950 dark:bg-black dark:text-white [&>section]:mx-auto [&>section]:max-w-md"><p className="mb-8 flex items-center justify-center gap-2 text-sm font-bold"><CPurseIcon size={28} title=""/>Pocket</p>{error?<p role="alert" className="text-center text-sm">{error}</p>:!merchant?<div role="status" aria-label="Loading checkout" className="h-40 animate-pulse rounded-3xl bg-gray-100 dark:bg-white/10"/>:!identity.authenticated?<section className="rounded-3xl border border-gray-100 p-6 dark:border-white/10"><h1 className="text-xl font-bold">{merchant.name}</h1><CheckoutCountdown seconds={seconds}/><p className="mt-3 text-sm text-gray-500">Pay with your supported Pocket balance.</p><button disabled={!identity.ready} onClick={()=>login?.requestLogin()} className="pocket-cta-primary mt-6 w-full">Continue with email</button></section>:<PocketPaymentSecurityGate key={identity.user?.id} email={identity.email} getAccessToken={identity.getAccessToken}><Payment merchantId={merchantId} returnUrl={returnUrl} brandImageUrl={brandImageUrl}/></PocketPaymentSecurityGate>}<p className="mt-8 text-center text-[11px] text-gray-400">Hash PayLink checkout</p></main>
}
