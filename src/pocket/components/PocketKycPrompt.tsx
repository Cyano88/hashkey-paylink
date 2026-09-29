import {useEffect,useState} from 'react'
import PocketKycGate from './PocketKycGate'
import type {PocketKycPromptDetail} from '../lib/pocketKycAccess'
export default function PocketKycPrompt(){
 const [prompt,setPrompt]=useState<PocketKycPromptDetail|null>(null)
 useEffect(()=>{const show=(event:Event)=>setPrompt((event as CustomEvent<PocketKycPromptDetail>).detail);window.addEventListener('pocket:kyc-required',show);return()=>window.removeEventListener('pocket:kyc-required',show)},[])
 return prompt?<PocketKycGate advanced={prompt.code==='KYC_ADVANCED_REQUIRED'} limitReached={prompt.code==='KYC_DAILY_LIMIT'} remainingNgn={prompt.remainingNgn} onClose={()=>setPrompt(null)}/>:null
}
