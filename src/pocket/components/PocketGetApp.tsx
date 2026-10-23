import { useEffect, useState } from 'react'
import { isPocketNativeRuntime, pocketApiUrl } from '../lib/pocketRoutes'
export default function PocketGetApp(){
 const [url,setUrl]=useState('')
 useEffect(()=>{if(isPocketNativeRuntime())return;let active=true;const abort=new AbortController();void fetch(pocketApiUrl('/api/pocket/checkout-config'),{signal:abort.signal}).then(r=>r.ok?r.json():null).then(data=>{if(!active||!data?.playStoreUrl)return;const u=new URL(data.playStoreUrl);if(u.origin==='https://play.google.com'&&u.pathname==='/store/apps/details'&&u.searchParams.get('id')==='com.hashpaylink.pocket')setUrl(u.href)}).catch(()=>{});return()=>{active=false;abort.abort()}},[])
 return url?<a href={url} className="mt-5 flex min-h-11 items-center justify-center text-xs font-semibold">Get Pocket</a>:null
}
