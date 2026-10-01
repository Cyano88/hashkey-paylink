import {PocketGiftLanding} from '../features/gifts/PocketGiftExperience'
import type {GiftView} from '../features/gifts/pocketGift'
import {formatGiftCodeInput} from '../features/gifts/giftCode'
import {GiftCodeLoading} from '../features/gifts/PocketGiftRouteLoading'
import {useLayoutEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketEmailLogin from '../components/PocketEmailLogin'
import usePocketIdentity from '../hooks/usePocketIdentity'
import {parseGiftLink} from '../features/gifts/pocketGift'
import {resolvePocketGiftCode} from '../api/pocketGiftsClient'
import {POCKET_ROUTES} from '../lib/pocketRoutes'
export default function PocketGiftClaimEntryPage(){
 const navigate=useNavigate(),identity=usePocketIdentity(),[value,setValue]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[claimedGift,setClaimedGift]=useState<GiftView|null>(null)
 const inputRef=useRef<HTMLInputElement>(null),caret=useRef<number|null>(null)
 useLayoutEffect(()=>{if(caret.current!==null){inputRef.current?.setSelectionRange(caret.current,caret.current);caret.current=null}},[value])
 async function submit(){
  if(busy)return;setBusy(true);setError('')
  try{
   let gift=parseGiftLink(value.trim())
   if(!gift){const token=await identity.getAccessToken();if(!token)throw Error('Sign in to claim your gift.');const result=await resolvePocketGiftCode({code:value,accessToken:token});if(typeof result!=='string'){setClaimedGift(result.claimedGift);return}gift=parseGiftLink(result)}
   if(!gift)throw Error('Enter a valid gift code or link.')
   navigate('/gift/'+gift.id+'#claim='+gift.secret)
  }catch(error){setError(error instanceof Error?error.message:'Gift could not be loaded. Try again.')}finally{setBusy(false)}
 }
 if(claimedGift)return <PocketGiftLanding inApp gift={claimedGift} onRedeem={()=>{}} onDone={()=>navigate(POCKET_ROUTES.home,{replace:true})}/>
 return <main data-pocket-colour-scope="stablecoins" className="mx-auto min-h-[100dvh] max-w-md bg-white px-6 pb-8 pt-[max(1.5rem,var(--pocket-safe-top))] text-gray-950 dark:bg-black dark:text-white"><PocketFlowHeader centered title="Claim a gift" onBack={()=>{if(!busy)navigate(POCKET_ROUTES.receive)}}/>{!identity.ready?<GiftCodeLoading/>:!identity.authenticated?<PocketEmailLogin/>:<><p className="mt-8 text-sm text-gray-500">Enter your gift code or paste a gift link.</p><form onSubmit={event=>{event.preventDefault();void submit()}}><label className="mt-6 block text-sm">Gift code<input ref={inputRef} value={value} onChange={event=>{const raw=event.target.value,position=event.target.selectionStart??raw.length;const deleting=(event.nativeEvent as InputEvent).inputType?.startsWith('delete')??raw.length<value.length;const formatted=formatGiftCodeInput(raw,deleting);caret.current=formatted===raw?position:formatGiftCodeInput(raw.slice(0,position),deleting).length;setValue(formatted);setError('')}} disabled={busy} placeholder="ABCD-2345" maxLength={240} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="mt-2 w-full rounded-xl border border-gray-200 bg-transparent p-4 dark:border-[#262626]"/></label>{error&&<p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}<button disabled={busy||!value.trim()} className="pocket-cta-primary mt-6 w-full disabled:opacity-50">{busy?'Checking':'Continue'}</button></form></>}</main>
}
