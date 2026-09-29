import {useEffect,useRef,useState,type ReactNode} from 'react'
import {useNavigate} from 'react-router-dom'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { pocketApiUrl, POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import PocketKycGate from './PocketKycGate'
export default function PocketBankKycBoundary({children}:{children:ReactNode}){
 const identity=usePocketIdentity(),navigate=useNavigate(),reader=useRef(identity.getAccessToken);reader.current=identity.getAccessToken
 const [state,setState]=useState<'loading'|'allowed'|'required'|'error'>('loading'),[retry,setRetry]=useState(0)
 useEffect(()=>{let active=true;setState('loading');if(!identity.authenticated)return()=>{active=false};void(async()=>{try{const token=await reader.current();if(!token)throw Error();const r=await fetch(pocketApiUrl('/api/pocket/kyc'),{method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action:'limits'}),signal:AbortSignal.timeout(15000)});const b=await r.json();if(!r.ok||!b.ok||!['none','basic','advanced'].includes(b.level))throw Error();if(active)setState(b.level==='none'?'required':'allowed')}catch{if(active)setState('error')}})();return()=>{active=false}},[identity.authenticated,identity.user?.id,retry])
 if(!identity.authenticated||state==='allowed')return <>{children}</>
 if(state==='required')return <PocketKycGate onClose={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.home)}/>
 if(state==='error')return <div className="p-6 text-center text-sm"><p>Verification status could not load.</p><button className="pocket-cta-primary mt-4 px-6" onClick={()=>setRetry(n=>n+1)}>Try again</button></div>
 return <div role="status" aria-label="Checking verification" className="mx-4 mt-8 h-40 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5"/>
}
