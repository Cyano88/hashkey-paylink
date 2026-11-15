import {useEffect,useRef,useState} from 'react'
import {MoneyAmount} from '../../components/MoneyText'
import {POCKET_API} from '../lib/pocketSchemas'
import PocketCountrySelect from './PocketCountrySelect'
import {PocketSkeletonBar} from './PocketContentSkeletons'

type Details={country:'NG'|'UG';currency:'NGN'|'UGX';availableMaximum:number;asOf:number;estimated:boolean;network:'base';asset:'USDC'}
export default function PocketPaymentCountryLimits({purchases,getAccessToken}:{purchases:boolean;getAccessToken:()=>Promise<string|null>}){
 const [country,setCountry]=useState('NG'),[data,setData]=useState<Details|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0)
 const reader=useRef(getAccessToken);reader.current=getAccessToken
 useEffect(()=>{let active=true;const controller=new AbortController();setData(null);setError(false)
  const read=async()=>{try{const token=await reader.current();if(!token)throw Error();const response=await fetch(POCKET_API.spendingLimits+'?'+new URLSearchParams({country}),{headers:{authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])}),body=await response.json(),d=body.countryLimits
   if(!response.ok||body.ok!==true||d?.country!==country||d?.currency!==(country==='NG'?'NGN':'UGX')||!Number.isFinite(d.availableMaximum)||d.availableMaximum<=0||d.network!=='base'||d.asset!=='USDC')throw Error()
   if(active){setData(d);setError(false)}
  }catch{if(active)setError(true)}}
  void read();const refresh=()=>{if(document.visibilityState==='visible')void read()},timer=setInterval(refresh,30000);window.addEventListener('online',refresh)
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('online',refresh)}
 },[country,retry])
 return <section aria-label="Country payment availability" className="mt-6 space-y-4 border-t border-gray-100 pt-5 dark:border-white/10">
  <PocketCountrySelect ariaLabel="Country" value={country} onChange={setCountry} options={[{value:'NG',label:'Nigeria'},{value:'UG',label:'Uganda'}]}/>
  <p className="text-xs text-gray-500">{purchases?'Maximum per payment':'Maximum per transfer'}</p>
  {error?<button type="button" onClick={()=>setRetry(n=>n+1)} className="min-h-10 text-xs font-medium">Could not load limits. Try again.</button>:!data?<div role="status" aria-label="Loading country availability" className="flex items-center justify-between gap-4 py-4"><PocketSkeletonBar className="h-4 w-24"/><PocketSkeletonBar className="h-4 w-32"/></div>:<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-4"><p className="text-sm font-medium">{country==='NG'?'Bank transfer':purchases?'QR mobile money':'Mobile money'}</p><p className="text-right text-sm font-medium"><MoneyAmount currency={data.currency} amount={data.availableMaximum.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}/></p></div>}
  <p className="text-[11px] leading-5 text-gray-500">Limits are subject to change.</p>
  {purchases&&country==='UG'&&<p className="text-[11px] leading-5 text-gray-500">Online payments in Uganda are not available yet.</p>}
 </section>
}
