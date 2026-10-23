import {useEffect,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {publicPosCheckoutUrl} from './NigerianPos'
export default function PublicPosCheckoutPage(){
 const [params]=useSearchParams(),id=params.get('merchant_id')||'',[error,setError]=useState('')
 useEffect(()=>{setError('');if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)){setError('This payment link is invalid.');return}let active=true;const abort=new AbortController();void fetch('/api/ng-pos?merchant_id='+encodeURIComponent(id),{signal:abort.signal}).then(async r=>{const data=await r.json();if(!r.ok||!data.ok||!data.merchant)throw Error(data.error||'Merchant unavailable.');if(active)window.location.replace(publicPosCheckoutUrl(data.merchant))}).catch(e=>{if(active)setError(e.message)});return()=>{active=false;abort.abort()}},[id])
 return <section className="mx-auto max-w-md py-12 text-center"><p className="text-sm font-bold">Pocket</p>{error?<p role="alert" className="mt-4 text-sm text-gray-500">{error}</p>:<div role="status" aria-label="Opening checkout" className="mt-6 h-40 animate-pulse rounded-3xl bg-gray-100 dark:bg-white/10"/>}</section>
}
