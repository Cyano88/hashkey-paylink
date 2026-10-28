import {useEffect,useState} from 'react'
import {useNavigate,useParams,Link} from 'react-router-dom'

// Compatibility for old store links. All new orders open the hosted checkout directly.
export default function PocketOrderCheckoutPage(){
 const {orderId=''}=useParams(),navigate=useNavigate(),[error,setError]=useState('')
 useEffect(()=>{const controller=new AbortController();let active=true;const timer=setTimeout(()=>controller.abort(),20000)
  void fetch('/api/demo/food/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'prepare',requestId:orderId}),signal:controller.signal}).then(async response=>{
   const data=await response.json()
   if(!response.ok||!data.ok||!/^\/pay\/c\/(?:chk_[a-zA-Z0-9]{8,40}|chk[bx]_[a-f0-9]{24})(?:\?attempt=[a-zA-Z0-9_-]+)?$/.test(data.checkoutUrl))throw Error(data.error||'Unable to open checkout.')
   if(active)navigate(data.checkoutUrl,{replace:true})
  }).catch(e=>{if(active)setError(controller.signal.aborted?'Checkout took too long. Return to the store and try again.':e.message)}).finally(()=>clearTimeout(timer))
  return()=>{active=false;clearTimeout(timer);controller.abort()}
 },[orderId,navigate])
 return <main className="mx-auto w-full max-w-md p-6">{error?<><p role="alert" className="text-sm text-red-600">{error}</p><Link className="mt-5 block text-sm font-semibold" to="/launchroom">Back to store</Link></>:<div role="status" aria-label="Opening checkout" className="h-80 animate-pulse rounded-3xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5"/>}</main>
}
