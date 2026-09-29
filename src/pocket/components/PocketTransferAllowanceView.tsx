import usePocketLimitDisplay from '../hooks/usePocketLimitDisplay'
import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {pocketApiUrl,POCKET_BASE_PATH,POCKET_ROUTES} from '../lib/pocketRoutes'
export default function PocketTransferAllowanceView({getAccessToken}:{getAccessToken:()=>Promise<string|null>}) {
 const display=usePocketLimitDisplay()
 const reader=useRef(getAccessToken);reader.current=getAccessToken
 const [data,setData]=useState<{level:string;dailyLimitNgn:number;remainingNgn:number}|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),navigate=useNavigate()
 useEffect(()=>{let active=true;setError(false);void(async()=>{try{const token=await reader.current();if(!token)throw Error();const r=await fetch(pocketApiUrl('/api/pocket/kyc'),{method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action:'limits'}),signal:AbortSignal.timeout(15000)}),b=await r.json();if(!r.ok||!b.ok)throw Error();if(active)setData(b)}catch{if(active)setError(true)}})();return()=>{active=false}},[retry])
 return <article className="rounded-2xl bg-white p-4 dark:bg-[#0D0D0D]"><h2 className="text-sm font-semibold">Bank transfers and XPay</h2>{data?<><p className="mt-2 text-xl font-semibold">{display.usdc(data.remainingNgn)} remaining</p>{display.secondary(data.remainingNgn)&&<p className="mt-1 text-xs text-gray-500">{display.secondary(data.remainingNgn)} remaining</p>}<p className="mt-1 text-xs text-gray-500">{display.usdc(data.dailyLimitNgn)} daily · Bills excluded</p>{data.level!=='advanced'&&<button className="mt-3 text-xs font-semibold" onClick={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.profile+'?feature=kyc'+(data.level==='basic'?'&level=advanced':''))}>{data.level==='basic'?'Get advanced verification':'Verify your identity'}</button>}</>:error?<button className="mt-2 text-xs" onClick={()=>setRetry(n=>n+1)}>Could not load allowance. Try again.</button>:<div role="status" aria-label="Loading transfer allowance" className="mt-3 h-8 animate-pulse rounded bg-gray-100 dark:bg-white/5"/>}</article>
}
