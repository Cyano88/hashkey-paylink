import {useEffect,useRef,useState} from 'react'
import {PencilSquareIcon} from '@heroicons/react/24/outline'
import PocketRecentActivitySkeleton from './PocketRecentActivitySkeleton'

type Account={currency:string;bankName:string;accountNumber:string;accountName:string}
export default function PocketXPayReceivingAccount({load,onEdit,busy}:{load:()=>Promise<Account>;onEdit:()=>void;busy:boolean}){
 const read=useRef(load);read.current=load
 const [account,setAccount]=useState<Account>(),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{let active=true;setError('');void read.current().then(a=>{if(active)setAccount(a)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load your receiving account.')});return()=>{active=false}},[retry])
 if(error)return <div className="space-y-4"><p role="alert" className="text-xs text-red-500">{error}</p><button className="pocket-cta-primary w-full" onClick={()=>setRetry(n=>n+1)}>Try again</button></div>
 if(!account)return <PocketRecentActivitySkeleton/>
 return <section aria-label="Saved receiving account" className="rounded-2xl border border-gray-200 p-4 dark:border-[#262626]">
  <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Receiving account</h2><button aria-label="Edit receiving account" disabled={busy} onClick={onEdit} className="flex h-11 w-11 items-center justify-center disabled:opacity-50"><PencilSquareIcon className="h-5 w-5"/></button></div>
  <dl className="space-y-5">{[['Currency',account.currency],[account.currency==='NGN'?'Bank':'Provider',account.bankName],['Account number',account.accountNumber],['Account name',account.accountName]].map(([label,value])=><div key={label}><dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}</dl>
 </section>
}
