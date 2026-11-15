import PocketVerificationBadge from './PocketVerificationBadge'
import {PocketSkeletonBar} from './PocketContentSkeletons'
import usePocketLimitDisplay from '../hooks/usePocketLimitDisplay'
import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {pocketApiUrl,POCKET_BASE_PATH,POCKET_ROUTES} from '../lib/pocketRoutes'
import {PERSONAL_BANK_DAILY_USD} from '../../lib/purchaseLimits'
type Allowance={level:string;paymentLevel?:string;dailyLimitUsd:number;remainingUsd:number;usedUsd?:number}
export default function PocketTransferAllowanceView({purchases=false,verifiedLevel,getAccessToken}:{purchases?:boolean;verifiedLevel?:'none'|'basic'|'advanced';getAccessToken:()=>Promise<string|null>}) {
 const reader=useRef(getAccessToken);reader.current=getAccessToken
 const [data,setData]=useState<Allowance|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),navigate=useNavigate(),display=usePocketLimitDisplay()
 useEffect(()=>{let active=true;const controller=new AbortController();setError(false);setData(null)
  const read=async()=>{try{const token=await reader.current();if(!token)throw Error();const r=await fetch(pocketApiUrl('/api/pocket/kyc'),{method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action:purchases?'purchase_limits':'limits'}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])}),b=await r.json();if(!r.ok||!b.ok||!Number.isFinite(b.dailyLimitUsd)||!Number.isFinite(b.remainingUsd))throw Error();if(active){setData(b);setError(false)}}catch{if(active)setError(true)}}
  void read();const refresh=()=>{if(document.visibilityState==='visible')void read()},timer=setInterval(refresh,30000);window.addEventListener('online',refresh)
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('online',refresh)}
 },[retry,purchases])
 const badgeLevel=data?.level??verifiedLevel,advanced=(data?.paymentLevel||data?.level)==='advanced',verified=badgeLevel&&badgeLevel!=='none'
 return <article>
  <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
   {data?<span className="text-xs leading-4 text-gray-500">{display.fromUsd(data.dailyLimitUsd)} daily</span>:!error?<span role="status" aria-label={purchases?'Loading purchase allowance':'Loading transfer allowance'} aria-busy="true"><PocketSkeletonBar className="h-3 w-28"/></span>:null}
   {badgeLevel&&<PocketVerificationBadge level={!purchases&&badgeLevel==='advanced'?'advanced':verified?'basic':'none'}/>}
  </div>
  {data?<div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-gray-500"><span>{display.fromUsd(data.usedUsd??(data.dailyLimitUsd-data.remainingUsd))} used</span><span>{display.fromUsd(data.remainingUsd)} left</span></div>:error?<button className="mt-2 min-h-10 text-xs font-medium" onClick={()=>setRetry(n=>n+1)}>Could not load limits. Try again.</button>:<div aria-hidden="true" className="mt-2 flex justify-between gap-3"><PocketSkeletonBar className="h-3 w-24"/><PocketSkeletonBar className="h-3 w-24"/></div>}
  {!purchases&&data&&!advanced&&<button className="mt-2 min-h-10 text-xs font-semibold text-blue-700 dark:text-blue-300" onClick={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.profile+'?feature=kyc'+(verified?'&level=advanced':''),{state:{pocketProfileFrom:true}})}>{verified?<>Upgrade to {display.fromUsd(PERSONAL_BANK_DAILY_USD.advanced)} daily</>:'Complete Basic verification'}</button>}
  {purchases&&data&&!verified&&<button className="mt-2 min-h-10 text-xs font-semibold" onClick={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.profile+'?feature=kyc',{state:{pocketProfileFrom:true}})}>Complete Basic verification</button>}
  {data&&error&&<button onClick={()=>setRetry(n=>n+1)} className="mt-2 min-h-10 text-xs text-gray-500">Showing your last update. Tap to refresh</button>}
 </article>
}
