import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import PocketFlowHeader from '../components/PocketFlowHeader'
import {parseGiftLink} from '../features/gifts/pocketGift'
import {POCKET_ROUTES} from '../lib/pocketRoutes'
export default function PocketGiftClaimEntryPage(){
 const navigate=useNavigate(),[link,setLink]=useState(''),[error,setError]=useState('')
 return <main data-pocket-colour-scope="stablecoins" className="mx-auto min-h-[100dvh] max-w-md bg-white px-6 py-6 text-gray-950 dark:bg-black dark:text-white"><PocketFlowHeader title="Claim a gift" onBack={()=>navigate(POCKET_ROUTES.receive)}/><p className="mt-8 text-sm text-gray-500">Open the gift link shared with you, or paste it below.</p><form onSubmit={event=>{event.preventDefault();const gift=parseGiftLink(link.trim());if(!gift){setError('Enter a valid Pocket gift link.');return}navigate('/gift/'+gift.id+'#claim='+gift.secret)}}><label className="mt-6 block text-sm">Gift link<input value={link} onChange={event=>{setLink(event.target.value);setError('')}} autoComplete="off" autoCapitalize="none" spellCheck={false} className="mt-2 w-full rounded-xl border border-gray-200 bg-transparent p-4 dark:border-[#262626]"/></label>{error&&<p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}<button className="pocket-cta-primary mt-6 w-full">Continue</button></form></main>
}
