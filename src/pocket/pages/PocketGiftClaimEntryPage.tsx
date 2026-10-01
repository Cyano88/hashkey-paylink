import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketEmailLogin from '../components/PocketEmailLogin'
import usePocketIdentity from '../hooks/usePocketIdentity'
import {parseGiftLink} from '../features/gifts/pocketGift'
import {resolvePocketGiftCode} from '../api/pocketGiftsClient'
import {POCKET_ROUTES} from '../lib/pocketRoutes'
export default function PocketGiftClaimEntryPage(){
 const navigate=useNavigate(),identity=usePocketIdentity(),[value,setValue]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function submit(){
  if(busy)return;setBusy(true);setError('')
  try{
   let gift=parseGiftLink(value.trim())
   if(!gift){const token=await identity.getAccessToken();if(!token)throw Error('Sign in to claim your gift.');gift=parseGiftLink(await resolvePocketGiftCode({code:value,accessToken:token}))}
   if(!gift)throw Error('Enter a valid gift code or link.')
   navigate('/gift/'+gift.id+'#claim='+gift.secret)
  }catch(error){setError(error instanceof Error?error.message:'Gift could not be loaded. Try again.')}finally{setBusy(false)}
 }
 return <main data-pocket-colour-scope="stablecoins" className="mx-auto min-h-[100dvh] max-w-md bg-white px-6 py-6 text-gray-950 dark:bg-black dark:text-white"><PocketFlowHeader title="Claim a gift" onBack={()=>{if(!busy)navigate(POCKET_ROUTES.receive)}}/>{!identity.ready?<div role="status" aria-label="Loading" className="mt-8 h-32 animate-pulse rounded-xl bg-gray-100 dark:bg-[#171717]"/>:!identity.authenticated?<PocketEmailLogin/>:<><p className="mt-8 text-sm text-gray-500">Enter your gift code or paste a gift link.</p><form onSubmit={event=>{event.preventDefault();void submit()}}><label className="mt-6 block text-sm">Gift code<input value={value} onChange={event=>{setValue(event.target.value);setError('')}} disabled={busy} placeholder="ABCD-2345" maxLength={240} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="mt-2 w-full rounded-xl border border-gray-200 bg-transparent p-4 dark:border-[#262626]"/></label>{error&&<p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}<button disabled={busy||!value.trim()} className="pocket-cta-primary mt-6 w-full disabled:opacity-50">{busy?'Checking':'Continue'}</button></form></>}</main>
}
