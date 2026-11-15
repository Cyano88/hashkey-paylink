import {useEffect,useRef,useState} from 'react'
import {PERSONAL_BANK_DAILY_USD} from '../../lib/purchaseLimits'
export type VerifiedProfile = {kycLevel?:'none'|'basic'|'advanced';kycCountry?:'NG'|'UG'}
import {pocketApiUrl} from '../lib/pocketRoutes'
export default function usePocketVerifiedLevel(getAccessToken:()=>Promise<string|null>,profile?:VerifiedProfile){
 const reader=useRef(getAccessToken);reader.current=getAccessToken
 const [level,setLevel]=useState<{level:'none'|'basic'|'advanced';dailyLimitUsd:number}|null>(null)
 useEffect(()=>{let active=true;const controller=new AbortController()
  void(async()=>{try{const token=await reader.current();if(!token)return;const response=await fetch(pocketApiUrl('/api/pocket/kyc'),{method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action:'limits'}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])}),data=await response.json();if(active&&response.ok&&data.ok&&['none','basic','advanced'].includes(data.level)&&Number.isFinite(data.dailyLimitUsd))setLevel({level:data.level,dailyLimitUsd:data.dailyLimitUsd})}catch{/* Never infer verified status when the server is unavailable. */}})()
  return()=>{active=false;controller.abort()}
 },[])
 return level ?? (profile?.kycLevel ? {level:profile.kycLevel,dailyLimitUsd:profile.kycLevel==='none'?0:PERSONAL_BANK_DAILY_USD[profile.kycLevel==='advanced'||profile.kycCountry==='UG'?'advanced':'basic']} : null)
}
