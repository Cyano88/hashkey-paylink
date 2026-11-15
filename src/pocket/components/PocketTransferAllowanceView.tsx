import usePocketLimitDisplay from '../hooks/usePocketLimitDisplay'
import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {pocketApiUrl,POCKET_BASE_PATH,POCKET_ROUTES} from '../lib/pocketRoutes'
import {PERSONAL_BANK_DAILY_USD} from '../../lib/purchaseLimits'
import type {PocketBankPayoutLimit} from '../api/pocketSpendingLimitsClient'
type Allowance={level:string;paymentLevel?:string;dailyLimitUsd:number;remainingUsd:number}
export default function PocketTransferAllowanceView({getAccessToken,bank}:{getAccessToken:()=>Promise<string|null>;bank?:PocketBankPayoutLimit|null}) {
 const reader=useRef(getAccessToken);reader.current=getAccessToken
 const [data,setData]=useState<Allowance|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),navigate=useNavigate(),display=usePocketLimitDisplay()
 useEffect(()=>{let active=true;const controller=new AbortController();setError(false)
  const read=async()=>{try{const token=await reader.current();if(!token)throw Error();const r=await fetch(pocketApiUrl('/api/pocket/kyc'),{method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action:'limits'}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])}),b=await r.json();if(!r.ok||!b.ok||!Number.isFinite(b.dailyLimitUsd)||!Number.isFinite(b.remainingUsd))throw Error();if(active){setData(b);setError(false)}}catch{if(active)setError(true)}}
  void read();const refresh=()=>{if(document.visibilityState==='visible')void read()},timer=setInterval(refresh,30000);window.addEventListener('online',refresh)
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('online',refresh)}
 },[retry])
 const advanced=(data?.paymentLevel||data?.level)==='advanced',verified=data?.level&&data.level!=='none'
 return <article className="rounded-3xl bg-white p-5 dark:bg-[#0D0D0D]">
  <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Personal bank transfers</h2>{data&&<span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold '+(advanced?'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300':'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300')}>{advanced?'Advanced verified':verified?'Basic verified':'Verification needed'}</span>}</div>
  {data?<><p className="mt-4 text-[28px] font-semibold tracking-tight">{display.fromUsd(data.remainingUsd)}</p><p className="mt-1 text-xs text-gray-500">Remaining today</p>
   <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10" aria-hidden="true"><div className="h-full rounded-full bg-blue-600" style={{width:(data.dailyLimitUsd?Math.max(0,Math.min(100,(data.dailyLimitUsd-data.remainingUsd)/data.dailyLimitUsd*100)):0)+'%'}}/></div>
   <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs"><span className="text-gray-500">Daily allowance</span><span className="font-medium">{display.fromUsd(data.dailyLimitUsd)}</span></div>
  </>:error?<button className="mt-4 text-xs font-medium" onClick={()=>setRetry(n=>n+1)}>Could not load allowance. Try again.</button>:<div role="status" aria-label="Loading transfer allowance" className="mt-4 h-9 w-40 animate-pulse rounded bg-gray-100 dark:bg-white/10"/>}
  {bank&&<div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-gray-100 pt-3 text-xs dark:border-white/10"><span className="text-gray-500">{data?'Available per transfer':'Bank route capacity'}</span><span className="font-medium">{display.fromUsd(data?Math.min(bank.maxUsdc,data.remainingUsd):bank.maxUsdc)}</span><p className="w-full text-[11px] leading-5 text-gray-500">Live bank capacity and your remaining allowance both apply.</p></div>}
  {data&&!advanced&&<div className="mt-4 rounded-2xl bg-blue-50 p-4 dark:bg-blue-500/10"><p className="text-xs font-semibold">Unlock {display.fromUsd(PERSONAL_BANK_DAILY_USD.advanced)} daily</p><p className="mt-1 text-[11px] leading-5 text-gray-600 dark:text-gray-400">{verified?'Complete Advanced identity verification to increase your personal transfer allowance.':'Complete Basic verification first, then Advanced for the higher allowance.'}</p><button className="mt-3 min-h-10 text-xs font-semibold text-blue-700 dark:text-blue-300" onClick={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.profile+'?feature=kyc'+(verified?'&level=advanced':''))}>{verified?'Complete Advanced verification':'Verify your identity'}</button></div>}
  {data&&advanced&&<p className="mt-4 text-[11px] leading-5 text-gray-500">Your Advanced allowance is active. Online and QR purchases are counted separately.</p>}
  {data&&error&&<button onClick={()=>setRetry(n=>n+1)} className="mt-3 text-xs text-gray-500">Showing your last allowance. Tap to refresh</button>}
 </article>
}
