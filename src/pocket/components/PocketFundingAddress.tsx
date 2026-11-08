import {useEffect,useState} from 'react'
import {Copy,Check} from './PocketIcons'
/** Copy is deliberately inline so it does not compete with the funding action. */
export default function PocketFundingAddress({address}:{address:string}){
 const [copied,setCopied]=useState(false),[error,setError]=useState(false)
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),1800);return()=>clearTimeout(timer)},[copied])
 useEffect(()=>{setCopied(false);setError(false)},[address])
 return <div className="relative my-4"><div className="flex items-center gap-2 rounded-2xl bg-gray-50 p-3 dark:bg-white/5"><span className="min-w-0 flex-1 break-all text-left font-mono text-xs">{address}</span><button type="button" aria-label="Copy address" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" onClick={async()=>{try{await navigator.clipboard.writeText(address);setError(false);setCopied(true)}catch{setError(true)}}}>{copied?<Check className="h-4 w-4"/>:<Copy className="h-4 w-4"/>}</button></div>{copied&&<span role="status" className="absolute bottom-full right-0 mb-1 rounded-lg bg-gray-950 px-3 py-2 text-xs text-white">Address copied</span>}{error&&<p role="alert" className="mt-2 text-xs text-gray-500">Could not copy address. Try again.</p>}</div>
}
