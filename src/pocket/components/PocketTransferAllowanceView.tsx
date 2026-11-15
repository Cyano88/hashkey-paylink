import {PocketSkeletonBar} from './PocketContentSkeletons'
import usePocketLimitDisplay from '../hooks/usePocketLimitDisplay'
import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {pocketApiUrl,POCKET_BASE_PATH,POCKET_ROUTES} from '../lib/pocketRoutes'
import {PERSONAL_BANK_DAILY_USD} from '../../lib/purchaseLimits'
import type {PocketBankPayoutLimit} from '../api/pocketSpendingLimitsClient'
type Allowance={level:string;paymentLevel?:string;dailyLimitUsd:number;remainingUsd:number;usedUsd?:number}
export default function PocketTransferAllowanceView({compact=false,purchases=false,verifiedLevel,getAccessToken,bank}:{compact?:boolean;purchases?:boolean;verifiedLevel?:'none'|'basic'|'advanced';getAccessToken:()=>Promise<string|null>;bank?:PocketBankPayoutLimit|null}) {
 const reader=useRef(getAccessToken);reader.current=getAccessToken
 const [data,setData]=useState<Allowance|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),navigate=useNavigate(),display=usePocketLimitDisplay()
 useEffect(()=>{let active=true;const controller=new AbortController();setError(false);setData(null)
  const read=async()=>{try{const token=await reader.current();if(!token)throw Error();const r=await fetch(pocketApiUrl('/api/pocket/kyc'),{method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action:purchases?'purchase_limits':'limits'}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])}),b=await r.json();if(!r.ok||!b.ok||!Number.isFinite(b.dailyLimitUsd)||!Number.isFinite(b.remainingUsd))throw Error();if(active){setData(b);setError(false)}}catch{if(active)setError(true)}}
  void read();const refresh=()=>{if(document.visibilityState==='visible')void read()},timer=setInterval(refresh,30000);window.addEventListener('online',refresh)
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('online',refresh)}
 },[retry,purchases])
 const badgeLevel=data?.level??verifiedLevel,advanced=(data?.paymentLevel||data?.level)==='advanced',verified=badgeLevel&&badgeLevel!=='none'
 return <article>
  <div className="flex items-center justify-between gap-3">{badgeLevel&&<span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold '+(verified?'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300':'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300')}>{!purchases&&badgeLevel==='advanced'?'Advanced verified':verified?'Basic verified':'Verification needed'}</span>}</div>
  {data?<><p className={compact?"mt-3 text-xl font-semibold tracking-tight":"mt-4 text-[28px] font-semibold tracking-tight"}>{display.fromUsd(data.dailyLimitUsd)}</p><p className="mt-1 text-xs text-gray-500">Daily allowance</p>
   <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10" aria-hidden="true"><div className="h-full rounded-full bg-blue-600" style={{width:(data.dailyLimitUsd?Math.max(0,Math.min(100,((data.usedUsd??(data.dailyLimitUsd-data.remainingUsd)))/data.dailyLimitUsd*100)):0)+'%'}}/></div>
   <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-gray-500"><span>{display.fromUsd((data.usedUsd??(data.dailyLimitUsd-data.remainingUsd)))} used</span><span>{display.fromUsd(data.remainingUsd)} left</span></div>
  </>:error?<button className="mt-4 text-xs font-medium" onClick={()=>setRetry(n=>n+1)}>Could not load allowance. Try again.</button>:<div role="status" aria-label={purchases?"Loading purchase allowance":"Loading transfer allowance"} aria-busy="true" className="mt-4"><PocketSkeletonBar className="h-9 w-44"/><PocketSkeletonBar className="mt-2 h-3 w-24"/><PocketSkeletonBar className="mt-5 h-1.5 w-full"/><div className="mt-3 flex justify-between"><PocketSkeletonBar className="h-3 w-24"/><PocketSkeletonBar className="h-3 w-24"/></div></div>}
  {!purchases&&<div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-gray-100 pt-3 text-xs dark:border-white/10"><span className="text-gray-500">Available per transfer</span><span className="font-medium">{!data&&!error?<PocketSkeletonBar className="h-3 w-24"/>:data&&bank?display.fromUsd(Math.min(bank.maxUsdc,data.remainingUsd)):"Quoted before transfer"}</span></div>}
  {!purchases&&data&&!advanced&&<div className="mt-6 border-t border-gray-100 pt-5 dark:border-white/10"><p className="text-xs font-semibold">Unlock {display.fromUsd(PERSONAL_BANK_DAILY_USD.advanced)} daily</p><p className="mt-1 text-[11px] leading-5 text-gray-600 dark:text-gray-400">{verified?'Complete Advanced identity verification to increase your personal transfer allowance.':'Complete Basic verification first, then Advanced for the higher allowance.'}</p><button className="mt-3 min-h-10 text-xs font-semibold text-blue-700 dark:text-blue-300" onClick={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.profile+'?feature=kyc'+(verified?'&level=advanced':''),{state:{pocketProfileFrom:true}})}>{verified?'Complete Advanced verification':'Verify your identity'}</button></div>}
  {!purchases&&data&&advanced&&<p className="mt-4 text-[11px] leading-5 text-gray-500">Separate from online and QR purchases.</p>}
  {purchases&&<p className={compact?"mt-3 text-[11px] leading-5 text-gray-500":"mt-6 text-xs leading-5 text-gray-500"}>{compact?'Shared online and QR allowance.':'Shared across online stores and QR payments. Resets at midnight, Lagos time.'}</p>}
  {purchases&&data&&!verified&&<button className="mt-4 min-h-10 text-xs font-semibold" onClick={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.profile+'?feature=kyc',{state:{pocketProfileFrom:true}})}>Complete Basic verification</button>}
  {data&&error&&<button onClick={()=>setRetry(n=>n+1)} className="mt-3 text-xs text-gray-500">Showing your last allowance. Tap to refresh</button>}
 </article>
}
