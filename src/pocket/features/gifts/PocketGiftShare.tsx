import {DocumentDuplicateIcon,CheckIcon} from '@heroicons/react/24/outline'
import {useEffect,useRef,useState} from 'react'
import {issuePocketGiftCode} from '../../api/pocketGiftsClient'
import {giftLink} from './pocketGift'
export default function PocketGiftShare({id,secret,getAccessToken}:{id:string;secret:string;getAccessToken():Promise<string|null>}) {
 const tokenRef=useRef(getAccessToken);tokenRef.current=getAccessToken
 const [code,setCode]=useState(''),[error,setError]=useState(''),[copied,setCopied]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{let active=true;setError('');void tokenRef.current().then(token=>{if(!token)throw Error('Sign in to view your gift code.');return issuePocketGiftCode({id,secret,accessToken:token})}).then(value=>{if(active)setCode(value)}).catch(error=>{if(active)setError(error instanceof Error?error.message:'Code unavailable. You can still share the link.')});return()=>{active=false}},[id,secret,retry])
 const copy=async(value:string,kind:string)=>{try{await navigator.clipboard.writeText(value);setCopied(kind)}catch{setError('Could not copy. Please try again.')}}
 return <div className="mt-5 text-center">
  {code?<div className="flex items-center justify-center gap-2"><p aria-label="Gift code" className="text-xl font-semibold tracking-[0.14em] tabular-nums">{code}</p><button type="button" aria-label="Copy gift code" className="flex h-10 w-10 items-center justify-center rounded-full" onClick={()=>void copy(code,'code')}>{copied==='code'?<CheckIcon className="h-4 w-4 text-green-600"/>:<DocumentDuplicateIcon className="h-4 w-4"/>}</button></div>:!error?<div role="status" aria-label="Loading gift code" className="mx-auto h-8 w-48 animate-pulse rounded-lg bg-gray-100 dark:bg-[#171717]"/>:null}
  {error&&<><p role="alert" className="mt-2 text-xs text-gray-500">{error}</p>{!code&&<button className="mt-2 text-sm underline" onClick={()=>setRetry(n=>n+1)}>Try again</button>}</>}
  <button className="pocket-cta-primary mt-4 w-full" onClick={()=>void copy(giftLink(id,secret),'link')}>{copied==='link'?'Link copied':'Copy gift link'}</button>
 </div>
}
