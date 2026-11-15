import {useEffect,useRef,useState} from 'react'
import {MoneyAmount} from '../../components/MoneyText'
import {POCKET_API} from '../lib/pocketSchemas'
import PocketCountrySelect from './PocketCountrySelect'
import PocketCountryFlag from './PocketCountryFlag'

type Row={id:string;name:string;minimum:number|null;providerMaximum:number|null;availableMaximum:number;available:boolean;planPriced:boolean}
type Details={country:'NG'|'UG';currency:'NGN'|'UGX';category:string;services:Row[]}
export default function PocketBillCountryLimits({category,getAccessToken}:{category:'airtime'|'data'|'tv'|'electricity';getAccessToken:()=>Promise<string|null>}){
 const [country,setCountry]=useState('NG'),[data,setData]=useState<Details|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0)
 const reader=useRef(getAccessToken);reader.current=getAccessToken
 useEffect(()=>{let active=true;const controller=new AbortController();setData(null);setError(false)
  const read=async()=>{try{const token=await reader.current();if(!token)throw Error();const query=new URLSearchParams({country,category,limits:'true'}),response=await fetch(POCKET_API.billsCatalog+'?'+query,{headers:{authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])}),body=await response.json(),d=body?.data?.limits
   if(!response.ok||body.ok!==true||d?.country!==country||d?.category!==category||d?.currency!==(country==='NG'?'NGN':'UGX')||!Array.isArray(d.services)||d.services.some((r:Row)=>!Number.isFinite(r.availableMaximum)||r.availableMaximum<0))throw Error()
   if(active){setData(d);setError(false)}
  }catch{if(active)setError(true)}}
  void read();const refresh=()=>{if(document.visibilityState==='visible')void read()},timer=setInterval(refresh,30000);window.addEventListener('online',refresh)
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('online',refresh)}
 },[country,category,retry])
 const money=(value:number)=> <MoneyAmount currency={data?.currency??(country==='NG'?'NGN':'UGX')} amount={value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}/>
 return <div className="mt-6 space-y-4 border-t border-gray-100 pt-5 dark:border-white/10">
  {category==='airtime'||category==='data'?<PocketCountrySelect ariaLabel="Country" value={country} onChange={setCountry} options={[{value:'NG',label:'Nigeria'},{value:'UG',label:'Uganda'}]}/>:<div className="flex items-center gap-3 text-sm font-semibold"><PocketCountryFlag code="NG"/>Nigeria</div>}
  {error?<button type="button" onClick={()=>setRetry(n=>n+1)} className="min-h-10 text-xs font-medium">Could not refresh limits. Try again.</button>:!data?<div role="status" aria-label="Loading country limits" className="divide-y divide-gray-100 dark:divide-white/10">{Array.from({length:category==='airtime'?4:3},(_,index)=><div key={index} aria-hidden="true" className="flex animate-pulse items-start justify-between gap-4 py-4"><span className="mt-1 h-4 w-20 rounded bg-gray-200/70 dark:bg-white/10"/><span className="space-y-2"><span className="block h-4 w-28 rounded bg-gray-200/70 dark:bg-white/10"/><span className="ml-auto block h-3 w-24 rounded bg-gray-200/70 dark:bg-white/10"/></span></div>)}</div>:null}
  {data&&!error&&<div className="divide-y divide-gray-100 dark:divide-white/10">{data.services.length?data.services.map(row=><div key={row.id} className="flex items-start justify-between gap-4 py-4">
   <p className="min-w-0 flex-1 text-sm font-medium">{row.name.replace(/\s+(Airtime VTU|Airtime|Data|Subscription|Payment)$/i,'')}</p><div className="shrink-0 text-right">
   <p className="text-sm font-medium">{row.available?<>{money(row.availableMaximum)}</>:'No payment available'}</p>
   {row.minimum!==null&&<p className="mt-1 text-xs text-gray-500">{row.planPriced?'Plans from ':'Minimum '}{money(row.minimum)}</p>}
  </div></div>):<p className="text-xs text-gray-500">No supported products are currently available.</p>}</div>}
  <p className="text-[11px] leading-5 text-gray-500">Maximums reflect your remaining allowance and provider limits. {category==='electricity'?'Your meter may have a lower limit. ':category==='data'||category==='tv'?'Available plans may cost less. ':''}Final quote applies.</p>
 </div>
}
